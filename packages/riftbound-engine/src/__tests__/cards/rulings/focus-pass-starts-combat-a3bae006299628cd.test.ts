/**
 * Ruling a3bae006299628cd — (no specific card) what happens when both players pass Focus.
 *   Exercised with Ride the Wind (OGN-173 → ogn-173-298, [Action]).
 *
 * Q: Player A passes Focus and Player B passes Focus. Must combat start, or can A still play an action?
 * A: Combat starts. Combat happens exactly when both players have voluntarily passed Focus — A does not
 *    get another bite. Focus (the right to start a chain during a showdown) is separate from Priority
 *    (the right to answer an item on a chain); the Focus cycle ends the moment both players decline it.
 * Rules: 464.2.d (the attacker gains Focus), 465 (the Combat Damage Step follows the showdown closing),
 *        342.1 (priority passing within a chain), 343 (Focus is passed when a player declines to act).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. P2 holds bf1 with a 2-Might Holder; P1's 5-Might Raider attacks. Both hold an [Action]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 1, name: "Spare" }, "spare")
    .unit(P2, "base", { might: 1, name: "Reserve" }, "reserve")
    .hand(P1, RIDE_THE_WIND, "ride")
    .hand(P2, RIDE_THE_WIND, "ride2");
}

describe("Ruling a3bae006299628cd — once both players pass Focus, combat begins and nobody may act again", () => {
  test("the Focus cycle really is a cycle: P1 acts, P2 may act, and the attacker gets Focus back", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1"); // the attacker has Focus
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.p1.can("cast", "ride")).toBe(true);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
    expect(game.p2.can("cast", "ride2")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("after BOTH pass Focus the showdown is over: the very next thing asked is combat damage assignment, not another action window", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    // No third Focus window for P1: the second pass took the game straight through the Combat
    // Damage Step, so by the time anyone is asked anything again the combat has already happened.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action" });
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("with the combat procedure surfaced instead of auto-run, the staged item really is resolveFullCombat", async () => {
    const game = await board().autoProcedures(false).build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.acting().legal().map((o) => o.moveId)).toContain("resolveFullCombat");
    expect(game.violations()).toEqual([]);
  });

  test("combat then happens: damage is exchanged and P1 takes the battlefield", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash"); // 5 ≥ 2
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("a pass is not final until BOTH have passed: if P2 acts after P1's pass, P1 gets Focus again", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("ride2", { targets: "reserve", answers: ["bf1"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // the new chain resolves
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("reserve")).toBe("bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.p1.can("cast", "ride")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
