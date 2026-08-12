/**
 * Ruling c454f9374729636a — En Garde (OGN-046 → ogn-046-298) · Spell · [1] · [Reaction]
 *   "Give a friendly unit +1 [Might] this turn, then an additional +1 [Might] this turn if it is the only unit
 *    you control there."
 *
 * Q: Does En Garde still grant the extra +1 when the unit is attacking a battlefield somebody else holds?
 * A: Yes. The bonus asks whether the chosen unit is the only unit YOU control at its location — controlling units is
 *    a separate question from controlling the location. Attacking, defending or sitting at home, alone is alone (+2);
 *    a second friendly unit at the same place cuts it back to +1.
 * Rules: 355.10 (choices), 190 (battlefield control ≠ unit control), 317.2.c ("this turn").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EN_GARDE = "ogn-046-298";

describe("Ruling c454f9374729636a — En Garde's extra +1 asks about YOUR units there, not who holds the battlefield", () => {
  test("lone attacker into an ENEMY-held battlefield still gets the full +2", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Defender" }, "def")
      .unit(P1, "base", { might: 2, name: "Attacker" }, "atk")
      .hand(P1, EN_GARDE, "eg")
      .resources(P1, { energy: 1 })
      .build();
    await game.p1.move("atk", "bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // P1 holds nothing here
    expect(game.state("atk").combatRole).toBe("attacker");
    await game.p1.cast("eg", { targets: "atk" });
    await game.acting().pass();
    await game.acting().pass();
    expect(game.state("atk")).toMatchObject({ might: 4, mightModifier: 2 });
  });

  test("…but a second friendly unit at that same battlefield drops it to +1", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Defender" }, "def")
      .unit(P1, "base", { might: 2, name: "Attacker" }, "atk")
      .unit(P1, "base", { might: 2, name: "Friend" }, "friend")
      .hand(P1, EN_GARDE, "eg")
      .resources(P1, { energy: 1 })
      .build();
    await game.p1.move(["atk", "friend"], "bf1");
    expect(game.p1.units("bf1").toSorted()).toEqual(["atk", "friend"]);
    await game.p1.cast("eg", { targets: "atk" });
    await game.acting().pass();
    await game.acting().pass();
    expect(game.state("atk")).toMatchObject({ might: 3, mightModifier: 1 });
  });

  test("mirror case — a lone DEFENDER at a battlefield P1 does control gets the same +2", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Defender" }, "def")
      .unit(P2, "base", { might: 5, name: "Attacker" }, "atk")
      .hand(P1, EN_GARDE, "eg")
      .resources(P1, { energy: 1 })
      .build();
    await game.p2.move("atk", "bf1");
    expect(game.state("def").combatRole).toBe("defender");
    await game.p2.passFocus(); // the attacker holds Focus first
    await game.p1.cast("eg", { targets: "def" });
    await game.acting().pass();
    await game.acting().pass();
    expect(game.state("def")).toMatchObject({ might: 4, mightModifier: 2 });
  });

  test("the whole grant is 'this turn' — both points wear off at the end of the turn", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Defender" }, "def")
      .unit(P1, "base", { might: 2, name: "Attacker" }, "atk")
      .hand(P1, EN_GARDE, "eg")
      .resources(P1, { energy: 1 })
      .build();
    await game.p1.cast("eg", { targets: "atk" }); // still in base, alone there
    await game.acting().pass();
    await game.acting().pass();
    expect(game.state("atk").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("atk")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });
});
