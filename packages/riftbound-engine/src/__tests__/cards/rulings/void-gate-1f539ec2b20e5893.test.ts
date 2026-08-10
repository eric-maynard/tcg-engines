/**
 * Ruling 1f539ec2b20e5893 — Void Gate (OGN-296 → ogn-296-298) · Battlefield
 *   "Spells and abilities deal 1 Bonus Damage to units here."
 *   × Icathian Rain (OGN-248 → ogn-248-298) 7 + [rainbow]×3 "Deal 2 to a unit." ×6
 *
 * Q: Do battlefield effects like Void Gate work even if you don't control the battlefield?
 * A: Yes. Battlefield abilities that don't say "you" are symmetric — they apply regardless of who controls the
 *    battlefield. Example: Icathian Rain aimed at units on an opponent-controlled Void Gate deals 6 × 3.
 * Rules: 190 (battlefield abilities), 522 (statics apply continuously), 417.4 (bonus damage per instance).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import type { Seat } from "../../../harness";

const VOID_GATE = "ogn-296-298";
const ICATHIAN_RAIN = "ogn-248-298";
const FALLING_COMET = "ogn-085-298"; // 5 · Deal 6 to a unit at a battlefield

/** P1's turn; a live Void Gate controlled by `gateController`; P2's 20-Might Titan stands on it, P2's Homebody in base. */
function board(gateController: Seat | null) {
  return scenario()
    .resources(P1, { energy: 12, power: { fury: 3 } })
    .battlefield("gate", { controller: gateController, def: VOID_GATE, inert: false, owner: P2 })
    .unit(P2, "gate", { might: 20, name: "Titan" }, "titan")
    .unit(P2, "base", { might: 20, name: "Homebody" }, "homebody")
    .hand(P1, ICATHIAN_RAIN, "rain")
    .hand(P1, FALLING_COMET, "comet");
}

describe("Ruling 1f539ec2b20e5893 — Void Gate's bonus damage applies no matter who controls it", () => {
  test("the ruling's example: Icathian Rain, all six instances at the Titan on an OPPONENT-controlled Void Gate → 6 × (2+1) = 18", async () => {
    const game = await board(P2).build();
    expect(game.gameState.battlefields.gate?.controller).toBe(P2);
    await game.p1.cast("rain", { targets: ["titan", "titan", "titan", "titan", "titan", "titan"] });
    expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.state("titan").damage).toBe(18);
    expect(game.violations()).toEqual([]);
  });

  test("P1's Falling Comet at the Titan on the P2-controlled Gate deals 6 + 1 = 7", async () => {
    const game = await board(P2).build();
    await game.p1.cast("comet", { targets: "titan" });
    await game.settle();
    expect(game.state("titan").damage).toBe(7);
  });

  test("same +1 when P1 controls the Gate (7) and when NOBODY controls it (7) — control is irrelevant", async () => {
    const mine = await board(P1).build();
    expect(mine.gameState.battlefields.gate?.controller).toBe(P1);
    await mine.p1.cast("comet", { targets: "titan" });
    await mine.settle();
    expect(mine.state("titan").damage).toBe(7);

    const nobodys = await board(null).build();
    expect(nobodys.gameState.battlefields.gate?.controller).toBeNull();
    await nobodys.p1.cast("comet", { targets: "titan" });
    await nobodys.settle();
    expect(nobodys.state("titan").damage).toBe(7);
  });

  test("only units HERE: instances aimed at the Homebody in base get no bonus (3 at Titan → 9, 3 at Homebody → 6)", async () => {
    const game = await board(P2).build();
    await game.p1.cast("rain", { targets: ["titan", "titan", "titan", "homebody", "homebody", "homebody"] });
    await game.settle();
    expect(game.state("titan").damage).toBe(9);
    expect(game.state("homebody").damage).toBe(6);
  });
});
