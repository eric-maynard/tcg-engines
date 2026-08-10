/**
 * Ruling 078c3208cfb1e70d — Riptide Rex (OGN-092 → ogn-092-298) · Unit · Mind · 6+[mind][mind] · 6 Might
 *   "When you play me, deal 6 to an enemy unit at a battlefield."
 *
 * Q: Rex deals 6 to an 8-Might unit; then a 2-Might unit moves onto that battlefield to start a showdown. Does the 8-Might
 *    unit heal before the showdown starts?
 * A: No. Damage is only healed at the end of a combat (its cleanup) and at end of turn — never before a showdown. The
 *    damaged 8-Might unit (6 marked) and the 2-Might attacker trade in that combat.
 * Rules: 465.2.e / 627 (heal after combat damage), 317.2 (end-of-turn heal), 143.2.a (lethal = damage ≥ Might).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIPTIDE_REX = "ogn-092-298";

/** P1's turn. P2 holds bf1 with an 8-Might Giant. P1: Rex in hand (6 + mind×2), a ready 2-Might Runt in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Giant" }, "giant")
    .unit(P1, "base", { might: 2, name: "Runt" }, "runt")
    .hand(P1, RIPTIDE_REX, "rex");
}

/** Play Rex; its trigger's only legal target (the Giant) is bound; resolve it. */
async function rexHitsGiant(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("rex");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("giant");
  }
  await game.settle();
  expect(game.zoneOf("rex")).toBe("base");
  expect(game.state("giant")).toMatchObject({ damage: 6, might: 8, zone: "battlefield-bf1" });
  return game;
}

describe("Ruling 078c3208cfb1e70d — damage from Riptide Rex is still on the unit when a showdown starts there", () => {
  test("Rex's play trigger deals 6 to the 8-Might Giant; it survives with 6 damage marked", async () => {
    const game = await rexHitsGiant();
    expect(game.state("giant").damage).toBe(6);
    expect(game.violations()).toEqual([]);
  });

  test("moving the 2-Might Runt in opens the showdown with the Giant STILL on 6 damage — nothing healed before the showdown", async () => {
    const game = await rexHitsGiant();
    await game.p1.move("runt", "bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.state("runt").combatRole).toBe("attacker");
    expect(game.state("giant").combatRole).toBe("defender");
    expect(game.state("giant").damage).toBe(6);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("the combat resolves as a trade: Runt deals 2 (6+2 = 8 ≥ 8) killing the Giant, the Giant's 8 kills the Runt; bf1 is left with no units and P2 scores nothing", async () => {
    const game = await rexHitsGiant();
    const p1Points = game.p1.points();
    const p2Points = game.p2.points();
    await game.p1.move("runt", "bf1");
    await game.settle();
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(p1Points);
    expect(game.p2.points()).toBe(p2Points);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without Rex's damage the same move just bounces: the undamaged Giant kills the Runt and survives with its 2 damage healed after combat", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 8, name: "Giant" }, "giant")
      .unit(P1, "base", { might: 2, name: "Runt" }, "runt")
      .build();
    await game.p1.move("runt", "bf1");
    await game.settle();
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.state("giant")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // healed in the combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
