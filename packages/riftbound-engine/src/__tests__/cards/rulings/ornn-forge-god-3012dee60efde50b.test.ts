/**
 * Ruling 3012dee60efde50b — Ornn, Forge God (SFD-085 → sfd-085-221) · Champion · Mind · 6 · 4 Might
 *     "[Deflect 2] [Weaponmaster] I have +1 [Might] for each friendly gear."
 *   × Svellsongur (SFD-059 → sfd-059-221) · Equipment "[Equip] [1][calm] As this is attached to a unit, copy
 *     that unit's text to this Equipment's effect text for as long as this is attached to it."
 *
 * Q: Targeting Ornn equipped with Svellsongur — do I pay Deflect 2 or Deflect 4?
 * A: Deflect 4. Svellsongur copies Ornn's text (incl. Deflect 2) into its effect text, which is active and
 *    appended to the unit's text while attached; Deflect stacks, so 2 + 2 = 4 extra [rainbow] to choose him.
 * Rules: 809 (Deflect, stacking keyword), 716-718 (Equipment effect text appended to the unit), 356.4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ORNN = "sfd-085-221";
const SVELLSONGUR = "sfd-059-221";
/** A plain 1-cost enemy spell that chooses a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt",
  timing: "action",
};

/**
 * P2's turn 2: P2 has Ornn in base, Svellsongur loose in base and exactly its Equip cost. P2 equips it, the
 * turn passes to P1, who then floats 1 energy + `rainbow` universal power and holds Bolt.
 */
async function ornnWithSvellsongur(rainbow: number): Promise<Game> {
  const game = await scenario()
    .active(P2)
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .unit(P2, "base", ORNN, "ornn")
    .gear(P2, SVELLSONGUR, "svell")
    .hand(P1, BOLT, "bolt")
    .build();
  await game.p2.do("equipCard", { equipmentId: "svell", unitId: "ornn" });
  await game.settle();
  expect(game.state("svell").attachedTo).toBe("ornn");
  expect(game.state("svell").meta.copiedFromCardId).toBe("ornn"); // Ornn's text is copied onto the Equipment
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 1, power: { rainbow } });
  expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow } });
  return game;
}

describe("Ruling 3012dee60efde50b — Ornn + Svellsongur has two stacking instances of Deflect 2 = Deflect 4", () => {
  test("control: Ornn alone has Deflect 2 — choosing him with Bolt costs P1 exactly 2 extra [rainbow]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 2 } })
      .unit(P2, "base", ORNN, "ornn")
      .hand(P1, BOLT, "bolt")
      .build();
    expect(game.state("ornn").keywords).toContain("Deflect");
    await game.p1.cast("bolt", { targets: "ornn" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    // And 1 [rainbow] is not enough.
    const short = await scenario().resources(P1, { energy: 1, power: { rainbow: 1 } }).unit(P2, "base", ORNN, "ornn").hand(P1, BOLT, "bolt").build();
    const offered = (short.p1.option("cast", "bolt")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).not.toContain("ornn");
  });

  // With Svellsongur attached the copied Deflect 2 stacks with the printed one → 4 [rainbow] are charged.
  test("ruling 3012dee60efde50b — Bolt on Svellsongur-Ornn costs 4 extra [rainbow] (809, 718)", async () => {
    const game = await ornnWithSvellsongur(4);
    await game.p1.cast("bolt", { targets: "ornn" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bolt", controller: P1 })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  // 3 [rainbow] cannot cover Deflect 4, so Ornn is not a legal choice for Bolt at all.
  test("ruling 3012dee60efde50b — 3 [rainbow] cannot choose Svellsongur-Ornn; Deflect 4 is unaffordable (809)", async () => {
    const game = await ornnWithSvellsongur(3);
    const offered = (game.p1.option("cast", "bolt")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).not.toContain("ornn");
    const r = await game.p1.try((p) => p.cast("bolt", { targets: "ornn" }));
    expect(r.ok).toBe(false);
  });
});
