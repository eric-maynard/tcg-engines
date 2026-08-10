/**
 * Ruling 7d7b3dd9fc7b2eab — Challenge (OGN-128 → ogn-128-298) · Action · [2]+[body]
 *     "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Wuju Bladesman - Starter (OGS-019 → ogs-019-024, Master Yi legend) "While a friendly unit defends alone, it gets +2 [Might]."
 *   (Wuju Master unl-191-219 is the other Yi legend in the scrape; the answer is about the Starter's "defends alone" bonus.)
 *
 * Q: When Challenge is used on a unit, does that unit benefit from the Yi legend's +2?
 * A: Only if it is ALREADY "defending alone" in a combat showdown when Challenge resolves — the passive +2 is part of its current
 *    Might then, so Challenge deals that much. Outside combat (your own turn, or a showdown where you are not the defender) there is
 *    no bonus; being chosen by Challenge does not make a unit a "defender".
 * Rules: 364.3 (passive/static bonuses are continuously applied), 464.2 (defender designation only in combat), Challenge uses
 *        current Might at resolution.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const WUJU_BLADESMAN = "ogs-019-024";

describe("Ruling 7d7b3dd9fc7b2eab — Challenge sees the Yi +2 only while the unit is actually defending alone", () => {
  test("during a combat showdown where P1's Disciple defends ALONE: it reads 5 (3+2); P1 Challenges [Disciple, Attacker] in the showdown and the Disciple deals 5 (kills the 5-Might attacker) while taking 5", async () => {
    const game = await scenario()
      .active(P2)
      .legend(P1, WUJU_BLADESMAN, "yi")
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Disciple" }, "disciple")
      .unit(P2, "base", { might: 5, name: "Attacker" }, "attacker")
      .hand(P1, CHALLENGE, "challenge")
      .build();
    expect(game.state("disciple").might).toBe(3); // not defending yet
    await game.p2.move("attacker", "bf1");
    expect(game.state("disciple")).toMatchObject({ combatRole: "defender", might: 5 }); // passive, immediately
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "challenge")).toBe(true);
    await game.p1.cast("challenge", { targets: ["disciple", "attacker"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    // Resolve Challenge only (P1 then P2 pass).
    for (let i = 0; i < 4 && game.zoneOf("challenge") !== "trash"; i++) {
      await game.acting().pass();
    }
    expect(game.zoneOf("challenge")).toBe("trash");
    // The Disciple dealt its CURRENT 5 → the 5-Might Attacker is dead; the Attacker dealt 5 back → the Disciple (5 while defending) dies too.
    expect(game.zoneOf("attacker")).toBe("trash");
    expect(game.zoneOf("disciple")).toBe("trash");
    await game.settle();
    expect(game.p2.points()).toBe(0); // the attack never landed a conquer
    expect(game.violations()).toEqual([]);
  });

  test("same showdown but a 4-Might attacker: Disciple deals 5 (kills it) and takes only 4 < 5 → SURVIVES thanks to the +2 being live during the showdown", async () => {
    const game = await scenario()
      .active(P2)
      .legend(P1, WUJU_BLADESMAN, "yi")
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Disciple" }, "disciple")
      .unit(P2, "base", { might: 4, name: "Attacker" }, "attacker")
      .hand(P1, CHALLENGE, "challenge")
      .build();
    await game.p2.move("attacker", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("challenge", { targets: ["disciple", "attacker"] });
    for (let i = 0; i < 4 && game.zoneOf("challenge") !== "trash"; i++) {
      await game.acting().pass();
    }
    expect(game.zoneOf("attacker")).toBe("trash");
    expect(game.state("disciple")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    await game.settle();
    expect(game.zoneOf("disciple")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("OUTSIDE combat (P1's own turn, no showdown): the same 3-Might Disciple Challenging a 4-Might enemy deals only 3 and dies to 4 — no Yi bonus, and being chosen by Challenge does not make it a 'defender'", async () => {
    const game = await scenario()
      .legend(P1, WUJU_BLADESMAN, "yi")
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Disciple" }, "disciple")
      .unit(P2, "bf2", { might: 4, name: "Enemy" }, "enemy")
      .hand(P1, CHALLENGE, "challenge")
      .build();
    expect(game.state("disciple")).toMatchObject({ combatRole: null, might: 3 });
    await game.p1.cast("challenge", { targets: ["disciple", "enemy"] });
    expect(game.state("disciple")).toMatchObject({ combatRole: null, might: 3 }); // targeted ≠ defending
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.state("enemy")).toMatchObject({ damage: 3, zone: "battlefield-bf2" }); // took 3, not 5
    expect(game.zoneOf("disciple")).toBe("trash"); // took 4 ≥ 3
    expect(game.violations()).toEqual([]);
  });

  test("a showdown where P1 is NOT the defender (P1 attacks alone into P2's lone 4-Might Guard): P1's unit gets no +2 — Challenge from the attacker deals 3", async () => {
    const game = await scenario()
      .legend(P1, WUJU_BLADESMAN, "yi")
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 3, name: "Disciple" }, "disciple")
      .hand(P1, CHALLENGE, "challenge")
      .build();
    await game.p1.move("disciple", "bf1");
    expect(game.state("disciple")).toMatchObject({ combatRole: "attacker", might: 3 });
    expect(game.state("guard").might).toBe(4); // P2 has no Yi legend
    await game.p1.cast("challenge", { targets: ["disciple", "guard"] });
    for (let i = 0; i < 4 && game.zoneOf("challenge") !== "trash"; i++) {
      await game.acting().pass();
    }
    expect(game.state("guard").damage).toBe(3);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.zoneOf("disciple")).toBe("trash"); // 4 ≥ 3
  });
});
