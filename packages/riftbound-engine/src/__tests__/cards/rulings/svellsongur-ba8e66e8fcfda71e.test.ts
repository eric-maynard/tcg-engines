/**
 * Ruling ba8e66e8fcfda71e — Svellsongur (SFD-059 → sfd-059-221) Equipment "[Equip] [1][calm] … As this is attached to a unit, copy
 *   that unit's text to this Equipment's effect text …" on Ornn, Forge God (sfd-085-221, [Deflect 2] …) × Salvage (OGN-224 →
 *   ogn-224-298) "You may kill up to one gear. Draw 1." × Detonate (SFD-005 → sfd-005-221) [1][fury] "Kill a gear. Its controller draws 2."
 *
 * Q: With Svellsongur on Ornn I have Deflect 4; if someone targets the GEAR with a spell, must they pay Deflect?
 * A: No. Deflect belongs to the unit; the attached Equipment is a separate object with no Deflect of its own (its copied text
 *    grants Deflect to the unit, not to itself). Targeting Svellsongur with Salvage/Detonate costs no extra Power; only choosing
 *    Ornn himself pays the Deflect 4.
 * Rules: 809.1 (Deflect taxes choosing THAT permanent), 718.2 / 135.4 (equipment text while attached), Svellsongur copy text.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ORNN_FORGE_GOD = "sfd-085-221";
const SVELLSONGUR = "sfd-059-221";
const SALVAGE = "ogn-224-298";
const DETONATE = "sfd-005-221";
const DISCIPLINE = "ogn-058-298"; // [2] "Give a unit +2 [Might] this turn. Draw 1." — a unit-targeting probe for the Deflect tax

/** P1's turn: Ornn at bf1, loose Svellsongur + its Equip cost. P2 holds Detonate, Salvage and Discipline for its own turn. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", ORNN_FORGE_GOD, "ornn")
    .gear(P1, SVELLSONGUR, "svell")
    .hand(P2, DETONATE, "deto")
    .hand(P2, SALVAGE, "salv")
    .hand(P2, DISCIPLINE, "disc");
}

/** Equip Svellsongur onto Ornn, pass to P2's turn and give P2 [6] + 6 fury + 1 order (fury doubles as "any domain" for Deflect). */
async function p2TurnWithSvellOnOrnn(): Promise<Game> {
  const game = await board().build();
  await game.p1.do("equipCard", { equipmentId: "svell", unitId: "ornn" });
  await game.settle();
  expect(game.state("svell").attachedTo).toBe("ornn");
  expect(game.state("svell").meta.copiedFromCardId).toBe("ornn"); // Ornn's text copied onto the Equipment
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.do("addResources", { energy: 6, power: { fury: 6, order: 1 } });
  expect(game.p2.resources()).toEqual({ energy: 6, power: { fury: 6, order: 1 } });
  return game;
}

describe("Ruling ba8e66e8fcfda71e — Deflect is Ornn's, not Svellsongur's: targeting the gear pays no Deflect", () => {
  test("premise: choosing ORNN with a spell (Discipline) costs the full Deflect 4 — [2] energy plus FOUR power of any domain", async () => {
    const game = await p2TurnWithSvellOnOrnn();
    await game.p2.cast("disc", { targets: "ornn" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", targets: ["ornn"] })]);
    expect(game.p2.resources()).toEqual({ energy: 4, power: { fury: 2, order: 1 } }); // 6 − 4 Deflect
  });

  test("Detonate targeting SVELLSONGUR pays only its printed [1][fury] — no Deflect surcharge — and kills the gear (P1 draws 2)", async () => {
    const game = await p2TurnWithSvellOnOrnn();
    const offered = (game.p2.option("cast", "deto")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect(offered).toContain("svell");
    const p1Hand = game.p1.hand().length;
    await game.p2.cast("deto", { targets: "svell" });
    expect(game.p2.resources()).toEqual({ energy: 5, power: { fury: 5, order: 1 } }); // exactly [1][fury]
    await game.settle();
    expect(game.zoneOf("deto")).toBe("trash");
    expect(game.zoneOf("svell")).toBe("trash");
    expect(game.state("ornn").attachments).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand + 2);
    expect(game.violations()).toEqual([]);
  });

  test("Salvage choosing SVELLSONGUR likewise pays only [2][order] — zero extra Power — and kills it (P2 draws 1)", async () => {
    const game = await p2TurnWithSvellOnOrnn();
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("salv", { targets: "svell" });
    expect(game.p2.resources()).toEqual({ energy: 4, power: { fury: 6, order: 0 } });
    await game.settle();
    expect(game.zoneOf("svell")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
  });

  test("a player with NO spare Power at all can still target the gear (Detonate legal with exactly [1][fury]) but cannot choose Ornn (Discipline illegal)", async () => {
    const game = await board().build();
    await game.p1.do("equipCard", { equipmentId: "svell", unitId: "ornn" });
    await game.settle();
    await game.advanceTurn();
    await game.p2.do("addResources", { energy: 3, power: { fury: 1 } });
    expect(game.p2.can("cast", "deto")).toBe(true);
    expect(game.p2.can("cast", "disc")).toBe(false); // Ornn is the only unit and his Deflect can't be paid
  });
});
