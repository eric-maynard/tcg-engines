/**
 * Ruling f13869f9cbbb6dac — Pack of Wonders (OGN-181 → ogn-181-298) · Gear
 *   "[Exhaust]: Return another friendly gear, unit, or facedown card to its owner's hand."
 *
 * Q: Can Pack of Wonders choose cards in the trash?
 * A: No. Unless a card explicitly says otherwise, choices are made among objects ON THE BOARD; the trash is
 *    a different zone and must be named to be reachable.
 * Rules: 355.9 (a choice picks objects the effect describes), 130 (zones), 428 (board vs trash).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PACK = "ogn-181-298";

/** P1's turn. On the board: Pack + a loose gear + a unit + a facedown card at P1's bf1. In the trash: a gear and a unit. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .gear(P1, PACK, "pack")
    .gear(P1, { cardType: "gear", name: "Trinket" }, "trinket")
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .facedown(P1, "bf1", { cardType: "spell", energyCost: 1, name: "Secret" }, "secret")
    .trash(P1, { cardType: "gear", name: "Broken Trinket" }, "junkGear")
    .trash(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Corpse" }, "corpse")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe");
}

function offeredTargets(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>): string[] {
  const field = game.p1.option("activate", "pack")?.fields.find((f) => f.arg === "targets" || f.name === "targets");
  return ((field?.options ?? []).flat() as string[]).slice().sort();
}

describe("Ruling f13869f9cbbb6dac — Pack of Wonders reaches the board only, never the trash", () => {
  test("premise: the two trash cards really are in the trash and would be legal 'friendly gear/unit' shapes on the board", async () => {
    const game = await board().build();
    expect(game.zoneOf("junkGear")).toBe("trash");
    expect(game.zoneOf("corpse")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["corpse", "junkGear"]);
  });

  test("the choice offers the friendly board permanents and the facedown card — and neither trash card", async () => {
    const game = await board().build();
    const options = offeredTargets(game);
    expect(options).toEqual(expect.arrayContaining(["trinket", "holder", "secret"]));
    expect(options).not.toContain("junkGear");
    expect(options).not.toContain("corpse");
    expect(options).not.toContain("pack"); // "another"
    expect(options).not.toContain("foe"); // "friendly"
  });

  test("a board choice works normally: the Trinket goes back to P1's hand", async () => {
    const game = await board().build();
    await game.p1.activate("pack", 0, { targets: "trinket" });
    await game.settle();
    expect(game.zoneOf("trinket")).toBe("hand");
    expect(game.zoneOf("junkGear")).toBe("trash");
    expect(game.zoneOf("corpse")).toBe("trash");
    expect(game.state("pack").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("naming a trash card as the choice is rejected and the trash is untouched", async () => {
    const game = await board().build();
    const r = await game.p1.try((p) => p.activate("pack", 0, { targets: "corpse" }));
    expect(r.ok).toBe(false);
    expect(game.state("pack").isExhausted).toBe(false);
    expect(game.zoneOf("corpse")).toBe("trash");
    expect(game.p1.hand()).not.toContain("corpse");
  });
});
