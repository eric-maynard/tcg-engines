/**
 * Ruling 727390b37ddfae6e — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Unit · Calm · [6][calm][calm] · 6 Might
 *   "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: Does Yasuo deal damage twice — once from his attacker trigger and once from regular combat damage?
 * A: Yes. The attack trigger goes on the initial chain, a target is declared, both players pass, and Yasuo
 *    deals his Might to that unit. That damage LINGERS (damage is only healed at end of combat / end of
 *    turn), so the same unit can be hit again in the combat damage step, where Yasuo also takes damage.
 * Rules: 459 (initial chain / attack trigger), 340 (priority + LIFO), 465.2 (combat damage step),
 *        466 (end-of-combat heal), 317.2.3.c (end-of-turn heal).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";

/** P1's turn. Yasuo ready in P1's base; P2 holds bf1 with one Guard. */
function board(guardMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: guardMight, name: "Guard" }, "guard")
    .unit(P1, "base", YASUO, "yasuo");
}

describe("Ruling 727390b37ddfae6e — Yasuo, Remorseful damages the same unit twice: attack trigger, then combat damage", () => {
  test("the attack trigger is a chain item; once it resolves the Guard carries 6 damage and is NOT healed while the showdown runs", async () => {
    const game = await board(8).build();
    await game.p1.move("yasuo", "bf1");
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
    expect(game.state("guard").damage).toBe(0);

    // Both players pass: the trigger resolves and deals Yasuo's Might (6) to the only enemy unit here.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(6);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // 6 < 8 Might — it survives, damage lingers
    expect(game.state("yasuo").damage).toBe(0); // no combat damage yet
  });

  test("combat damage then adds another 6 on top of the lingering 6 — 12 total kills the 8-Might Guard, and Yasuo takes the Guard's 8 and dies too", async () => {
    const game = await board(8).build();
    await game.p1.move("yasuo", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("guard").damage).toBe(6);

    await game.settle(); // pass focus twice → combat damage step → resolution
    expect(game.zoneOf("guard")).toBe("trash"); // 6 (trigger) + 6 (combat) ≥ 8
    expect(game.zoneOf("yasuo")).toBe("trash"); // Yasuo (6 Might) was dealt the Guard's 8
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0); // nobody remained — no conquer (466.5.b)
    expect(game.violations()).toEqual([]);
  });

  test("if the trigger alone is lethal (6-Might Guard) the Guard dies before the damage step, so no combat damage is exchanged and Yasuo conquers unharmed", async () => {
    const game = await board(6).build();
    await game.p1.move("yasuo", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("guard")).toBe("trash");

    await game.settle();
    expect(game.state("yasuo").damage).toBe(0);
    expect(game.zoneOf("yasuo")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });
});
