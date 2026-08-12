/**
 * Ruling 865cb0445ca45d6a — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · Body · [9][body][body]
 *   "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish
 *    it. Play it, ignoring its cost, and recycle the rest."
 *   × Carnivorous Snapvine (ogn-149-298) 6 Might "When you play me, choose an enemy unit at a battlefield.
 *     We deal damage equal to our Mights to each other."
 *
 * Q: With Dazzling Aurora playing a Snapvine, does the opponent heal before or after the Snapvine damage?
 * A: The damage resolves first. Healing is part of the Expiration Step, which only runs once every
 *    end-of-turn ability has finished resolving — so the damage lands, kills if it is lethal, and only what
 *    survives is healed afterwards.
 * Rules: 317.1 (Ending Step: end-of-turn triggers), 317.2.3.c (the Expiration Step heals every unit, AFTER
 *        those triggers), 419.3 (an effect that plays a card).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const SNAPVINE = "ogn-149-298"; // 6 Might

/** P1's turn with Dazzling Aurora in play and a Snapvine on top of the deck; P2 holds bf1 with a Bruiser. */
function board(bruiserMight: number) {
  return scenario()
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: bruiserMight, name: "Bruiser" }, "bruiser")
    .deck(P1, [SNAPVINE], ["snap"]);
}

describe("Ruling 865cb0445ca45d6a — Snapvine's damage resolves during the Ending Step; the heal comes afterwards", () => {
  test("a 10-Might Bruiser survives the Snapvine but the damage really landed: the Expiration Step is what heals it, after the trigger", async () => {
    const game = await board(10).build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);

    await game.p1.passPriority();
    await game.p2.passPriority(); // Aurora resolves and plays Snapvine
    expect(game.zoneOf("snap")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snap", controller: P1, triggered: true })]);
    expect(game.state("bruiser").damage).toBe(0); // the fight has not happened yet

    await game.p1.passPriority();
    await game.p2.passPriority(); // Snapvine's play trigger resolves: 6 each way
    expect(game.zoneOf("snap")).toBe("trash"); // the 6-Might Snapvine took the Bruiser's 10 and died

    // The heal happened only once every ending ability was done — the Expiration Step's own step 3c.
    const [pass] = game.trace().expiration;
    expect(pass?.steps).toEqual(["heal", "expire", "empty-pools"]);
    expect(pass?.healed).toContain("bruiser");
    expect(game.state("bruiser").damage).toBe(0);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("the ordering is visible when the damage is lethal: a 6-Might Bruiser dies to the Snapvine, and no later heal can undo it", async () => {
    const game = await board(6).build();
    await game.p1.endTurn();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.passPriority();

    expect(game.zoneOf("bruiser")).toBe("trash"); // damage resolved before any heal
    expect(game.zoneOf("snap")).toBe("trash"); // and the trade went both ways
    expect(game.trace().expiration[0]?.healed).not.toContain("bruiser");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });
});
