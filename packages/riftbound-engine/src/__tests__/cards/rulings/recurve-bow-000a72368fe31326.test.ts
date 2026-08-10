/**
 * Ruling 000a72368fe31326 — Recurve Bow (SFD-016 → sfd-016-221) · Equipment · Fury · 2 · +0
 *   Effect Text: "When I attack or defend, deal 2 to an enemy unit here."
 *   × Angle Shot (SFD-011 → sfd-011-221) [Reaction] "Choose a unit and an Equipment with the same
 *     controller. Attach that Equipment to that unit or detach it from that unit. Draw 1."
 *
 * Q: A unit is already the attacker; Angle Shot then attaches Recurve Bow to it mid-combat. Does the
 *    newly gained "When I attack" trigger get processed?
 * A: No. Attack triggers fire only when the unit GAINS the attacker designation while having the
 *    ability (checked once per combat). Gaining the ability afterwards does nothing this combat.
 *    Passives (e.g. Assault / Might bonus) are different — they only care about the current designation.
 * Rules: 383.2.c, 383.4.e, 383.4.e.2.a, 718.3, 718.4.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RECURVE_BOW = "sfd-016-221";
const ANGLE_SHOT = "sfd-011-221";

/** P1: 3-Might Archer in base, an unattached Recurve Bow in base, Angle Shot in hand. P2 holds bf1 with Foe. */
function board(foeMight: number) {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: foeMight, name: "Foe" }, "foe")
    .unit(P1, "base", { might: 3, name: "Archer" }, "archer")
    .gear(P1, RECURVE_BOW, "bow")
    .hand(P1, ANGLE_SHOT, "shot");
}

describe("Ruling 000a72368fe31326 — an Attack trigger gained after the attacker designation does not fire", () => {
  test("Archer attacks first, THEN Angle Shot attaches the Bow: the Bow is on Archer but no deal-2 trigger is created (chain empty, Foe undamaged, no target prompt)", async () => {
    const game = await board(6).build();
    await game.p1.move("archer", "bf1");
    // Archer gained the attacker designation with no attack trigger on it.
    expect(game.state("archer").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });

    // P1 (Focus) reacts with Angle Shot: (Archer, Bow) → attach.
    await game.p1.cast("shot", { targets: ["archer", "bow"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["shot"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Angle Shot resolves
    expect(game.zoneOf("shot")).toBe("trash");
    expect(game.state("bow").attachedTo).toBe("archer");
    expect(game.state("archer").attachments).toEqual(["bow"]);
    expect(game.state("archer").combatRole).toBe("attacker"); // still the attacker — never re-designated

    // The ruling: no "When I attack" item appears, nobody is asked to pick "an enemy unit here".
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.state("foe").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("discriminating line: into a 4-Might Foe the late Bow adds no 2 — Foe survives combat (takes only 3) and Archer dies", async () => {
    // Had the Bow's trigger fired, Foe would take 2 + 3 = 5 ≥ 4 and die.
    const game = await board(4).build();
    await game.p1.move("archer", "bf1");
    await game.p1.cast("shot", { targets: ["archer", "bow"] });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.zoneOf("archer")).toBe("trash"); // took 4 ≥ 3
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.state("bow").attachedTo).toBeUndefined();
  });

  test("control: the same Bow attached BEFORE the attack does fire on designation — the trigger targets the enemy unit here, Foe takes 2 and then dies to 2 + 3 ≥ 4", async () => {
    const game = await board(4).build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "bow", unitId: "archer" } });
    await game.settle();
    expect(game.state("bow").attachedTo).toBe("archer");
    expect(game.p1.power("fury")).toBe(0);

    await game.p1.move("archer", "bf1");
    // The conferred attack trigger is sourced from Archer and controlled by P1.
    // Foe is the only enemy unit here, so the target is locked without asking.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "archer", controller: P1, targets: ["foe"], triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("foe").damage).toBe(2);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 2 (Bow) + 3 (combat) ≥ 4 — versus surviving in the late-attach case
    expect(game.zoneOf("archer")).toBe("trash"); // Foe still dealt its 4
  });

  test("passives differ: the Bow's Might bonus (+0) applies from the moment of attachment even mid-combat — Archer stays 3 and is 'equipped'", async () => {
    const game = await board(6).build();
    await game.p1.move("archer", "bf1");
    await game.p1.cast("shot", { targets: ["archer", "bow"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("archer")).toMatchObject({ attachments: ["bow"], baseMight: 3, might: 3 });
  });
});
