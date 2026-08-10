/**
 * Ruling 43f38d35d212f42d — Get Excited! (OGN-008 → ogn-008-298) · Action spell · [2][fury]
 *     "Discard 1. Deal its Energy cost as damage to a unit at a battlefield."
 *   × Last Breath (OGN-260 → ogn-260-298) · Action spell · [3][rainbow][rainbow]
 *     "Ready a friendly unit. It deals damage equal to its Might to an enemy unit at a battlefield."
 *
 * Q: Can an opponent play Get Excited! in response to Last Breath?
 * A: No — Get Excited! is an [Action], not a [Reaction]; only Reactions can be played onto an existing chain.
 *    Nuance: if Last Breath's (friendly) unit dies before it resolves, Last Breath does nothing.
 * Rules: 309.1/309.1.a (a chain = Closed State; only Reactions), 331.1, 359.3.f.2 (missing referent → no effect).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GET_EXCITED = "ogn-008-298";
const LAST_BREATH = "ogn-260-298";

/** Inline P2 Reaction: deal 3 to a unit (kills P1's 2-Might Striker in response). */
const SNIPE = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Snipe",
  timing: "reaction",
};

/**
 * P1's turn. P1: exhausted 2-Might Striker in base, Last Breath in hand with exactly its cost. P2: 4-Might Target at
 * P2's bf1, Get Excited! (+ a discardable card) and the inline Snipe reaction in hand, plenty of resources.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .resources(P2, { energy: 5, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Target" }, "target")
    .unit(P1, "base", { might: 2, name: "Striker" }, "striker", { exhausted: true })
    .hand(P1, LAST_BREATH, "lastbreath")
    .hand(P2, GET_EXCITED, "ge")
    .hand(P2, { cardType: "unit", energyCost: 3, might: 3, name: "Fodder" }, "fodder")
    .hand(P2, SNIPE, "snipe");
}

describe("Ruling 43f38d35d212f42d — Get Excited! (an Action) cannot answer Last Breath on the chain", () => {
  test("with Last Breath on the chain P2 has priority but Get Excited! is NOT legal (Closed State — Reactions only); the inline Reaction is", async () => {
    const game = await board().build();
    await game.p1.cast("lastbreath", { targets: ["striker", "target"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lastbreath", controller: P1 })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ge")).toBe(false);
    const r = await game.p2.try((p) => p.cast("ge", { targets: "target" }));
    expect(r.ok).toBe(false);
    expect(game.p2.can("cast", "snipe")).toBe(true); // a Reaction IS playable here
    expect(game.chain()).toHaveLength(1);
  });

  test("uninterrupted: Last Breath readies the Striker and it deals 2 (its Might) to the enemy Target", async () => {
    const game = await board().build();
    await game.p1.cast("lastbreath", { targets: ["striker", "target"] });
    await game.settle();
    expect(game.zoneOf("lastbreath")).toBe("trash");
    expect(game.state("striker").isReady).toBe(true);
    expect(game.state("target").damage).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: if the friendly unit dies in response (P2's Reaction kills the Striker), Last Breath resolves doing nothing — Target undamaged", async () => {
    const game = await board().build();
    await game.p1.cast("lastbreath", { targets: ["striker", "target"] });
    await game.p1.passPriority();
    await game.p2.cast("snipe", { targets: "striker" });
    await game.settle();
    expect(game.zoneOf("striker")).toBe("trash");
    expect(game.zoneOf("lastbreath")).toBe("trash");
    expect(game.state("target").damage).toBe(0);
    expect(game.zoneOf("target")).toBe("battlefield-bf1");
  });
});
