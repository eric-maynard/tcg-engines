/**
 * Ruling 1b81f71796adaf25 — Jinx, Loose Cannon (OGN-251 → ogn-251-298, legend)
 *     "At start of your Beginning Phase, draw 1 if you have one or fewer cards in your hand."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · "Return a unit at a battlefield with 3 [Might] or less to its
 *     owner's hand."
 *
 * Q: Is Jinx's ability a trigger that opens a chain the opponent can react to?
 * A: Yes ("At …" = trigger). It goes on the chain as link 1 every Beginning Phase regardless of hand size; the
 *    opponent may respond (e.g. Gust). The hand-size check happens on RESOLUTION, so bouncing a unit to bring the
 *    Jinx player to 2 cards makes the draw fizzle. This all happens before hold scoring.
 * Rules: 383 (triggered abilities → chain), 383.2.a.1 (condition checked at resolution), 340 (LIFO), 315.2 (Beginning
 *        Phase order).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LOOSE_CANNON = "ogn-251-298";
const GUST = "ogn-169-298";

/**
 * End of P2's turn 2. P1: legend Jinx, exactly ONE card in hand, holds bf1 with a 2-Might Small (Gust-able) and a
 * 5-Might Big (keeps the hold). P2: Gust in hand and two chaos runes to pay for it during P1's Beginning Phase.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .legend(P1, LOOSE_CANNON, "jinx")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Small" }, "small")
    .unit(P1, "bf1", { might: 5, name: "Big" }, "big")
    .hand(P1, { might: 1, name: "Lonely Card" }, "h1")
    .hand(P2, GUST, "gust")
    .runes(P2, "chaos", 2);
}

describe("Ruling 1b81f71796adaf25 — Jinx's Beginning Phase draw is a chain trigger that can be answered", () => {
  test("as P1's turn starts, Loose Cannon's trigger is chain link 1 in the Beginning Phase — before hold scoring, before any draw — and priority opens on it", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jinx", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(0); // hold not scored yet
    expect(game.p1.hand()).toEqual(["h1"]); // nothing drawn yet
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // the opponent may react
  });

  test("control: unanswered, the trigger resolves with P1 at 1 card → Jinx draws 1 (then the normal draw): hand 1 → 3, and the hold point follows", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(3); // h1 + Jinx draw + rule draw
    expect(game.p1.points()).toBe(1);
  });

  test("P2 reacts with Gust (link 2) bouncing Small to P1's hand; LIFO: Gust resolves first → P1 has 2 cards when Jinx resolves → NO Jinx draw (hand ends at 2 + the rule draw = 3, holding Small)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.tapRune();
    await game.p2.recycleRune();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "small" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["jinx", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.p1.hand().sort()).toEqual(["h1", "small"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["jinx"]); // Jinx still waiting
    const deckBefore = game.p1.deck().length;
    await game.settle(); // Jinx resolves: 2 cards → condition false → no draw; then scoring, channel, draw
    expect(game.phase()).toBe("main");
    expect(deckBefore - game.p1.deck().length).toBe(1); // only the Draw Phase card
    expect(game.p1.hand()).toHaveLength(3); // h1 + small + rule draw (would be 4 had Jinx drawn)
    expect(game.p1.hand()).toContain("small");
    expect(game.p1.points()).toBe(1); // Big still holds bf1 — scoring came after the chain
    expect(game.violations()).toEqual([]);
  });

  test("Jinx triggers every turn even when the condition is already false (3 cards in hand): the item still hits the chain, then resolves doing nothing", async () => {
    const game = await board()
      .hand(P1, { might: 1, name: "Extra A" }, "h2")
      .hand(P1, { might: 1, name: "Extra B" }, "h3")
      .build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jinx", triggered: true })]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(4); // 3 + rule draw only
  });
});
