/**
 * Interaction: The Grand Plaza (ogn-293-298) · Battlefield
 *     "When you hold here, if you have 7+ units here, you win the game."          — an intervening-"if" Hold Effect
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · [Reaction] "Return a unit at a battlefield with 3 [Might] or less to
 *     its owner's hand."                                                            — P2's response
 *   × Shen, Kinkou (ogn-241-298) · Champion Unit · Order · 3+[order] · 3 Might · [Reaction] ("… including to a
 *     battlefield you control") [Shield 2] [Tank]                                  — P1's would-be seventh body
 *
 * Rules: 315.2.b (Scoring Step: the turn player Holds), 383.4.d / 383.4.d.2.b (a Hold Effect is put on the chain as a
 * Pending Item when the hold + point happen), 383.2.a.1 (an "if" immediately after the condition is PART OF THE
 * CONDITION — sampled once when the event is processed, never re-checked on resolution; Sona example: removed in
 * response, still resolves), 383.2.c (conditions are evaluated right after the inciting event), 383.4.d.2.c (the hold
 * point is independent of the Hold Effect), 337.4 (after finalization the item's controller gets priority first),
 * 334.2 (pending items are processed only via FEPR — no chain, no priority, if nothing triggered), 186.1 (a token
 * leaving the board ceases to exist). Riftjudge: FAQs #1423/#1676 ("react to add units") are deprecated.
 *
 * Question:
 *   (a) TRUE→FALSE. P1 (3 points) starts the turn controlling the Plaza with exactly 7 units, one a 2-Might token.
 *       Scoring Step: does the win trigger go on the chain? P2 Gusts the token in response (6 left) — does P1 still win?
 *   (b) FALSE→TRUE attempt. P1 holds with 6 and has Shen (Reaction) in hand plus the runes to pay: is there ANY
 *       window inside the Scoring Step to drop Shen as the seventh before/while the condition is checked?
 *   (c) Is the ordinary hold point scored in both lines?
 *
 * Expected: (a) hold → 3→4; 7 present at that moment → the ability is finalized on the chain (no targets); P1 then P2
 * get priority; Gust resolves first, the token goes "to hand" and ceases to exist (6 left); the Plaza item resolves
 * WITHOUT re-counting → P1 wins. (b) 6 at the only sampling moment → nothing is put on the chain, no priority for
 * anyone between Scoring and Channel/Draw; P1 arrives in the main phase on 4 points; playing Shen there (7 now) does
 * nothing until the NEXT hold — which then wins. (c) yes, +1 in both lines, before/independent of the trigger.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GRAND_PLAZA = "ogn-293-298";
const GUST = "ogn-169-298";
const SHEN = "ogn-241-298";

/** A 2-Might unit TOKEN (inline) — Gust-able (≤3) and, being a token, it ceases to exist when bounced (186.1). */
const SAND_SOLDIER = { cardType: "unit", isToken: true, might: 2, name: "Sand Soldier" } as const;

/**
 * P2 is about to end turn 2. Victory Score 8; P1 on 3, P2 on 0. P1 owns + controls a LIVE Grand Plaza holding
 * `n` units: n−1 vanilla 1-Might Citizens and one 2-Might Sand Soldier token. P2 controls "other" with a 2-Might
 * Guard (so Gust also has a non-Plaza candidate), holds Gust and one ready chaos rune (pools empty at turn end, so the
 * Gust is paid from the rune). P1 holds Shen, Kinkou and has 4 order runes (3 to tap + 1 to recycle for [order]).
 */
function plaza(n: number) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .points(P1, 3)
    .battlefield("plaza", { controller: P1, def: GRAND_PLAZA, inert: false, owner: P1 })
    .battlefield("other", { controller: P2 })
    .unit(P2, "other", { might: 2, name: "P2 Guard" }, "guard");
  for (let i = 0; i < n - 1; i++) {
    b.unit(P1, "plaza", { might: 1, name: `Citizen ${i}` }, `c${i}`);
  }
  return b
    .unit(P1, "plaza", SAND_SOLDIER, "tok")
    .rune(P2, "chaos", { alias: "p2rune" })
    .hand(P2, GUST, "gust")
    .runes(P1, "order", 4)
    .hand(P1, SHEN, "shen");
}

const plazaItem = expect.objectContaining({ cardId: "plaza", controller: P1, name: "The Grand Plaza", triggered: true, type: "ability" });

/** (a) P2 ends the turn → P1's Beginning Phase; the Scoring Step holds the Plaza with 7 → the Hold Effect is on the chain. */
async function sevenHeld(): Promise<{ game: Game; endTurn: Awaited<ReturnType<Game["p2"]["endTurn"]>> }> {
  const game = await plaza(7).build();
  expect(game.p1.units("plaza")).toHaveLength(7);
  expect(game.state("tok")).toMatchObject({ isToken: true, might: 2, zone: "battlefield-plaza" });
  const endTurn = await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  return { endTurn, game };
}

/** …P1 passes, P2 taps its rune and Gusts the token; both pass once → Gust (top) resolves, the Plaza item remains. */
async function tokenGustedInResponse(): Promise<Game> {
  const { game } = await sevenHeld();
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.tapRune("p2rune");
  await game.p2.cast("gust", { targets: "tok" });
  expect(game.chain().map((i) => i.cardId)).toEqual(["plaza", "gust"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // LIFO: Gust resolves
  expect(game.zoneOf("gust")).toBe("trash");
  return game;
}

describe("(a) TRUE at the hold → the win trigger is on the chain and survives the count dropping to 6", () => {
  test("Scoring Step: P1 holds (3 → 4, rule 383.4.d.2.c) and — 7 units here at that moment — the Plaza's Hold Effect is put on the chain as ONE finalized, target-less triggered item of P1's; game not over yet; still the Beginning Phase", async () => {
    const { game } = await sevenHeld();
    expect(game.p1.points()).toBe(4);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([plazaItem]);
    const raw = game.gameState.interaction?.chain?.items ?? [];
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ cardId: "plaza", controller: P1, status: "finalized", triggered: true });
    expect(raw[0]?.targets ?? []).toEqual([]); // nothing to choose at finalization
    expect(game.isOver()).toBe(false);
  });

  test("priority: P1 (the item's controller) is asked first, then P2 (337.4) — the only thing executed by P2's endTurn was the endTurn itself", async () => {
    const { game, endTurn } = await sevenHeld();
    expect(endTurn.executed.filter((m) => m.auto !== true).map((m) => m.moveId)).toEqual(["endTurn"]);
    expect(endTurn.decision).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("P2's Gust may target the 2-Might token (and any ≤3 unit at a battlefield); it lands above the Plaza item and resolves first: the token is returned 'to hand' and, being a token, CEASES TO EXIST (186.1) — 6 units left, Plaza item still waiting, game not over", async () => {
    const { game } = await sevenHeld();
    await game.p1.passPriority();
    await game.p2.tapRune("p2rune");
    const offered = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];
    expect(offered).toContain("tok");
    expect(offered).toContain("guard");
    await game.p2.cast("gust", { targets: "tok" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.has("tok")).toBe(false);
    expect(game.zoneOf("tok")).toBe("gone");
    expect(game.p1.hand()).not.toContain("tok");
    expect(game.p1.units("plaza")).toHaveLength(6);
    expect(game.chain()).toEqual([plazaItem]);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("383.2.a.1 — the Plaza item then resolves WITHOUT re-checking the count: with only 6 units here P1 WINS THE GAME; points stay 4 (an alternate win, not a points win); chain empty, no further decision", async () => {
    const game = await tokenGustedInResponse();
    expect(game.p1.units("plaza")).toHaveLength(6);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Plaza item resolves
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(4);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("control — nobody responds: both pass and P1 wins straight away in the Beginning Phase, on 4 points, all 7 still there", async () => {
    const { game } = await sevenHeld();
    const s = await game.settle();
    expect(s.reason).toBe("game-over");
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(4);
    expect(game.p1.units("plaza")).toHaveLength(7);
  });
});

describe("(b) FALSE at the hold (6 units) → nothing triggers and there is NO window inside the Scoring Step to add Shen", () => {
  test("P2's endTurn runs P1's whole Beginning Phase uninterrupted: no chain item is ever created and the very first decision anyone sees is P1's MAIN-phase action menu — P1 already on 4 (hold point scored, 383.4.d.2.c), 2 runes channelled, 1 card drawn", async () => {
    const game = await plaza(6).build();
    expect(game.p1.units("plaza")).toHaveLength(6);
    const hand0 = game.p1.hand().length;
    const runes0 = game.p1.runes().length;
    const r = await game.p2.endTurn();
    expect(r.executed.filter((m) => m.auto !== true).map((m) => m.moveId)).toEqual(["endTurn"]);
    expect(r.decision).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.gameState.interaction?.chain?.items ?? []).toEqual([]);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(4);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // Draw Step happened
    expect(game.p1.runes()).toHaveLength(runes0 + 2); // Channel Step happened
    expect(game.gameState.battlefields.plaza?.controller).toBe(P1);
  });

  test("P2 was never given priority either: P2's Gust is still in hand, its rune untouched, and P2 has no decision pending", async () => {
    const game = await plaza(6).build();
    await game.p2.endTurn();
    expect(game.p2.hand()).toContain("gust");
    expect(game.state("p2rune").isExhausted).toBe(false);
    expect(game.p2.decision()).toBeNull();
    expect(game.actingSeat()).toBe(P1);
  });

  test("Shen (Reaction) could not be slipped in: it is still in P1's hand when the main phase opens; playing it to the Plaza NOW (tap 3, recycle 1 for [order]) makes 7 units here — and nothing happens: no trigger, no win, still 4 points", async () => {
    const game = await plaza(6).build();
    await game.p2.endTurn();
    expect(game.p1.hand()).toContain("shen");
    await game.p1.tapRunes(3);
    await game.p1.recycleRune(undefined, "order");
    expect(game.p1.can("play", "shen")).toBe(true);
    await game.p1.play("shen", { to: "plaza" });
    await game.settle();
    expect(game.zoneOf("shen")).toBe("battlefield-plaza");
    expect(game.p1.units("plaza")).toHaveLength(7);
    expect(game.chain()).toEqual([]);
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(4);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("…the seventh body only matters at the NEXT hold: P1 passes the turn, P2 passes back, and P1's following Scoring Step (7 here) puts the Plaza item on the chain and wins on resolution", async () => {
    const game = await plaza(6).build();
    await game.p2.endTurn();
    await game.p1.tapRunes(3);
    await game.p1.recycleRune(undefined, "order");
    await game.p1.play("shen", { to: "plaza" });
    await game.settle();
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.isOver()).toBe(false);
    await game.p2.endTurn(); // → P1's Beginning Phase: hold with 7
    expect(game.chain()).toEqual([plazaItem]);
    expect(game.p1.points()).toBe(5); // 4 + this turn's hold point
    const s = await game.settle();
    expect(s.reason).toBe("game-over");
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
