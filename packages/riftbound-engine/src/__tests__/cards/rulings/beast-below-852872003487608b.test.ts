/**
 * Ruling 852872003487608b — Beast Below (SFD-132 → sfd-132-221) · Unit · Chaos · [7]+[chaos][chaos] · 8 Might
 *     "When you play me, return another friendly unit and an enemy unit to their owners' hands."
 *   (× Salvage OGN-224, cited only as the "up to one" errata contrast.)
 *
 * Q: Can Beast Below's play trigger be put on the chain when I control no OTHER friendly unit?
 * A: No — every required target must exist for the item to go on the chain, so the trigger never does (the enemy unit
 *    is untouched). Beast Below itself is still playable as a unit.
 * Rules: 355.6 / 383.3.c (a triggered ability with no legal required target is not added to the chain), 346 (play).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BEAST_BELOW = "sfd-132-221";

function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { chaos: 2 } })
    .hand(P1, BEAST_BELOW, "beast")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe");
}

describe("Ruling 852872003487608b — Beast Below with no other friendly unit: playable, but its trigger never reaches the chain", () => {
  test("no other friendly unit: Beast Below can be played and enters the board, its cost is paid, but NO trigger is put on the chain and the enemy unit stays put", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "beast")).toBe(true);
    await game.p1.play("beast");
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([]);
    // Straight back to P1's open main phase — nobody was asked anything, nothing to respond to.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.p2.hand()).not.toContain("foe");
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — with another friendly unit (and an enemy unit) the trigger DOES go on the chain naming both, and on resolution both return to hand", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Pal" }, "pal").build();
    await game.p1.play("beast");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "beast", controller: P1, targets: ["pal", "foe"], triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("pal")).toBe("hand");
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.zoneOf("beast")).toBe("base");
  });
});
