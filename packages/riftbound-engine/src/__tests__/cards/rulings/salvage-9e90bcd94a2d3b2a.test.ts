/**
 * Ruling 9e90bcd94a2d3b2a — Salvage (OGN-224 → ogn-224-298) · Spell · Order · [2][order] · Action
 *     "You may kill up to one gear. Draw 1."
 *   × Svellsongur (SFD-059 → sfd-059-221) · Equipment · Calm · [3][calm] · "[Equip] [1][calm] … As this is attached to a
 *     unit, copy that unit's text to this Equipment's effect text for as long as this is attached to it."
 *   × Ornn, Forge God (SFD-085 → sfd-085-221) · Unit · 4 Might · "[Deflect 2] [Weaponmaster] I have +1 [Might] for each
 *     friendly gear."
 *
 * Q: Can Salvage kill a Svellsongur attached to Ornn, Forge God without paying Ornn's [Deflect 2]?
 * A: Yes. Deflect (printed on Ornn, and the copy Svellsongur carries) protects the UNIT, not the Equipment. Salvage
 *    chooses the gear, not Ornn, so no Deflect surcharge applies; the Equipment is killed.
 * Rules: 809.1 (Deflect: opponents pay to choose "me" — the unit), 718.5.a/b (an attached Equipment is still a
 *        gear that can be chosen), 355 (only the chosen object's restrictions apply).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SALVAGE = "ogn-224-298";
const SVELLSONGUR = "sfd-059-221";
const ORNN = "sfd-085-221";

/** P1's turn with EXACTLY [2][order] (nothing spare for a Deflect surcharge). P2's Ornn in base wears P2's Svellsongur. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", ORNN, "ornn", { equippedWith: ["svell"] } as Record<string, unknown>)
    .card("svell", { def: SVELLSONGUR, meta: { attachedTo: "ornn" } as Record<string, unknown>, owner: P2, zone: "base" })
    .hand(P1, SALVAGE, "salvage");
}

describe("Ruling 9e90bcd94a2d3b2a — Salvage kills a Svellsongur worn by Ornn without paying Deflect", () => {
  test("premise: Svellsongur is attached to Ornn (a friendly gear → Ornn is 4 + 1 = 5) and Ornn has Deflect", async () => {
    const game = await board().build();
    expect(game.state("svell")).toMatchObject({ attachedTo: "ornn", controller: P2, owner: P2 });
    expect(game.state("ornn")).toMatchObject({ attachments: ["svell"], might: 5 });
    expect(game.state("ornn").keywords).toContain("Deflect");
  });

  test("with only [2][order] floating, Salvage is castable and offers the attached Svellsongur as its gear — no Deflect surcharge is attached to that choice", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "salvage")).toBe(true);
    const field = game.p1.option("cast", "salvage")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toContain("svell");
    expect((field?.options ?? []).flat()).not.toContain("ornn"); // Salvage never chooses the unit
  });

  test("casting it at Svellsongur costs exactly [2][order] (power untouched beyond the pip), resolves, kills the Equipment into P2's trash, and P1 draws 1; Ornn drops to 4", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    await game.p1.cast("salvage", { targets: "svell" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "salvage", controller: P1, targets: ["svell"] })]);
    await game.settle();
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.zoneOf("svell")).toBe("trash");
    expect(game.p2.trash()).toContain("svell");
    expect(game.state("ornn")).toMatchObject({ attachments: [], might: 4, zone: "base" });
    expect(game.p1.hand()).toHaveLength(p1Hand - 1 + 1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a spell that chooses ORNN himself does carry the Deflect 2 surcharge — with no spare power P1 cannot name him", async () => {
    const WOUND = {
      abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "order",
      energyCost: 0,
      name: "Wound",
      timing: "action",
    } as const;
    const game = await board().hand(P1, WOUND, "wound").unit(P1, "base", { might: 1, name: "Pal" }, "pal").build();
    const offered = (game.p1.option("cast", "wound")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["pal"]); // Ornn (Deflect 2, nothing to pay it with) is not a legal choice
    const r = await game.p1.try((p) => p.cast("wound", { targets: "ornn" }));
    expect(r.ok).toBe(false);
    // …whereas with two spare power he becomes choosable.
    await game.p1.do("addResources", { power: { rainbow: 2 } });
    const offeredNow = (game.p1.option("cast", "wound")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offeredNow.toSorted()).toEqual(["ornn", "pal"]);
    expect(game.state("ornn").damage).toBe(0);
  });
});
