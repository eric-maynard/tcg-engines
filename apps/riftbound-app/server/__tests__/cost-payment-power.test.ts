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
