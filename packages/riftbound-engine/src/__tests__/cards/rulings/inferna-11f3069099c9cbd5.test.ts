/**
 * Ruling 11f3069099c9cbd5 — Inferna (UNL-002 → unl-002-219) · Unit · Fury · [2] · 1 Might "[Ambush] [Assault 2]"
 *   × Vex, Apathetic (UNL-150 → unl-150-219) · 4 Might "[Deflect] When an opponent plays a unit while I'm at
 *     a battlefield, [Stun] it…"
 *   × Evelynn, Entrancing (UNL-141 → unl-141-219) · 2 Might "[Hidden] [Backline] (I must be assigned combat
 *     damage last.) …"
 *
 * Q: My lone Inferna attacks a battlefield held by Vex (already 3 damage) and Evelynn. Do both die?
 * A: Inferna attacks with 3 Might (1 + Assault 2). Backline forces damage onto Vex first; 1 is lethal to
 *    her (3 marked of 4), and no more than the lethal minimum may go on her while Evelynn remains
 *    (460/465.2.c.3–4, 465.2.c.6). The remaining 2 go to Evelynn — lethal for a 2-Might unit — so with
 *    exactly 3 Might and nothing else interfering, both are killed. (Vex 4 + Evelynn 2 = 6 back kills Inferna.)
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const INFERNA = "unl-002-219";
const VEX_APATHETIC = "unl-150-219";
const EVELYNN_ENTRANCING = "unl-141-219";

/** P1's turn. bf1 is P2's: Vex (4, `vexDamage` marked) + Evelynn (2, Backline). Inferna already on the board in P1's base. */
function board(vexDamage: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VEX_APATHETIC, "vex", { damage: vexDamage })
    .unit(P2, "bf1", EVELYNN_ENTRANCING, "evelynn")
    .unit(P1, "base", INFERNA, "inferna");
}

describe("Ruling 11f3069099c9cbd5 — Inferna (3 as attacker) into Vex (3 dmg) + Backline Evelynn: 1 to Vex, 2 to Evelynn, both die", () => {
  test("premises: Inferna is 1 Might in base; Evelynn has Backline; Vex carries 3 damage on 4 Might", async () => {
    const game = await board(3).build();
    expect(game.state("inferna").might).toBe(1);
    expect(game.state("inferna").keywords).toContain("Assault");
    expect(game.state("evelynn").keywords).toContain("Backline");
    expect(game.state("evelynn").might).toBe(2);
    expect(game.state("vex")).toMatchObject({ damage: 3, might: 4 });
  });

  test("Inferna MOVES in (not played — Vex's stun trigger is irrelevant) and is a 3-Might attacker (Assault 2)", async () => {
    const game = await board(3).build();
    await game.p1.move("inferna", "bf1");
    expect(game.state("inferna").combatRole).toBe("attacker");
    expect(game.state("inferna").isStunned).toBe(false);
    expect(game.state("inferna").might).toBe(3);
    expect(game.state("vex").combatRole).toBe("defender");
    expect(game.state("evelynn").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("combat: the forced assignment is Vex 1 (lethal minimum, Backline last) then Evelynn 2 (lethal) → both die; Inferna takes 6 and dies too", async () => {
    const game = await board(3).build();
    await game.p1.move("inferna", "bf1");
    await game.settle();
    expect(game.zoneOf("vex")).toBe("trash");
    expect(game.zoneOf("evelynn")).toBe("trash");
    expect(game.zoneOf("inferna")).toBe("trash");
    // No attacker survived → nothing is conquered; P1 scores nothing.
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast (why Backline matters): Vex with only 2 damage soaks 2 first, leaving 1 for Evelynn — Vex dies, Evelynn survives", async () => {
    const game = await board(2).build();
    await game.p1.move("inferna", "bf1");
    await game.settle();
    expect(game.zoneOf("vex")).toBe("trash");
    expect(game.zoneOf("evelynn")).toBe("battlefield-bf1");
    expect(game.zoneOf("inferna")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
