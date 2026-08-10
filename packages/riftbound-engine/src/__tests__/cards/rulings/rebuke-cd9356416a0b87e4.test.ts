/**
 * Ruling cd9356416a0b87e4 — Rebuke (OGN-172 → ogn-172-298) · Action [2][chaos][chaos] "Return a unit at a battlefield to its owner's hand."
 *   × Zenith Blade (OGN-262 → ogn-262-298) · Action [3][rainbow][rainbow] "Stun an enemy unit at a battlefield. You may move a
 *     friendly unit to that enemy unit's battlefield."
 *
 * Q: The opponent attacks my battlefield and Rebukes my defender (it resolves). Can I then Zenith Blade — stun an attacker and
 *    move another unit from base into the showdown?
 * A: Yes. The showdown/combat does not end until both players pass; you play Zenith Blade on your Focus, stun one attacker,
 *    move a unit in, and it becomes a defender. You never lose control of the battlefield while the combat is ongoing.
 * Rules: 341–343 (showdown ends on consecutive passes), 464.2 (units arriving mid-combat get designations), 190.4.b (no
 *        control change during combat), 423 (stunned units deal no combat damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUKE = "ogn-172-298";
const ZENITH_BLADE = "ogn-262-298";

/** P2's turn. P1 holds bf1 with Holder (2), Backup (3) in base, Zenith Blade in hand. P2: Raider (4) + Rebuke. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .resources(P2, { energy: 2, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 3, name: "Backup" }, "backup")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, REBUKE, "rebuke")
    .hand(P1, ZENITH_BLADE, "zb");
}

/** Raider attacks bf1; P2 (Focus) Rebukes the Holder and it resolves. Returns with the showdown still open. */
async function attackAndRebuke(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.state("holder").combatRole).toBe("defender");
  await game.p2.cast("rebuke", { targets: "holder" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Rebuke resolves
  expect(game.zoneOf("rebuke")).toBe("trash");
  expect(game.zoneOf("holder")).toBe("hand");
  return game;
}

describe("Ruling cd9356416a0b87e4 — after Rebuke resolves the defender can still Zenith Blade a fresh unit into the showdown", () => {
  test("Rebuke resolved: bf1 has no defender left, yet the showdown is still open, the combat is ongoing and P1 STILL controls bf1", async () => {
    const game = await attackAndRebuke();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.points()).toBe(0);
  });

  test("P1 gets Focus and plays Zenith Blade: Raider is stunned, Backup moves from base to bf1 and becomes a DEFENDER", async () => {
    const game = await attackAndRebuke();
    if (game.actingSeat() === P2) {
      await game.p2.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "zb")).toBe(true);
    await game.p1.cast("zb", { targets: ["raider", "backup"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("battlefield-bf1");
    }
    expect(game.zoneOf("zb")).toBe("trash");
    expect(game.state("raider")).toMatchObject({ isStunned: true, zone: "battlefield-bf1" });
    expect(game.state("backup")).toMatchObject({ combatRole: "defender", zone: "battlefield-bf1" });
    // Still mid-showdown; control has not moved.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("finishing the combat: the stunned Raider deals no damage and is repelled to base; Backup holds bf1 for P1 — P2 scores nothing", async () => {
    const game = await attackAndRebuke();
    if (game.actingSeat() === P2) {
      await game.p2.passFocus();
    }
    await game.p1.cast("zb", { targets: ["raider", "backup"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("battlefield-bf1");
    }
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.state("backup")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.state("raider").location).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0); // P1 never lost control, so holding it is not a conquer either
    expect(game.violations()).toEqual([]);
  });
});
