/**
 * Ruling 3f8f509a3f54319d — Challenge (OGN-128 → ogn-128-298)
 *   "[Action] Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *
 * Q: I play Challenge during a showdown (with a unit from my base) and it kills the attacking unit.
 *    Does the showdown end immediately, and does my defender survive?
 * A: The attacker dies, but the showdown carries on: both players keep getting Focus until both pass.
 *    Only then does it end — and the defender survives untouched, because the attacking side has no
 *    units left to assign combat damage.
 * Rules: 344 / 346 (a showdown ends only when both players pass Focus), 465.2 (combat damage is
 *        assigned by the units present at that point), 466.5.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";

/** P2 raids P1's battlefield; P1 holds Challenge and a big unit at home. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 5, name: "Champ" }, "champ")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, CHALLENGE, "challenge");
}

describe("Ruling 3f8f509a3f54319d — Challenge kills the attacker but does not end the showdown", () => {
  test("step by step: the attacker dies to Challenge, the showdown keeps running, and the defender ends up unharmed", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");

    await game.p2.passFocus();
    await game.p1.cast("challenge", { targets: ["champ", "raider"] });
    await game.p1.passPriority();
    await game.p2.passPriority();

    // 1. Challenge resolved: both chosen units dealt their Might to each other.
    expect(game.zoneOf("raider")).toBe("trash"); // 5 into a 3-Might attacker
    expect(game.state("champ").damage).toBe(3); // and the caster's unit took 3 back
    expect(game.zoneOf("champ")).toBe("base");

    // 2. The showdown has NOT ended: it is still contested and Focus is being passed around.
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, showdownComplete: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });

    // 3. Both pass ⇒ only now does the showdown close.
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    await game.settle();

    // 4. Nothing was left to allocate Might, so the defender is alive and undamaged.
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0); // P1 already controlled it — defending is not a conquest
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the window is real: P2 can still act after Challenge resolves and before the showdown closes", async () => {
    const game = await board()
      .resources(P2, { energy: 1 })
      .hand(P2, "ogn-095-298", "stupefy") // [Reaction] give a unit -1 Might, draw 1
      .build();

    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("challenge", { targets: ["champ", "raider"] });
    await game.p1.passPriority();
    await game.p2.passPriority();

    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.p2.can("cast", "stupefy")).toBe(true); // the showdown is still open for P2
    await game.p2.cast("stupefy", { targets: "guard" });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
  });

  test("control: without Challenge the 3-Might raider trades into the 4-Might guard and dies to combat damage instead", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
