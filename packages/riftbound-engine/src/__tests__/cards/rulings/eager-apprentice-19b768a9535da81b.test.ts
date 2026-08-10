/**
 * Ruling 19b768a9535da81b — Eager Apprentice (OGN-084 → ogn-084-298) · Unit · Mind · 3
 *   "While I'm at a battlefield, the Energy costs for spells you play is reduced by [1], to a minimum of [1]."
 *   × Lady of Luminosity (Lux legend, OGS-021 → ogs-021-024) "When you play a spell that costs [5] or more, draw 1."
 *   (spells used: Falling Comet ogn-085-298, printed 5 · Primal Strength ogn-154-298, printed 4 + [body])
 *
 * Q: Does reducing a 5-cost spell with Eager Apprentice stop Lux's legend ability from triggering?
 * A: No. Lux looks only at the PRINTED cost; discounts apply only while paying. A printed-5 spell paid for 4 still
 *    triggers the draw (and a printed-4 spell never does).
 * Rules: 128 (cost = printed characteristic), 356.4 (cost reductions apply during payment only).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EAGER_APPRENTICE = "ogn-084-298";
const LUX_LEGEND = "ogs-021-024";
const FALLING_COMET = "ogn-085-298"; // 5 · Deal 6 to a unit at a battlefield
const PRIMAL_STRENGTH = "ogn-154-298"; // 4 + [body] · Give a unit +7 Might this turn

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .legend(P1, LUX_LEGEND, "lux")
    .unit(P1, "bf1", EAGER_APPRENTICE, "apprentice")
    .unit(P2, "bf1", { might: 7, name: "Big Foe" }, "foe")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["top1", "top2"])
    .hand(P1, FALLING_COMET, "comet")
    .hand(P1, PRIMAL_STRENGTH, "primal");
}

describe("Ruling 19b768a9535da81b — Lux's legend reads the printed cost; Eager Apprentice's discount doesn't matter", () => {
  test("Falling Comet (printed 5) with the Apprentice at a battlefield is PAID as 4 …", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "comet")).toBe(true); // only 4 energy available — enough thanks to the discount
    await game.p1.cast("comet", { targets: "foe" });
    expect(game.p1.energy()).toBe(0); // 4 paid, not 5
  });

  test("… yet Lux still sees a spell that 'costs [5] or more': her trigger fires and P1 draws 1", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("comet", { targets: "foe" });
    expect(game.p1.energy()).toBe(0);
    // Pass priorities until the chain is empty, noting whether Lux's triggered ability ever sat on it.
    let sawLuxTrigger = false;
    for (let i = 0; i < 10 && game.decision()?.kind === "action" && game.chain().length > 0; i++) {
      sawLuxTrigger ||= game.chain().some((c) => c.cardId === "lux" && c.triggered);
      await game.acting().passPriority();
    }
    expect(sawLuxTrigger).toBe(true);
    await game.settle();
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.state("foe").damage).toBe(6);
    expect(game.p1.hand()).toContain("top1");
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1); // cast Comet, drew 1
  });

  test("contrast: Primal Strength (printed 4) is discounted to 3 but never triggers Lux — printed cost below 5", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("primal", { targets: "apprentice" });
    expect(game.p1.energy()).toBe(1); // 4 − 3
    expect(game.chain().some((c) => c.cardId === "lux")).toBe(false);
    await game.settle();
    expect(game.state("apprentice").might).toBe(10);
    expect(game.p1.hand()).not.toContain("top1");
    expect(game.p1.hand()).toHaveLength(handBefore - 1);
  });

  test("control: without the Apprentice at a battlefield Falling Comet needs the full 5 (4 energy is not enough)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P1 })
      .legend(P1, LUX_LEGEND, "lux")
      .unit(P1, "base", EAGER_APPRENTICE, "apprentice") // in base → no discount
      .unit(P2, "bf1", { might: 7, name: "Big Foe" }, "foe")
      .hand(P1, FALLING_COMET, "comet")
      .build();
    expect(game.p1.can("cast", "comet")).toBe(false);
  });
});
