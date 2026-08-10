/**
 * Ruling 9a730585041d449b — Irelia, Fervent (SFD-057 → sfd-057-221) · 4 Might · Calm champion
 *     "[Deflect] … When you choose or ready me, give me +1 [Might] this turn."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment · +1 Might · "[Equip] [calm] … If I would die, kill
 *     Guardian Angel instead. Heal me, exhaust me, and recall me."
 *
 * Q: Does equipping an Equipment to Irelia count as "choosing" her? Would equipping Guardian Angel give +3 total?
 * A: Yes — activating [Equip] onto Irelia chooses her, so her trigger fires for +1 Might this turn. Guardian
 *    Angel's own bonus is +1. Total is +2 (4 → 6), not +3.
 * Rules: 818.1.b.1 ([Equip]'s unit is a chosen target), 383.4.b.2 (choose-triggers fire at finalization),
 *        718.4 (Equipment Might bonus modulates the wearer).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const IRELIA = "sfd-057-221";
const GUARDIAN_ANGEL = "sfd-051-221";

function board() {
  return scenario()
    .unit(P1, "base", IRELIA, "irelia")
    .resources(P1, { power: { calm: 1 } })
    .gear(P1, GUARDIAN_ANGEL, "ga");
}

describe("Ruling 9a730585041d449b — equipping Guardian Angel to Irelia, Fervent chooses her: +1 (trigger) +1 (gear) = +2", () => {
  test("baseline: Irelia is 4 Might, Guardian Angel unattached in base, [Equip] is legal onto her", async () => {
    const game = await board().build();
    expect(game.state("irelia")).toMatchObject({ baseMight: 4, might: 4 });
    expect(game.state("ga").attachedTo).toBeUndefined();
    const equipUnits = game.p1
      .legal()
      .filter((o) => o.moveId === "equipCard")
      .flatMap((o) => o.variants)
      .filter((v) => v.params.equipmentId === "ga")
      .map((v) => v.params.unitId);
    expect(equipUnits).toEqual(["irelia"]);
  });

  test("activating [Equip] onto Irelia CHOOSES her — her '+1 [Might] this turn' trigger goes on the chain at activation (818.1.b.1, 383.4.b.2) and the [calm] is paid", async () => {
    const game = await board().build();
    await game.p1.choose("equipCard", { params: { equipmentId: "ga", unitId: "irelia" } });
    expect(game.p1.power("calm")).toBe(0);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ga", controller: P1, triggered: false }),
      expect.objectContaining({ cardId: "irelia", controller: P1, triggered: true }),
    ]);
  });

  test("after it all resolves Irelia is 4 + 1 (Guardian Angel) + 1 (chosen) = 6 — +2 total, NOT +3", async () => {
    const game = await board().build();
    await game.p1.choose("equipCard", { params: { equipmentId: "ga", unitId: "irelia" } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("ga").attachedTo).toBe("irelia");
    expect(game.state("irelia")).toMatchObject({ attachments: ["ga"], baseMight: 4, might: 6 });
    expect(game.state("irelia").might).not.toBe(7);
    expect(game.violations()).toEqual([]);
  });

  test("the +1 from being chosen lasts only this turn; the Guardian Angel +1 persists — next turn she is 5", async () => {
    const game = await board().build();
    await game.p1.choose("equipCard", { params: { equipmentId: "ga", unitId: "irelia" } });
    await game.settle();
    expect(game.state("irelia").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("irelia")).toMatchObject({ attachments: ["ga"], might: 5 });
  });
});
