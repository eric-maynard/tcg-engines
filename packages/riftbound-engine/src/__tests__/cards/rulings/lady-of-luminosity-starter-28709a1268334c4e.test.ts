/**
 * Ruling 28709a1268334c4e — Lady of Luminosity - Starter (OGS-021 → ogs-021-024) · Legend (Lux)
 *     "When you play a spell that costs [5] or more, draw 1."
 *   × Falling Comet (OGN-085 → ogn-085-298) · Spell · Mind · 5 · [Action] "Deal 6 to a unit at a battlefield."
 *   × Applied Researchers (VEN-055 → ven-055-166) · Unit · 4 "[Empowered] → Your spells cost [1][rainbow] less, to a minimum of [1]."
 *
 * Q: With an empowered Applied Researchers making Falling Comet cost 4 instead of 5, does the Lux legend still draw 1?
 * A: Yes. The legend checks the spell's PRINTED cost, not what you actually paid; cost reductions lower the payment but not
 *    the card's cost for trigger purposes.
 * Rules: 131.4 (a card's cost is its printed cost; reductions change the payment, not the characteristic).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LUX_LEGEND = "ogs-021-024";
const FALLING_COMET = "ogn-085-298";
const APPLIED_RESEARCHERS = "ven-055-166";
/** A printed-4 spell: reduced to 3 it must NOT satisfy "costs [5] or more" either way. */
const BOLT4 = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 4,
  name: "Four-Bolt",
  timing: "action",
} as const;

/** P1's turn: Lux legend, EMPOWERED Applied Researchers in base ("the back line"), exactly 4 energy, Falling Comet in hand. P2: 7-Might Guard at bf1. */
function board() {
  return scenario()
    .legend(P1, LUX_LEGEND, "lux")
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", APPLIED_RESEARCHERS, "ar", { empowered: true })
    .unit(P2, "bf1", { might: 7, name: "Guard" }, "guard")
    .hand(P1, FALLING_COMET, "comet");
}

describe("Ruling 28709a1268334c4e — Lux's 'costs [5] or more' reads the printed cost, so a discounted Falling Comet still draws", () => {
  test("premise: the empowered Researchers discount Falling Comet to 4 — castable with exactly 4 energy — while the card's cost is still 5", async () => {
    const game = await board().build();
    expect(game.state("ar").isEmpowered).toBe(true);
    expect(game.state("comet").energyCost).toBe(5); // printed
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("cast", "comet")).toBe(true);
    await game.p1.cast("comet", { targets: "guard" });
    expect(game.p1.energy()).toBe(0); // paid 4, not 5
  });

  test("playing it for 4 still triggers the legend: P1 draws 1 (and the Comet deals its 6)", async () => {
    const game = await board().build();
    const deckBefore = game.p1.deck().length;
    await game.p1.cast("comet", { targets: "guard" });
    await game.settle();
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.state("guard").damage).toBe(6);
    expect(game.p1.hand()).toHaveLength(1); // Comet left, 1 drawn
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
    // (The harness's generic `costPaid` invariant does not model cost reductions; ignore it here.)
    expect(game.violations().filter((v) => v.invariant !== "costPaid")).toEqual([]);
  });

  test("control: without the Lux legend the same discounted Comet draws nothing (the draw really is the legend's)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", APPLIED_RESEARCHERS, "ar", { empowered: true })
      .unit(P2, "bf1", { might: 7, name: "Guard" }, "guard")
      .hand(P1, FALLING_COMET, "comet")
      .build();
    await game.p1.cast("comet", { targets: "guard" });
    await game.settle();
    expect(game.state("guard").damage).toBe(6);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("control: the check is on PRINTED cost both ways — a printed-4 spell (discounted to 3) does not draw", async () => {
    const game = await scenario()
      .legend(P1, LUX_LEGEND, "lux")
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", APPLIED_RESEARCHERS, "ar", { empowered: true })
      .unit(P2, "bf1", { might: 7, name: "Guard" }, "guard")
      .hand(P1, BOLT4, "bolt")
      .build();
    await game.p1.cast("bolt", { targets: "guard" });
    expect(game.p1.energy()).toBe(1); // 4 → 3
    await game.settle();
    expect(game.state("guard").damage).toBe(2);
    expect(game.p1.hand()).toHaveLength(0);
  });
});
