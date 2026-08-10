/**
 * Ruling cffbad74d5a656dc — Svellsongur (SFD-059 → sfd-059-221) · Equipment · Calm · [Equip] [1][calm]
 *     "As this is attached to a unit, copy that unit's text to this Equipment's effect text for as long as this is
 *      attached to it."
 *   × Salvage (OGN-224 → ogn-224-298) · [Action] · 2 + [order] · "You may kill up to one gear. Draw 1."
 *   (Deflect bearer used here: Irelia, Fervent sfd-057-221 — "[Deflect] When you choose or ready me, give me +1 [Might]…")
 *
 * Q: Does Svellsongur itself gain Deflect when attached to a unit that has Deflect?
 * A: No. The copied text is the Equipment's EFFECT text — active for the equipped unit, not for the gear. An opponent
 *    targeting Svellsongur directly (e.g. Salvage) pays no Deflect surcharge even though the unit has Deflect.
 * Rules: 719 (Equipment effect text applies to the equipped unit), 718 (copying text), 809 (Deflect is a mandatory
 *        additional cost only for choosing the object that HAS it).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SVELLSONGUR = "sfd-059-221";
const IRELIA = "sfd-057-221";
const SALVAGE = "ogn-224-298";
/** 1-cost [Action] "Deal 1 to a unit" — the probe for the unit's Deflect surcharge. */
const SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Spark",
  timing: "action",
} as const;

/** P1 equips Svellsongur to Irelia on P1's turn; the turn passes to P2, who is then handed exactly `p2` resources. */
async function ireliaWearingSvellOnP2Turn(p2: { energy: number; power: Record<string, number> }): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .unit(P1, "base", IRELIA, "irelia")
    .gear(P1, SVELLSONGUR, "svell")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
    .hand(P2, SPARK, "spark")
    .hand(P2, SALVAGE, "salvage")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["e1", "e2", "e3"])
    .build();
  await game.p1.do("equipCard", { equipmentId: "svell", unitId: "irelia" });
  await game.settle();
  expect(game.state("svell").attachedTo).toBe("irelia");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.do("addResources", p2);
  expect(game.p2.resources()).toEqual(p2);
  return game;
}

describe("Ruling cffbad74d5a656dc — Svellsongur copies Deflect FOR THE UNIT; the gear itself has no Deflect", () => {
  test("attached to Irelia: Irelia (still) has Deflect, Svellsongur's own keyword line does not", async () => {
    const game = await ireliaWearingSvellOnP2Turn({ energy: 0, power: {} });
    expect(game.state("irelia").keywords).toContain("Deflect");
    expect(game.state("irelia").attachments).toEqual(["svell"]);
    expect(game.state("svell").keywords).not.toContain("Deflect");
  });

  test("the unit's Deflect is live for the opponent: with 1 energy and NO power P2 cannot Spark Irelia (surcharge unpaid) — but the Bystander is fine", async () => {
    const game = await ireliaWearingSvellOnP2Turn({ energy: 1, power: {} });
    const r = await game.p2.try((p) => p.cast("spark", { targets: "irelia" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("spark")).toBe("hand");
    expect(game.p2.can("cast", "spark")).toBe(true); // some other target (Bystander) is affordable
  });

  test("targeting Svellsongur directly costs NO Deflect: Salvage with exactly 2 + [order] and zero spare power kills the gear and P2 draws 1", async () => {
    const game = await ireliaWearingSvellOnP2Turn({ energy: 2, power: { order: 1 } });
    const hand = game.p2.hand().length;
    expect(game.p2.can("cast", "salvage")).toBe(true);
    await game.p2.cast("salvage", { targets: "svell" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } }); // nothing beyond Salvage's own cost
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "salvage", targets: ["svell"] })]);
    await game.settle();
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.zoneOf("svell")).toBe("trash");
    expect(game.state("irelia").attachments).toEqual([]);
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.p2.hand()).toHaveLength(hand - 1 + 1);
    expect(game.violations()).toEqual([]);
  });
});
