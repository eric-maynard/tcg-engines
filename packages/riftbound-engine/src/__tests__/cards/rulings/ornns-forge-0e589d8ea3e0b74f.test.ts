/**
 * Ruling 0e589d8ea3e0b74f — Ornn's Forge (SFD-213 → sfd-213-221) · Battlefield
 *   "While you control this battlefield, the first friendly non-token gear played each turn costs [1] less."
 *   × Darius, Trifarian (OGN-027 → ogn-027-298) — cited by analogy only ("second card" counted from when the
 *     ability became active); not on the board here.
 *
 * Q: I play a gear, THEN conquer Ornn's Forge. Does my next gear this turn get the discount?
 * A: No. The gear you play after conquering is not "the first friendly gear played this turn" — one was
 *    already played — and the Forge cannot look back / restart the count from when you gained it. Sequence:
 *    gear #1 (full price) → conquer Forge → gear #2 (full price, no discount).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const ORNNS_FORGE = "sfd-213-221";

const TRINKET_A = { cardType: "gear", energyCost: 2, name: "Trinket A" } as const;
const TRINKET_B = { cardType: "gear", energyCost: 2, name: "Trinket B" } as const;

/** P1's turn. The Forge is `controller`'s (or nobody's) and empty; P1 has a Scout (2) in base, two [2] gears in hand and [6]. */
function board(controller: typeof P1 | null) {
  return scenario()
    .battlefield("forge", { controller, def: ORNNS_FORGE, inert: false })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, TRINKET_A, "gearA")
    .hand(P1, TRINKET_B, "gearB")
    .resources(P1, { energy: 6 });
}

describe("Ruling 0e589d8ea3e0b74f — Ornn's Forge does not discount a gear played after conquering it if a gear was already played this turn", () => {
  test("control check: while P1 already controls the Forge, the FIRST gear of the turn costs [1] less (2 → 1) and the second costs full (2)", async () => {
    const game = await board(P1).build();
    await game.p1.play("gearA");
    expect(game.zoneOf("gearA")).toBe("base");
    expect(game.p1.energy()).toBe(6 - 1);
    await game.p1.play("gearB");
    expect(game.p1.energy()).toBe(6 - 1 - 2);
  });

  test("control check: conquering the Forge FIRST and then playing the first gear of the turn → discounted (2 → 1)", async () => {
    const game = await board(null).build();
    await game.p1.move("scout", "forge");
    await game.settle();
    expect(game.gameState.battlefields.forge?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    await game.p1.play("gearA");
    expect(game.p1.energy()).toBe(6 - 1);
  });

  test("the ruling: gear #1 at full price (Forge not yet controlled) → conquer the Forge → gear #2 is NOT discounted (it is not the first gear this turn)", async () => {
    const game = await board(null).build();
    // 1. First gear before conquering: no Forge control → full [2].
    await game.p1.play("gearA");
    expect(game.zoneOf("gearA")).toBe("base");
    expect(game.p1.energy()).toBe(4);
    // 2. Conquer Ornn's Forge.
    await game.p1.move("scout", "forge");
    await game.settle();
    expect(game.gameState.battlefields.forge?.controller).toBe(P1);
    // 3. Second gear: the Forge is controlled now, but a friendly gear was already played this turn → full [2].
    await game.p1.play("gearB");
    expect(game.zoneOf("gearB")).toBe("base");
    expect(game.p1.energy()).toBe(2); // 4 - 2, not 4 - 1
    expect(game.violations()).toEqual([]);
  });

  test("next turn the count resets: with the Forge held, P1's first gear of the new turn is discounted again", async () => {
    const game = await board(null).hand(P1, { cardType: "gear", energyCost: 2, name: "Trinket C" }, "gearC").build();
    await game.p1.play("gearA");
    await game.p1.move("scout", "forge");
    await game.settle();
    await game.p1.play("gearB");
    expect(game.p1.energy()).toBe(2);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 again
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.forge?.controller).toBe(P1);
    await game.p1.tapRunes(2);
    const before = game.p1.energy();
    await game.p1.play("gearC");
    expect(game.p1.energy()).toBe(before - 1);
  });
});
