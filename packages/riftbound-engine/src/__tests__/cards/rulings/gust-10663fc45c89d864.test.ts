/**
 * Ruling 10663fc45c89d864 — Gust (OGN-169 → ogn-169-298) · Reaction · Chaos · [1]
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Loose Cannon (Jinx legend, ogn-251-298) "At start of your Beginning Phase, draw 1 if you have one or fewer cards in
 *     your hand."
 *
 * Q: Can you react to Beginning-Phase triggers — e.g. Gust a unit into the Jinx player's hand in response to Jinx's trigger to
 *    stop the extra draw?
 * A: Yes. Jinx's ability ALWAYS triggers at the Beginning Phase and checks hand size on RESOLUTION. Gust (a Reaction) resolves
 *    first, the bounced unit makes it 2 cards, so Jinx draws nothing. Gusting a unit at that point also prevents its hold score.
 * Rules: 383 (triggered ability → chain; can be responded to), 340 (LIFO), 315.2 (Beginning Step triggers precede the
 *        Scoring Step), 469.2 (hold needs the unit still there at scoring).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const LOOSE_CANNON = "ogn-251-298";

/**
 * End of P2's turn 2. P1: Jinx legend, exactly ONE card in hand, and holds bf1 with a LONE 2-Might Scout (Gust-able).
 * P2: Gust in hand and a chaos rune to pay for it during P1's Beginning Phase (P2's pool empties at end of turn).
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .legend(P1, LOOSE_CANNON, "jinx")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 5, name: "Their Holder" }, "th")
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Lonely Card" }, "h1")
    .hand(P2, GUST, "gust")
    .rune(P2, "chaos", { alias: "p2rune" });
}

/** P2 ends the turn; P1's Beginning Phase opens with Jinx's trigger on the chain; P1 passes → P2's priority. */
async function atP2Response(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jinx", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 10663fc45c89d864 — Gust in response to Jinx's Beginning-Phase trigger stops the draw (and the hold)", () => {
  test("Beginning-Phase triggers are chain items you can react to: Jinx's trigger is created regardless (P1 has 1 card), nothing is drawn or scored yet, and P2 gets priority with Gust legal", async () => {
    const game = await atP2Response();
    expect(game.p1.hand()).toEqual(["h1"]);
    expect(game.p1.points()).toBe(0);
    await game.p2.tapRune("p2rune");
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["jinx", "gust"]);
  });

  test("LIFO: Gust resolves first — Scout goes to P1's hand (2 cards now) — then Jinx's trigger resolves, sees 2 cards and draws NOTHING; P1 ends the phase sequence with h1 + scout + the normal Draw-Phase card only", async () => {
    const game = await atP2Response();
    await game.p2.tapRune("p2rune");
    await game.p2.cast("gust", { targets: "scout" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p1.hand().sort()).toEqual(["h1", "scout"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["jinx"]); // still pending — the check happens on resolution
    const deck0 = game.p1.deck().length;
    await game.settle(); // Jinx resolves (no draw) → scoring → channel → draw → main
    expect(game.phase()).toBe("main");
    expect(deck0 - game.p1.deck().length).toBe(1); // only the rule draw
    expect(game.p1.hand()).toHaveLength(3); // h1 + scout + rule draw (4 had Jinx drawn)
    expect(game.violations()).toEqual([]);
  });

  test("nuance: Gusting the lone holder at that point ALSO prevents scoring — bf1 is empty at the Scoring Step, so P1 gets no hold point and loses control of bf1", async () => {
    const game = await atP2Response();
    await game.p2.tapRune("p2rune");
    await game.p2.cast("gust", { targets: "scout" });
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
  });

  test("control: unanswered, Jinx resolves with 1 card in hand → draws 1; then the Scout holds bf1 for a point; hand = h1 + Jinx draw + rule draw = 3", async () => {
    const game = await atP2Response();
    await game.p2.passPriority();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(1);
  });
});
