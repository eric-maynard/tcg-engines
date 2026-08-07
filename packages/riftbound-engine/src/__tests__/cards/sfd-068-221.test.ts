/**
 * Gearhead — sfd-068-221 · Unit · Mind · 5 energy · 3 might
 *
 *   [Accelerate] (You may pay [1][mind] as an additional cost to have me enter ready.)
 *   Each Equipment attached to me gives double its base Might bonus.
 *
 * Rules: 522 (static abilities are continuously re-applied), 716 (attachment).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "sfd-068-221";
const SKYFALL = "sfd-030-221"; // Skyfall of Areion — Equipment, +2 Might bonus
const DIRK = "sfd-009-221"; // Serrated Dirk — Equipment, +0 Might bonus

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1, mind: 1 } })
    .unit(P1, "base", CARD, "gh")
    .gear(P1, SKYFALL, "sky");
}

describe("Gearhead (sfd-068-221)", () => {
  test("doubles an attached Equipment's base Might bonus as soon as it is attached (rule 522)", async () => {
    const game = await board().build();
    expect(game.state("gh").might).toBe(3);
    await game.p1.do("equipCard", { equipmentId: "sky", unitId: "gh" });
    await game.settle();
    expect(game.state("gh").meta.equippedWith).toEqual(["sky"]);
    // 3 base + 2 (equipment bonus) + 2 (the doubling static) = 7
    expect(game.state("gh").might).toBe(7);
  });

  test("the doubling only applies to Gearhead — a plain unit gets the printed bonus once", async () => {
    const game = await board()
      .unit(P1, "base", { might: 3, name: "Squire" }, "squire")
      .build();
    await game.p1.do("equipCard", { equipmentId: "sky", unitId: "squire" });
    await game.settle();
    expect(game.state("squire").might).toBe(5);
  });

  test("equipping an on-board Equipment is a player-facing action (enumerated move)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .unit(P1, "base", CARD, "gh")
      .gear(P1, DIRK, "dirk")
      .build();
    const equipOptions = game.p1.legal().filter((o) => o.moveId === "equipCard");
    expect(equipOptions.length).toBeGreaterThan(0);
  });
});
