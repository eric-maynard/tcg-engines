/**
 * Ruling 732053cd063c1ab7 — Ride the Wind (OGN-173 → ogn-173-298) "[Action] Move a friendly unit and ready it."
 *   × Promising Future (OGN-115 → ogn-115-298) "Each player looks at the top 5 …, banishes one …; starting with
 *     the next player, each player plays those cards, ignoring Energy costs."
 *   × Singularity (OGN-105 → ogn-105-298) "Deal 6 to each of up to two units."
 *
 * Q: On MY turn my Promising Future lets the opponent play Ride the Wind and move a unit ("Darius") onto an
 *    open battlefield. If that conquer would be their final point, do they win?
 * A: No. The Final Point via Conquer requires having scored every battlefield this turn; on my turn they have
 *    not, so they draw a card instead. Moreover: PF queues the next player's card first, so my Singularity sits
 *    above their Ride the Wind and resolves first — it can kill Darius before Ride the Wind resolves; and no
 *    showdown/conquer can begin while the chain is still resolving.
 * Rules: 471.1.b.1 (Final Point: all battlefields or draw), 337.1.b (PF play order), 340.1 (LIFO),
 *        344/348 (showdown only from an Open state after Cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const PROMISING_FUTURE = "ogn-115-298";
const SINGULARITY = "ogn-105-298";
const U = (n: number) => ({ cardType: "unit", energyCost: 3, might: n, name: `Filler Future ${n}` });

/**
 * P1's turn, first to 8; P2 sits on 7. bf1 is open (uncontrolled), P1 holds bf2. P2's "Darius" (vanilla 5) is in
 * P2's base. P1: PF in hand with 5 + [mind], plus [mind][mind] for Singularity's Power; Singularity on top of
 * P1's deck. P2: Ride the Wind on top of deck and [chaos] for its Power (Energy is ignored by PF).
 */
function board() {
  return scenario()
    .victoryScore(8)
    .points(P1, 3)
    .points(P2, 7)
    .resources(P1, { energy: 5, power: { mind: 3 } })
    .resources(P2, { power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 5, name: "Darius" }, "darius")
    .deck(P1, [SINGULARITY, U(2), U(3), U(4), U(5), U(6)], ["sing", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [RIDE_THE_WIND, U(2), U(3), U(4), U(5), U(6)], ["rtw", "b2", "b3", "b4", "b5", "b6"])
    .hand(P1, PROMISING_FUTURE, "pf");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** PF resolves; P1 banishes Singularity, P2 banishes Ride the Wind; P2's RTW (on Darius) is queued first → bf1. */
async function bothCardsQueued(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pf");
  await game.p1.passPriority();
  await game.p2.passPriority();
  // First pass: turn player picks first, then P2.
  let d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
  expect(d.options.map((o) => o.card ?? o.key)).toContain("sing");
  await game.p1.pick("sing");
  d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "from-revealed" });
  expect(d.options.map((o) => o.card ?? o.key)).toContain("rtw");
  await game.p2.pick("rtw");
  // Second pass starts with the NEXT player (P2): Ride the Wind is played first — Darius is its only friendly
  // unit, P2 chooses where it rides to.
  d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
  expect(d.options.map((o) => o.key)).toContain("battlefield-bf1");
  await game.p2.pick("battlefield-bf1");
  expect(game.p2.power("chaos")).toBe(0); // Power still paid, Energy ignored
  return game;
}

describe("Ruling 732053cd063c1ab7 — opponent's Ride the Wind off my Promising Future cannot take the Final Point on my turn", () => {
  test("PF play order: P2's Ride the Wind is finalized first (bottom), then P1's Singularity is played on top of it, choosing Darius", async () => {
    const game = await bothCardsQueued();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "sing" } });
    expect(d.options.map((o) => o.card ?? o.key)).toContain("darius");
    await game.p1.pick("darius");
    // "up to two" — stop at one.
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.decline();
    }
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["rtw", P2],
      ["sing", P1],
    ]);
    expect(game.p1.power("mind")).toBe(0);
    // Nothing has moved yet and no showdown exists while the chain is live.
    expect(game.locationOf("darius")).toBe("base");
    expect(showdown(game)?.active ?? false).toBe(false);
  });

  test("LIFO: Singularity resolves first and kills Darius (6 ≥ 5) BEFORE Ride the Wind resolves; RTW then does nothing — no move, no showdown, no conquer, P2 stays on 7", async () => {
    const game = await bothCardsQueued();
    await game.p1.pick("darius");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.decline();
    }
    await game.p1.passPriority();
    await game.p2.passPriority(); // Singularity
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.zoneOf("darius")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["rtw"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ride the Wind → its unit is gone
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p2.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("even if Darius DOES ride to bf1 (Singularity aimed elsewhere/nowhere): the showdown only begins once the chain is empty, P2 conquers bf1 on P1's turn — and at 7/8 without every battlefield scored P2 DRAWS 1 instead of winning", async () => {
    const game = await bothCardsQueued();
    // P1 names no target for Singularity ("up to two" → zero is legal).
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.decline();
    expect(game.chain().map((c) => c.cardId)).toEqual(["rtw", "sing"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Singularity: nothing
    expect(game.zoneOf("darius")).toBe("base"); // RTW still pending below — no move yet, no showdown yet
    expect(showdown(game)?.active ?? false).toBe(false);
    const handBefore = game.p2.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ride the Wind: Darius → bf1, readied
    expect(game.locationOf("darius")).toBe("bf1");
    expect(game.state("darius").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
    // Now (and only now) the showdown at bf1 is open; P2 (who staged it) has Focus.
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.p2.points()).toBe(7);
    await game.p2.passFocus();
    await game.p1.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    // Final Point denied → draw instead.
    expect(game.p2.points()).toBe(7);
    expect(game.p2.hand()).toHaveLength(handBefore + 1);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
