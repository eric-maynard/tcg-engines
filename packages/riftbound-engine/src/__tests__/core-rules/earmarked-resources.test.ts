/**
 * Core rules: EARMARKED resources — "Use only to play X / use X abilities" (rule 429.4) is a gate on
 * every REMOVAL from the pool (rule 444.1: paying = removing), not just on card plays.
 *
 * Two printed earmarks drive the matrix:
 *   Fire Below the Mountain (sfd-189-221, Legend) "[Exhaust]: [Reaction] — [Add] [rainbow].
 *     Use only to play gear or use gear abilities."
 *   Daughter of the Void   (ogn-247-298, Legend) "[Exhaust]: [Reaction] — [Add] [rainbow].
 *     Use only to play spells."
 *
 * Purposes exercised: playing a unit / a spell / a gear, activating a UNIT's ability, activating a
 * GEAR's ability, and a Standard Move's applied cost (Mageseeker Investigator unl-163-219, rule
 * 204.4) — which is neither a play nor an ability, so no earmark may fund it.
 *
 * Rules: 429.4 (the earmark), 444.1 (paying = removing from the pool), 135.2.e.5.a ([rainbow] pays a
 * Power pip of any Domain), 204.4.c (an unpayable applied cost makes the action illegal).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const FIRE_BELOW = "sfd-189-221"; // gear-only rainbow
const DAUGHTER = "ogn-247-298"; // spell-only rainbow
const INVESTIGATOR = "unl-163-219";

/** 1-pip cards, one per type, so the single rainbow is the only thing that could pay. */
const PIP_UNIT = { cardType: "unit", domain: "calm", energyCost: 0, might: 1, name: "Pip Unit", powerCost: ["calm"] };
const PIP_SPELL = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Pip Spell",
  powerCost: ["calm"],
  timing: "action",
};
const PIP_GEAR = { cardType: "gear", domain: "calm", energyCost: 0, name: "Pip Gear", powerCost: ["calm"] };

/** A gear and a unit already on the board, each with a 1-pip activated ability. */
const ABILITY_GEAR = {
  abilities: [{ cost: { power: ["calm"] }, effect: { amount: 1, type: "draw" }, type: "activated" }],
  cardType: "gear",
  domain: "calm",
  energyCost: 0,
  name: "Trinket",
};
const ABILITY_UNIT = {
  abilities: [{ cost: { power: ["calm"] }, effect: { amount: 1, type: "draw" }, type: "activated" }],
  cardType: "unit",
  domain: "calm",
  energyCost: 0,
  might: 1,
  name: "Tinkerer",
};

/** P1's open main phase, empty pool, the named legend ready; every payer probe on board or in hand. */
function board(legend: string) {
  return scenario()
    .legend(P1, legend, "legend")
    .gear(P1, ABILITY_GEAR, "trinket")
    .unit(P1, "base", ABILITY_UNIT, "tinkerer")
    .hand(P1, PIP_UNIT, "pipUnit")
    .hand(P1, PIP_SPELL, "pipSpell")
    .hand(P1, PIP_GEAR, "pipGear");
}

describe("earmarked resources are checked at every payer, not only at card plays (429.4 / 444.1)", () => {
  test("with an EMPTY pool nothing at all is payable — the matrix's zero row", async () => {
    const game = await board(FIRE_BELOW).build();
    expect(game.p1.can("play", "pipUnit")).toBe(false);
    expect(game.p1.can("cast", "pipSpell")).toBe(false);
    expect(game.p1.can("play", "pipGear")).toBe(false);
    expect(game.p1.can("activate", "trinket")).toBe(false);
    expect(game.p1.can("activate", "tinkerer")).toBe(false);
  });

  test("gear earmark (Fire Below): the rainbow plays GEAR and pays a GEAR ability — never a unit, a spell, or a unit's ability", async () => {
    const game = await board(FIRE_BELOW).build();
    await game.p1.activate("legend");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.p1.can("play", "pipGear")).toBe(true);
    expect(game.p1.can("activate", "trinket")).toBe(true);
    expect(game.p1.can("play", "pipUnit")).toBe(false);
    expect(game.p1.can("cast", "pipSpell")).toBe(false);
    expect(game.p1.can("activate", "tinkerer")).toBe(false);
  });

  test("spell earmark (Daughter): the rainbow casts a SPELL and nothing else — not a gear, not a gear ability, not a unit ability", async () => {
    const game = await board(DAUGHTER).build();
    await game.p1.activate("legend");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.p1.can("cast", "pipSpell")).toBe(true);
    expect(game.p1.can("play", "pipGear")).toBe(false);
    expect(game.p1.can("activate", "trinket")).toBe(false);
    expect(game.p1.can("play", "pipUnit")).toBe(false);
    expect(game.p1.can("activate", "tinkerer")).toBe(false);
  });

  test("spending on a purpose the earmark allows burns the earmarked pip first, so nothing keeps taxing later payments", async () => {
    const game = await board(DAUGHTER).build();
    await game.p1.activate("legend");
    await game.p1.cast("pipSpell");
    await game.settle();
    expect(game.p1.power()).toBe(0);
    expect(game.p1.energy()).toBe(0);
    expect(game.gameState.restrictedPower?.[P1]?.spell?.rainbow ?? 0).toBe(0);
  });

  test("a move's applied cost (204.4) is neither a play nor an ability — no earmark can fund it, whichever earmark it is", async () => {
    for (const legend of [FIRE_BELOW, DAUGHTER]) {
      const game = await scenario()
        .legend(P1, legend, "legend")
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", INVESTIGATOR, "msi")
        .unit(P1, "base", { might: 3, name: "MoverA" }, "a")
        .unit(P1, "base", { might: 3, name: "MoverB" }, "b")
        .build();
      await game.p1.activate("legend");
      expect(game.p1.power()).toBe(1);
      const pairOffered = (game.p1.option("standardMove:to:bf1")?.variants ?? []).some(
        (v) => ((v.params.unitIds as string[]) ?? []).length === 2,
      );
      expect(pairOffered).toBe(false);
      const r = await game.p1.try((p) => p.move(["a", "b"], "bf1"));
      expect(r.ok).toBe(false);
      expect(game.locationOf("a")).toBe("base");
      expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    }
  });
});
