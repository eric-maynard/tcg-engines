/**
 * Ruling 0b6ee20d21cb24c1 — Irelia, Fervent (SFD-057 → sfd-057-221) · Champion Unit · Calm · [5] · 4 Might
 *     "[Deflect] When you choose or ready me, give me +1 [Might] this turn."
 *   × Serrated Dirk (sfd-009-221) · Equipment · +0 Might · "[Equip] [fury] … [Assault 2]" — a weapon with NO Might bonus,
 *     so any Might change on Irelia comes from her own trigger.
 *
 * Q: Does equipping a weapon to Irelia, Fervent give her +1?
 * A: Yes. Attaching gear via [Equip] chooses (targets) the unit; "When you choose … me" triggers → +1 Might this turn.
 * Rules: 818.1.b.1 ([Equip] chooses the unit), 383.4.b (choose-triggers), 355.10 (choose = target).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const IRELIA = "sfd-057-221";
const SERRATED_DIRK = "sfd-009-221";

function board() {
  return scenario().resources(P1, { power: { fury: 1 } }).unit(P1, "base", IRELIA, "irelia").gear(P1, SERRATED_DIRK, "dirk");
}

describe("Ruling 0b6ee20d21cb24c1 — equipping a weapon to Irelia, Fervent chooses her: +1 Might this turn", () => {
  test("[Equip] Serrated Dirk → Irelia: the [fury] is paid and her 'When you choose me' trigger joins the chain right away", async () => {
    const game = await board().build();
    expect(game.state("irelia")).toMatchObject({ might: 4, mightModifier: 0 });
    await game.p1.choose("equipCard", { params: { equipmentId: "dirk", unitId: "irelia" } });
    expect(game.p1.power("fury")).toBe(0);
    expect(game.chain()).toEqual(expect.arrayContaining([expect.objectContaining({ cardId: "irelia", controller: P1, triggered: true })]));
  });

  test("resolved: the Dirk (+0 Might) is attached and Irelia is 5 = 4 + 1 from being chosen — the +1 is her trigger, not the weapon", async () => {
    const game = await board().build();
    await game.p1.choose("equipCard", { params: { equipmentId: "dirk", unitId: "irelia" } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("dirk").attachedTo).toBe("irelia");
    expect(game.state("irelia")).toMatchObject({ attachments: ["dirk"], might: 5, mightModifier: 1 });
    expect(game.violations()).toEqual([]);
  });

  test("'this turn': next turn the chosen +1 is gone and she is back to 4 with the Dirk still on", async () => {
    const game = await board().build();
    await game.p1.choose("equipCard", { params: { equipmentId: "dirk", unitId: "irelia" } });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("irelia")).toMatchObject({ attachments: ["dirk"], might: 4, mightModifier: 0 });
  });
});
