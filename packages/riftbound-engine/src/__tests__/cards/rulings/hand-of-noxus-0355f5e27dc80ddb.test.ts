/**
 * Ruling 0355f5e27dc80ddb — Hand of Noxus (Darius legend, OGN-253 → ogn-253-298)
 *     "[Exhaust]: [Reaction], [Legion] — [Add] [1]. (Abilities that add resources can't be reacted to. Get the effect if you've
 *      played a card this turn.)"
 *   × Discipline (ogn-058-298) / a vanilla unit as "a card played this turn".
 *
 * Q: How does the Darius legend work?
 * A: Requirement: you must already have played a (main-deck) card this turn (Legion). Cost: exhaust the legend. Timing: Reaction —
 *    usable on your turn AND the opponent's, given priority + Legion. It is an [Add] ability: resolves immediately, no chain item,
 *    can't be responded to; using it mid-chain leaves the rest of the chain intact. The [1] must be spent this turn or it is lost
 *    (it is energy in your pool, not an un-exhausted rune).
 * Rules: 819 (Legion), 429.3 / 158 ([Add] abilities resolve at once, off the chain), 151.3 (Reaction), 317.2 (pools empty at end of turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HAND_OF_NOXUS = "ogn-253-298";
const DISCIPLINE = "ogn-058-298";
const GRUNT = { cardType: "unit", energyCost: 1, might: 1, name: "Grunt" } as const;

/** P1's turn, Darius legend ready, a 1-cost Grunt in hand and exactly [1]; a rune to show the [Add] is not a rune untap. */
function myTurn() {
  return scenario()
    .legend(P1, HAND_OF_NOXUS, "darius")
    .resources(P1, { energy: 1 })
    .rune(P1, "fury", { alias: "r1", exhausted: true })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, GRUNT, "grunt");
}

describe("Ruling 0355f5e27dc80ddb — how the Hand of Noxus legend works", () => {
  test("Legion requirement: with NO card played yet this turn the ability can't be used; after playing the Grunt it can", async () => {
    const game = await myTurn().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.can("activate", "darius")).toBe(false);
    await game.p1.play("grunt");
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.p1.can("activate", "darius")).toBe(true);
  });

  test("activation EXHAUSTS the legend and ADDS [1] immediately — no chain item, nothing for the opponent to respond to; it is extra energy, the exhausted rune stays exhausted", async () => {
    const game = await myTurn().build();
    await game.p1.play("grunt");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    await game.p1.activate("darius");
    expect(game.state("darius").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // P2 never got a window
    expect(game.state("r1").isExhausted).toBe(true); // "not a rune": nothing was readied
    // Once per exhaust: can't go again while exhausted.
    expect(game.p1.can("activate", "darius")).toBe(false);
  });

  test("mid-chain use doesn't end the chain: with Discipline on the chain P1 exhausts Darius (+1 at once), Discipline is still there and still resolves afterwards", async () => {
    const game = await myTurn().resources(P1, { energy: 3 }).hand(P1, DISCIPLINE, "disc").build();
    await game.p1.play("grunt"); // Legion on
    await game.settle();
    await game.p1.cast("disc", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]);
    expect(game.p1.energy()).toBe(0);
    await game.p1.activate("darius");
    expect(game.p1.energy()).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]); // untouched, still respondable
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("ally").might).toBe(4);
    expect(game.p1.energy()).toBe(1); // the added energy is still floating this turn
  });

  test("the added [1] must be used this turn: unspent, it is gone once the turn ends (pool emptied), and it doesn't come back next turn", async () => {
    const game = await myTurn().build();
    await game.p1.play("grunt");
    await game.settle();
    await game.p1.activate("darius");
    expect(game.p1.energy()).toBe(1);
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.energy()).toBe(0);
    expect(game.trace().expiration.some((p) => (p.poolsEmptied?.[P1]?.energy ?? 0) >= 1)).toBe(true);
  });

  test("Reaction timing on the OPPONENT's turn: having played a card this turn (a Discipline in response), P1 — holding priority on P2's chain — may exhaust Darius for [1] there and then", async () => {
    const game = await scenario()
      .active(P2)
      .legend(P1, HAND_OF_NOXUS, "darius")
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 4 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, DISCIPLINE, "disc")
      .hand(P2, DISCIPLINE, "p2disc1")
      .hand(P2, DISCIPLINE, "p2disc2")
      .build();
    // P2 opens a chain; P1 responds with Discipline (a card played this turn), everything resolves.
    await game.p2.cast("p2disc1", { targets: "foe" });
    await game.p2.passPriority();
    expect(game.p1.can("activate", "darius")).toBe(false); // no card played by P1 yet this turn
    await game.p1.cast("disc", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    // Later in P2's turn P2 casts again; P1 gets priority and now meets Legion → Darius is usable off-turn.
    await game.p2.cast("p2disc2", { targets: "foe" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "darius")).toBe(true);
    const e0 = game.p1.energy();
    await game.p1.activate("darius");
    expect(game.p1.energy()).toBe(e0 + 1);
    expect(game.state("darius").isExhausted).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["p2disc2"]); // no item added, chain intact
    expect(game.violations()).toEqual([]);
  });
});
