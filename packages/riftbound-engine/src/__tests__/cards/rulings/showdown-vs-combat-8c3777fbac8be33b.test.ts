/**
 * Ruling 8c3777fbac8be33b — (no specific card) showdown vs combat.
 *
 * Q: What is the difference between a Combat and a Showdown, and can a Showdown happen without a Combat?
 * A: A Showdown opens whenever a unit moves into a battlefield. A Combat only exists when units of
 *    opposing players are present at the same battlefield. Moving to an empty battlefield therefore
 *    gives a Showdown with NO combat — no designations, no damage step; a showdown is not derivative
 *    of combat, it merely becomes part of one when combat opens.
 * Rules: 344.2 / 323.11 (showdowns are staged by arrivals), 464.2 (Combat opens with, or converts,
 *        a Showdown), 464.2.c.3 (designations exist only in combat), 465.2 (the damage step belongs
 *        to combat), 323.14 (a running Non-Combat Showdown BECOMES a Combat Showdown).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** bf1 empty, bf2 held by P2. P1 has two units in base; P2 has a spare unit in base to walk in later. */
function board() {
  return scenario()
    .battlefield("bf1")
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 4, name: "Scout" }, "scout")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 5, name: "Reserve" }, "reserve");
}

describe("Ruling 8c3777fbac8be33b — every arrival opens a showdown; only opposing units make it a combat", () => {
  test("empty battlefield: a showdown runs (both seats pass Focus to close it) but nobody is an attacker or defender and no damage is dealt", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(game.state("scout").combatRole).not.toBe("attacker");
    // A showdown IS staged: Focus is being offered, not a plain main-phase menu.
    expect(game.decision()).toMatchObject({ context: "showdown" });
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.state("scout").damage).toBe(0);
    expect(game.state("scout").combatRole).not.toBe("attacker");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("occupied enemy battlefield: the same move opens a showdown AND a combat — designations are stamped and damage is exchanged", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf2");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("holder").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash"); // 4 ≥ 3
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("a non-combat showdown is not a separate thing: when an opposing unit arrives it BECOMES a combat showdown (323.14)", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1"); // non-combat showdown at bf1
    expect(game.state("scout").combatRole).not.toBe("attacker");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.advanceTurn(); // P2's turn
    await game.p2.move("reserve", "bf1"); // now opposing units are present → combat
    expect(game.state("reserve").combatRole).toBe("attacker");
    expect(game.state("scout").combatRole).toBe("defender");
    expect(game.violations()).toEqual([]);
  });
});
