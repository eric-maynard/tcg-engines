/**
 * Ruling f27315cd5e48d6c6 — Challenge (OGN-128 → ogn-128-298) · [Action] · Body · [2][body]
 *     "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Wuju Bladesman - Starter (OGS-019 → ogs-019-024) · Legend (Yi)
 *     "While a friendly unit defends alone, it gets +2 [Might]."
 *
 * Q: When does a "while … defends alone" ability apply — the whole turn, or only during combat showdowns?
 * A: Only while the unit is actually DEFENDING in a combat at its battlefield. Being targeted by a damage spell
 *    or an ability outside combat does not make a unit a defender, and Challenge is not combat, so its exchange
 *    is resolved with the unit's ordinary Might.
 * Rules: 442.1.a (the Defender designation is handed out when a combat begins), 466.7.a (it is removed when the
 *        combat ends), 454/456 (what combat is), 417.6.b.3 (effect damage is not combat damage).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const WUJU_BLADESMAN = "ogs-019-024";

/**
 * P1 has the Wuju Bladesman legend and one lone Guardian (3) at bf1 they control.
 * P2 has a Raider (5) in base. `active` says whose turn it is.
 */
function board(active: typeof P1 | typeof P2) {
  return scenario()
    .turn(3)
    .active(active)
    .legend(P1, WUJU_BLADESMAN, "yi")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guardian" }, "guardian")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, CHALLENGE, "challenge")
    .resources(P1, { energy: 2, power: { body: 1 } });
}

describe("Ruling f27315cd5e48d6c6 — 'defends alone' is a combat state, not a turn-long one", () => {
  test("out of combat the lone Guardian is just 3 Might — holding a battlefield is not defending", async () => {
    const game = await board(P1).build();
    expect(game.state("guardian").combatRole).toBeFalsy();
    expect(game.state("guardian").might).toBe(3);
  });

  test("ruling: Challenge does not make him a defender — he exchanges 3, not 5, with the Raider", async () => {
    const game = await board(P1).build();
    await game.p1.cast("challenge", { targets: ["guardian", "raider"] });
    await game.settle();
    expect(game.state("raider").damage).toBe(3); // his +2 never applied
    expect(game.zoneOf("guardian")).toBe("trash"); // and he took the Raider's 5
    expect(game.state("raider").combatRole).toBeFalsy(); // no designations were handed out at all
    expect(game.violations()).toEqual([]);
  });

  test("contrast: when the Raider actually attacks bf1, the Guardian IS defending alone and is 5 Might", async () => {
    const game = await board(P2).build();
    await game.p2.move("raider", "bf1");
    expect(game.state("guardian").combatRole).toBe("defender");
    expect(game.state("guardian").might).toBe(5); // 3 + 2 while defending alone
  });

  test("and it is a real 5 in that combat: the 5-Might Raider trades with him instead of running him over", async () => {
    const game = await board(P2).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // took 5 from the buffed defender
    expect(game.zoneOf("guardian")).toBe("trash"); // 5 damage vs 5 Might
    expect(game.violations()).toEqual([]);
  });

  test("the bonus is gone again once the combat is over — a survivor of a combat is not 'defending' afterwards", async () => {
    const game = await board(P2).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    await game.advanceToTurnOf(P1);
    const survivors = game.p1.units("bf1");
    for (const u of survivors) {
      expect(game.state(u).combatRole).toBeFalsy();
    }
  });
});
