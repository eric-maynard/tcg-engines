/**
 * Ruling baa37e8d7be3d671 — Heimerdinger, Inventor (OGN-111 → ogn-111-298) · Unit · [3][mind] · 3 [Might]
 *   "I have all [Exhaust] abilities of all friendly legends, units, and gear."
 *   × Herald of the Arcane (OGN-265 → ogn-265-298) · Legend · "[1], [Exhaust]: Play a 1 [Might] Recruit unit token."
 *   × Hand of Noxus (OGN-253 → ogn-253-298) · Legend · "[Exhaust]: [Reaction], [Legion] — [Add] [1]."
 *
 * Q: Does Heimerdinger get exhausted and pay the costs of the abilities he copies, or does he just get the effect?
 * A: He has the ability, costs and all: HE is the one exhausted, and the Energy part is paid too. A copied ability
 *    that carries [Reaction] can still be used at reaction speed even though Heimerdinger has no [Reaction] himself.
 * Rules: 402/404 (activation costs), 205 (exhaust as a cost), 419.2 ([Reaction] lives on the ability, not the card).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const HEIMERDINGER = "ogn-111-298";
const HERALD_OF_THE_ARCANE = "ogn-265-298";
const HAND_OF_NOXUS = "ogn-253-298";
const CLEAVE = "ogn-004-298";

/** P1's turn: Heimerdinger in base beside Viktor's Legend, 1 energy — exactly the copied ability's cost. */
function board() {
  return scenario()
    .legend(P1, HERALD_OF_THE_ARCANE, "herald")
    .unit(P1, "base", HEIMERDINGER, "heimer")
    .resources(P1, { energy: 1 });
}

describe("Ruling baa37e8d7be3d671 — Heimerdinger pays the full cost of every ability he borrows", () => {
  test("he really does offer the Legend's [Exhaust] ability", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "heimer")).toBe(true);
  });

  test("using it exhausts HEIMERDINGER and spends the [1] — the Legend itself stays ready", async () => {
    const game = await board().build();
    await game.p1.activate("heimer", 0);
    await game.settle();
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.state("herald").isExhausted).toBe(false);
    expect(game.p1.energy()).toBe(0);
    const recruits = game.p1.units("base").filter((u) => u !== "heimer");
    expect(recruits).toHaveLength(1);
    expect(game.state(recruits[0]!)).toMatchObject({ baseMight: 1, isToken: true });
  });

  test("with an empty pool the copied ability is not offered — the Energy part of the cost is real", async () => {
    const game = await board().resources(P1, { energy: 0 }).build();
    expect(game.p1.can("activate", "heimer")).toBe(false);
    const attempt = await game.p1.try((p) => p.activate("heimer", 0));
    expect(attempt.ok).toBe(false);
    expect(game.state("heimer").isExhausted).toBe(false);
  });

  test("the two copies are separate: the Legend can still be exhausted for a second Recruit", async () => {
    const game = await board().resources(P1, { energy: 2 }).build();
    await game.p1.activate("heimer", 0);
    await game.settle();
    await game.p1.activate("herald", 0);
    await game.settle();
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.state("herald").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.units("base").filter((u) => u !== "heimer")).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });

  test("[Reaction] rides on the ability: Heimerdinger uses Hand of Noxus' Add with a spell already on the Chain", async () => {
    const game = await scenario()
      .legend(P1, HAND_OF_NOXUS, "noxus")
      .unit(P1, "base", HEIMERDINGER, "heimer")
      .hand(P1, CLEAVE, "cleave")
      .resources(P1, { energy: 1 })
      .build();
    expect(game.state("heimer").keywords).not.toContain("Reaction");
    await game.p1.cast("cleave", { targets: "heimer" }); // a card played ⇒ [Legion] is on, and the Chain is busy
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    expect(game.p1.energy()).toBe(0);
    await game.p1.activate("heimer", 0); // at reaction speed, mid-Chain
    expect(game.p1.energy()).toBe(1);
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.state("noxus").isExhausted).toBe(false);
  });
});
