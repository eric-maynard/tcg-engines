/**
 * rule 357.1 — "In total, pay the combined Energy cost (if any) and Power cost
 * (if any)". The cost-payment bar in public/js/gameplay/interactions.js used to
 * read `payableEnergyCost` only, so Immortal Phoenix (ogn-037-298: 3 energy +
 * one [fury] pip) was announced as "0 / 3" and flipped to the play buttons at
 * 3 energy with zero fury paid.
 *
 * Same sandbox-eval pattern as play-block-reason.test.ts: the browser script is
 * evaluated with stub globals, no DOM library.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

interface Card {
  energyCost?: number;
  effectiveEnergyCost?: number;
  powerCost?: string[];
  effectivePowerCost?: string[];
}
interface Pool { energy?: number; power?: Record<string, number> }
interface Api {
  payablePowerCost(card: Card | null): string[];
  unpaidPowerPips(card: Card | null, pool?: Pool): string[];
  costPaymentCostState(card: Card | null, currentEnergy: number, pool?: Pool): {
    energy: number;
    pips: string[];
    unmetPips: string[];
    isAffordable: boolean;
  };
  costShortfallIsReachable(args: {
    needed: number;
    pips: number;
    unmetPips: number;
    currentEnergy: number;
    readyRunes: number;
    recyclableRunes: number;
  }): boolean;
  runeCostAffordance(args: {
    canExhaust: boolean;
    canRecycle: boolean;
    domain: string | null;
    energyShortfall: number;
    unmetPips: string[];
  }): "exhaust" | "recycle" | null;
}

function loadInteractions(): Api {
  const src = readFileSync(path.resolve(import.meta.dir, "../../public/js/gameplay/interactions.js"), "utf8");
  const mod: { exports?: Api } = { exports: {} as Api };
  const doc = {
    readyState: "complete",
    addEventListener() {},
    getElementById: () => null,
    querySelectorAll: () => [],
  };
  const fn = new Function("module", "document", `${src}\nreturn module.exports;`);
  return fn(mod, doc) as Api;
}

const API = loadInteractions();

/** ogn-037-298 Immortal Phoenix — energy 3, power 1 fury (derivePowerCost). */
const phoenix: Card = { energyCost: 3, powerCost: ["fury"] };

describe("payablePowerCost", () => {
  test("printed pips, and the server-priced list wins (rule 356.3)", () => {
    expect(API.payablePowerCost(phoenix)).toEqual(["fury"]);
    expect(API.payablePowerCost({ ...phoenix, effectivePowerCost: [] })).toEqual([]);
    expect(API.payablePowerCost({ energyCost: 1 })).toEqual([]);
  });
});

describe("unpaidPowerPips", () => {
  test("empty pool leaves the pip unpaid; matching power covers it", () => {
    expect(API.unpaidPowerPips(phoenix, { energy: 3, power: {} })).toEqual(["fury"]);
    expect(API.unpaidPowerPips(phoenix, { energy: 3, power: { fury: 1 } })).toEqual([]);
    expect(API.unpaidPowerPips(phoenix, { energy: 3, power: { calm: 1 } })).toEqual(["fury"]);
  });

  test("pips are consumed one per pool point", () => {
    const twoFury: Card = { energyCost: 0, powerCost: ["fury", "fury"] };
    expect(API.unpaidPowerPips(twoFury, { power: { fury: 1 } })).toEqual(["fury"]);
    expect(API.unpaidPowerPips(twoFury, { power: { fury: 2 } })).toEqual([]);
  });

  test("[rainbow] takes any domain, and the coloured pip is settled first", () => {
    const mixed: Card = { energyCost: 0, powerCost: ["rainbow", "fury"] };
    expect(API.unpaidPowerPips(mixed, { power: { fury: 1 } })).toEqual(["rainbow"]);
    expect(API.unpaidPowerPips(mixed, { power: { fury: 1, calm: 1 } })).toEqual([]);
  });
});

describe("costPaymentCostState (rule 357.1)", () => {
  test("BUG repro: 3 energy with no fury is NOT affordable", () => {
    const state = API.costPaymentCostState(phoenix, 3, { energy: 3, power: {} });
    expect(state.energy).toBe(3);
    expect(state.pips).toEqual(["fury"]);
    expect(state.unmetPips).toEqual(["fury"]);
    expect(state.isAffordable).toBe(false);
  });

  test("affordable only once both halves are covered", () => {
    expect(API.costPaymentCostState(phoenix, 3, { energy: 3, power: { fury: 1 } }).isAffordable).toBe(true);
    expect(API.costPaymentCostState(phoenix, 2, { energy: 2, power: { fury: 1 } }).isAffordable).toBe(false);
  });

  test("energy-only costs are unchanged", () => {
    const state = API.costPaymentCostState({ energyCost: 2 }, 2, { energy: 2, power: {} });
    expect(state.pips).toEqual([]);
    expect(state.isAffordable).toBe(true);
  });
});

/**
 * rule 203.3 — "if the action of a cost is impossible, the cost cannot be paid".
 * The payment bar used to open on the mere existence of ONE exhaustRune move, so
 * Shadow Order Disciple (ven-095-166, energy 2) armed cost payment at 0 energy with
 * a single ready rune: "0 / 2 — Exhaust runes to generate energy" whose only exit
 * was Cancel.
 */
describe("costShortfallIsReachable (rule 203.3)", () => {
  test("BUG repro: 2 energy, 0 in pool, one ready rune is unreachable", () => {
    expect(API.costShortfallIsReachable({
      needed: 2, pips: 0, unmetPips: 0, currentEnergy: 0, readyRunes: 1, recyclableRunes: 3,
    })).toBe(false);
  });

  test("a second ready rune makes the same cost reachable", () => {
    expect(API.costShortfallIsReachable({
      needed: 2, pips: 0, unmetPips: 0, currentEnergy: 0, readyRunes: 2, recyclableRunes: 3,
    })).toBe(true);
  });

  test("pool energy counts toward the shortfall", () => {
    expect(API.costShortfallIsReachable({
      needed: 3, pips: 0, unmetPips: 0, currentEnergy: 2, readyRunes: 1, recyclableRunes: 0,
    })).toBe(true);
  });

  test("every pip covers a point of the energy cost, and needs a rune to recycle", () => {
    // 3 energy + [chaos]: pool 2, one ready rune → 3 - 1 pip - 2 pool = 0 generic.
    expect(API.costShortfallIsReachable({
      needed: 3, pips: 1, unmetPips: 1, currentEnergy: 2, readyRunes: 1, recyclableRunes: 1,
    })).toBe(true);
    // …but with nothing left to recycle the pip can never be paid.
    expect(API.costShortfallIsReachable({
      needed: 3, pips: 1, unmetPips: 1, currentEnergy: 2, readyRunes: 1, recyclableRunes: 0,
    })).toBe(false);
  });
});

/**
 * rule 164.2 — Exhaust adds Energy (164.2.a); Recycle adds Power of the rune's
 * Domain (164.2.b) and is legal on an exhausted rune. Cost-payment mode used to
 * wire only "exhaust", so Seal of Discord (ogn-204-298, "0 / 0 + [chaos]") badged
 * every rune "TAP" — including a Fury rune that can never pay a [chaos] pip — and
 * the click dead-ended in "Rune is already exhausted".
 */
describe("runeCostAffordance (rule 164.2)", () => {
  const pipOnly = { energyShortfall: 0, unmetPips: ["chaos"] };

  test("BUG repro: a Chaos rune pays the [chaos] pip by recycling, not tapping", () => {
    expect(API.runeCostAffordance({ canExhaust: true, canRecycle: true, domain: "chaos", ...pipOnly }))
      .toBe("recycle");
  });

  test("BUG repro: a Fury rune offers nothing toward a [chaos]-only shortfall", () => {
    expect(API.runeCostAffordance({ canExhaust: false, canRecycle: true, domain: "fury", ...pipOnly }))
      .toBe(null);
  });

  test("an exhausted Chaos rune still recycles for the pip (rule 414.1.b is no bar)", () => {
    expect(API.runeCostAffordance({ canExhaust: false, canRecycle: true, domain: "chaos", ...pipOnly }))
      .toBe("recycle");
  });

  test("an open energy shortfall takes the ready rune first", () => {
    expect(API.runeCostAffordance({
      canExhaust: true, canRecycle: true, domain: "chaos", energyShortfall: 1, unmetPips: ["chaos"],
    })).toBe("exhaust");
  });

  test("[rainbow] pips accept any Domain", () => {
    expect(API.runeCostAffordance({
      canExhaust: false, canRecycle: true, domain: "fury", energyShortfall: 0, unmetPips: ["rainbow"],
    })).toBe("recycle");
  });

  test("no pips outstanding and nothing to exhaust = no affordance", () => {
    expect(API.runeCostAffordance({
      canExhaust: false, canRecycle: true, domain: "fury", energyShortfall: 1, unmetPips: [],
    })).toBe(null);
  });
});
