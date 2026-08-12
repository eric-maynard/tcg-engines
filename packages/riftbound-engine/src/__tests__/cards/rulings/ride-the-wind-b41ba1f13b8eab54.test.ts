/**
 * Ruling b41ba1f13b8eab54 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · [2][chaos] · [Action]
 *   "Move a friendly unit and ready it."
 *
 * Q: P1 moves a unit to an empty battlefield (a non-combat showdown starts). During that showdown P2 plays
 *    Ride the Wind to move a unit there too. Who is the attacker?
 * A: P1 — the player who FIRST applied Contested by moving to the uncontrolled battlefield. Contested is
 *    applied on that first arrival and persists into the staged combat showdown (control cannot be
 *    established while a showdown is ongoing), and the non-combat showdown scores nothing because both
 *    players are present when it closes.
 * Rules: 190.3.a/b (Contested applied on arrival, held through the showdown), 459.2.b.1 (attacker =
 *        the player who applied Contested), 348.2.a / 190.4.b (no control while a showdown runs).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** bf1 is empty and uncontrolled; P1 has a 3-Might body, P2 a 2-Might body plus Ride the Wind. */
function emptyBattlefield(manual = true) {
  const s = manual ? scenario().autoProcedures(false) : scenario();
  return s
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "Vanguard" }, "a")
    .unit(P2, "base", { might: 2, name: "Windrider" }, "b")
    .hand(P2, RIDE_THE_WIND, "rtw")
    .resources(P2, { energy: 2, power: { chaos: 1 } });
}

describe("Ruling b41ba1f13b8eab54 — the first arrival at the empty battlefield is the attacker", () => {
  test("P1's move opens a NON-COMBAT showdown and stamps P1 as the player who applied Contested", async () => {
    const game = await emptyBattlefield().build();
    await game.p1.move("a", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.state("a").combatRole).toBeFalsy(); // no combat yet — nobody to fight
  });

  test("P2's Ride the Wind brings a unit in: P1 is the ATTACKER, P2's arrival is the DEFENDER", async () => {
    const game = await emptyBattlefield().build();
    await game.p1.move("a", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("rtw", { targets: "b", answers: ["bf1"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.locationOf("b")).toBe("bf1");
    expect(game.state("b").isReady).toBe(true); // "…and ready it"
    expect(game.state("a").combatRole).toBe("attacker");
    expect(game.state("b").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  });

  test("the non-combat showdown scores nothing — both players are present, so no control is established", async () => {
    const game = await emptyBattlefield().build();
    await game.p1.move("a", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("rtw", { targets: "b", answers: ["bf1"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    await game.p1.passFocus();
    await game.p2.passFocus();
    // the combat showdown is what is left to resolve, and the roles are still P1-attacks-P2
    expect(game.state("a").combatRole).toBe("attacker");
    expect(game.state("b").combatRole).toBe("defender");
    expect(game.p1.legal().map((o) => o.verb)).toContain("resolveCombat");
  });

  test("resolving that combat is an ATTACKER win: P2's unit dies, P1 conquers bf1 and scores", async () => {
    const game = await emptyBattlefield(false).build();
    await game.p1.move("a", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("rtw", { targets: "b", answers: ["bf1"] });
    await game.settle();
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
