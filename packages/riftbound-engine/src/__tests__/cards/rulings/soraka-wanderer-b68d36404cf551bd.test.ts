/**
 * Ruling b68d36404cf551bd — Soraka, Wanderer (SFD-173 → sfd-173-221) · Unit · Order · 4 · 4 Might
 *     "I must be assigned combat damage last. If another unit you control here would die, if it has less Might than me,
 *      instead heal it, exhaust it, and recall it."
 *   × Blade of the Ruined King (SFD-178 → sfd-178-221) · Equipment · +4 · "[Equip] — [order], Kill a friendly unit"
 *
 * Q: If I kill something weaker than Soraka to pay the Blade's Equip cost, does Soraka "save" it?
 * A: Yes. Soraka's replacement turns that death into heal + exhaust + recall — the unit does not die — and a cost that
 *    was replaced still counts as paid, so the Blade attaches normally.
 * Rules: 369/371–373 (replacement effects on "would die"), 357.2.a (replaced costs are still paid), 818 (Equip).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SORAKA = "sfd-173-221";
const BOTRK = "sfd-178-221";

/** P1's turn with exactly [order]. Base: Soraka (4), a READY but damaged Pup (2 Might, 1 damage), the loose Blade. */
function board() {
  return scenario()
    .resources(P1, { power: { order: 1 } })
    .unit(P1, "base", SORAKA, "soraka")
    .unit(P1, "base", { might: 2, name: "Pup", tags: ["Dog"] }, "pup", { damage: 1 })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .gear(P1, BOTRK, "botrk");
}

/** Activate [Equip]: pay [order] + "kill" the Pup, attaching the Blade to Soraka. */
async function equipOntoSorakaKillingPup(game: Game): Promise<void> {
  const variants = game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants)
    .map((v) => ({ sacrificeId: v.params.sacrificeId, unitId: v.params.unitId }));
  expect(variants).toContainEqual({ sacrificeId: "pup", unitId: "soraka" });
  await game.p1.choose("equipCard", { params: { equipmentId: "botrk", unitId: "soraka" }, sacrifice: "pup" });
  expect(game.p1.power("order")).toBe(0);
}

describe("Ruling b68d36404cf551bd — Soraka saves the Equip-cost victim; the Blade still equips", () => {
  test("the Pup (2 < 4, here with Soraka) 'would die' for the cost → instead it is HEALED (1 → 0 damage), EXHAUSTED and recalled (stays in base); it never reaches the trash", async () => {
    const game = await board().build();
    expect(game.state("pup")).toMatchObject({ damage: 1, isReady: true, location: "base" });
    await equipOntoSorakaKillingPup(game);
    await game.settle();
    expect(game.zoneOf("pup")).toBe("base");
    expect(game.state("pup")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.p1.trash()).toEqual([]);
  });

  test("the replaced cost still counts as paid: the Equip resolves and the Blade is attached to Soraka (4 + 4 = 8)", async () => {
    const game = await board().build();
    await equipOntoSorakaKillingPup(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("botrk")).toMatchObject({ attachedTo: "soraka", controller: P1 });
    expect(game.state("soraka")).toMatchObject({ attachments: ["botrk"], might: 8 });
    expect(game.p1.units("base").sort()).toEqual(["pup", "soraka"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a victim NOT weaker than Soraka (Ox, 4 Might) is really killed for the cost; the Blade attaches all the same", async () => {
    const game = await scenario()
      .resources(P1, { power: { order: 1 } })
      .unit(P1, "base", SORAKA, "soraka")
      .unit(P1, "base", { might: 4, name: "Ox" }, "ox")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .gear(P1, BOTRK, "botrk")
      .build();
    await game.p1.choose("equipCard", { params: { equipmentId: "botrk", unitId: "soraka" }, sacrifice: "ox" });
    await game.settle();
    expect(game.zoneOf("ox")).toBe("trash");
    expect(game.state("soraka")).toMatchObject({ attachments: ["botrk"], might: 8 });
  });
});
