/**
 * Ruling 012ae43c41524a98 — Promising Future (OGN-115 → ogn-115-298, Spell, [5][mind])
 *   "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest.
 *    Starting with the next player, each player plays those cards, ignoring Energy costs."
 *   × Brynhir Thundersong (ogn-026-298, 6, 5 Might) "When you play me, opponents can't play cards this turn."
 *
 * Q: Does Brynhir stop an opponent's card chosen with Promising Future from being played?
 * A: Only if Brynhir's play effect RESOLVED BEFORE Promising Future instructs that opponent to play — then the
 *    instructed play is skipped as impossible and the chosen card stays banished. If Brynhir herself is one of
 *    the chosen cards she stops nothing: every chosen card is already on the chain / queued for finalization
 *    before her play effect exists; even an opponent's chosen SPELL that resolves after her trigger still resolves
 *    ("play" = put on the chain, not resolve).
 * Rules: 358.3.a, 354.2, 354.3, 383.4.a.2, 337.1.b, 419.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const BRYNHIR = "ogn-026-298";
const U = (n: number) => ({ cardType: "unit", energyCost: 3, might: n, name: `Future Unit ${n}` });
/** A plain 2-cost spell with no power cost: "Draw 1." (P2's chosen spell in the spell case). */
const INSIGHT = { abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }], cardType: "spell", energyCost: 2, name: "Insight (inline)", timing: "standard" };

/** Cast Promising Future however the engine offers it (it should need no targets). */
async function castPromisingFuture(game: Game): Promise<void> {
  const opt = game.p1.option("cast", "pf");
  expect(opt).toBeDefined();
  const targets = opt?.fields.find((f) => f.name === "targets");
  if (targets?.options?.length) {
    const first = targets.options[0];
    await game.p1.cast("pf", { targets: (Array.isArray(first) ? first : [first]) as string[] });
  } else {
    await game.p1.cast("pf");
  }
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/** Each player, shown their own top 5, banishes one: P1 takes `mine`, P2 takes `theirs` (both are decisions of that seat). */
async function eachPlayerBanishesOne(game: Game, mine: string, theirs: string): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    if (d?.seat === P1) {
      const offered = d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
      expect(offered).toContain(mine);
      expect(offered).toHaveLength(5);
      await game.p1.pick(mine);
    } else {
      expect(d?.seat).toBe(P2);
      const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
      expect(offered).toContain(theirs);
      expect(offered).toHaveLength(5);
      await game.p2.pick(theirs);
    }
  }
}

/** Answer any location prompt for `seat` with base; pass priorities; stop at an open main phase. */
async function driveToOpen(game: Game): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick") {
      const base = d.options.find((o) => o.key === "base") ?? d.options[0];
      await game.seat(d.seat).pick(base?.key as string);
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).no();
    } else {
      return;
    }
  }
}

describe("Ruling 012ae43c41524a98 — Brynhir Thundersong × Promising Future", () => {
  // Case 1 — Brynhir resolved first. Expected: P1 plays Brynhir, her trigger resolves (P2 can't play cards this
  // turn); P1 casts Promising Future; P1 banishes a3, P2 banishes b2, rest recycled; starting with P2: P2's
  // instructed play is impossible → skipped, b2 REMAINS in P2's banishment; P1 plays a3 free. Actual: Promising
  // Future is wired as "re-play a unit on the board" (it even demands a board target) — no look/banish/play flow.
  test("ruling 012ae43c41524a98 — Brynhir resolved before PF: the opponent's chosen card stays banished, yours is played (engine: PF has no look/banish/play implementation)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 11, power: { mind: 1 } }) // 6 Brynhir + 5 PF
      .deck(P1, [U(1), U(2), U(3), U(4), U(5), U(6)], ["a1", "a2", "a3", "a4", "a5", "a6"])
      .deck(P2, [U(1), U(2), U(3), U(4), U(5), U(6)], ["b1", "b2", "b3", "b4", "b5", "b6"])
      .hand(P1, BRYNHIR, "bryn")
      .hand(P1, PROMISING_FUTURE, "pf")
      .build();
    await game.p1.play("bryn");
    await game.settle(); // her play trigger resolves: opponents can't play cards this turn
    expect(game.zoneOf("bryn")).toBe("base");
    expect(game.chain()).toEqual([]);
    await castPromisingFuture(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await eachPlayerBanishesOne(game, "a3", "b2");
    await driveToOpen(game);
    // P2's play was skipped as impossible (358.3.a): b2 is still banished, never reached the board.
    expect(game.zoneOf("b2")).toBe("banishment");
    expect(game.p2.units()).not.toContain("b2");
    // P1's card was played, ignoring its energy cost.
    expect(game.p1.units()).toContain("a3");
    expect(game.p1.energy()).toBe(0);
    // The rest were recycled: the 6th card is now on top of each deck.
    expect(game.p1.deck()[0]).toBe("a6");
    expect(game.p2.deck()[0]).toBe("b6");
    expect(game.zoneOf("pf")).toBe("trash");
  });

  // Case 2 — Brynhir is P1's chosen card. Expected: both chosen cards are pending on the chain before Brynhir's
  // play effect exists; starting with P2, b2 is played (P2 picks its location), then Brynhir; her trigger
  // resolves afterwards and stops nothing already chosen — b2 IS on P2's board. Actual: see above.
  test("ruling 012ae43c41524a98 — Brynhir chosen WITH PF does not stop the opponent's chosen unit (engine: PF unimplemented)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { mind: 1 } })
      .deck(P1, [BRYNHIR, U(2), U(3), U(4), U(5), U(6)], ["bryn", "a2", "a3", "a4", "a5", "a6"])
      .deck(P2, [U(1), U(2), U(3), U(4), U(5), U(6)], ["b1", "b2", "b3", "b4", "b5", "b6"])
      .hand(P1, PROMISING_FUTURE, "pf")
      .build();
    await castPromisingFuture(game);
    await eachPlayerBanishesOne(game, "bryn", "b2");
    // "Starting with the next player": the first play decision (location) belongs to P2.
    const first = game.decision();
    if (first?.kind === "pick") {
      expect(first.seat).toBe(P2);
    }
    await driveToOpen(game);
    expect(game.p2.units()).toContain("b2"); // not stopped
    expect(game.p1.units()).toContain("bryn"); // played free (6-cost with 0 energy left)
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.banishment()).not.toContain("b2");
    expect(game.chain()).toEqual([]);
  });

  // Case 3 — the opponent's chosen card is a SPELL and Brynhir is P1's chosen card. Expected: P2's spell is put on
  // the chain (played) before Brynhir's play effect exists; even if her trigger resolves before the spell does, the
  // spell still resolves — P2 draws its card. Actual: see above.
  test("ruling 012ae43c41524a98 — an opponent's chosen SPELL still resolves even though Brynhir's trigger may resolve first (engine: PF unimplemented)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { mind: 1 } })
      .deck(P1, [BRYNHIR, U(2), U(3), U(4), U(5), U(6)], ["bryn", "a2", "a3", "a4", "a5", "a6"])
      .deck(P2, [INSIGHT, U(2), U(3), U(4), U(5), U(6)], ["insight", "b2", "b3", "b4", "b5", "b6"])
      .hand(P1, PROMISING_FUTURE, "pf")
      .build();
    const p2Hand = game.p2.hand().length;
    await castPromisingFuture(game);
    await eachPlayerBanishesOne(game, "bryn", "insight");
    await driveToOpen(game);
    expect(game.p1.units()).toContain("bryn");
    // The spell was played (chain) and resolved: it is in P2's trash and P2 drew 1 (b6, the recycled-then-top card).
    expect(game.zoneOf("insight")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  // Premise shared by every case. Expected: Promising Future chooses no targets and, on resolution, asks EACH player
  // to pick one of their own top 5. Actual: the cast demands a board unit as "target" and never looks at a deck.
  test("ruling 012ae43c41524a98 — PF needs no target and prompts each player to banish one of their top 5 (engine: targets a board unit instead)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { mind: 1 } })
      .deck(P1, [U(1), U(2), U(3), U(4), U(5), U(6)], ["a1", "a2", "a3", "a4", "a5", "a6"])
      .deck(P2, [U(1), U(2), U(3), U(4), U(5), U(6)], ["b1", "b2", "b3", "b4", "b5", "b6"])
      .hand(P1, PROMISING_FUTURE, "pf")
      .build();
    expect(game.p1.can("cast", "pf")).toBe(true);
    expect(game.p1.option("cast", "pf")?.fields.filter((f) => f.name === "targets")).toEqual([]);
    await castPromisingFuture(game);
    await eachPlayerBanishesOne(game, "a1", "b1");
  });
});
