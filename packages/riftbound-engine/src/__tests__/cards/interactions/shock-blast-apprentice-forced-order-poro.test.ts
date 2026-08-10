/**
 * Interaction: Shock Blast (ven-059-166) · Spell · Mind · 3+[mind] · [Action]
 *     "This costs [2] less if you control something that's [Empowered]. Deal 4 to a unit at a battlefield."
 *   × Eager Apprentice (ogn-084-298) · Unit · Mind · 3 · 3 Might
 *     "While I'm at a battlefield, the Energy costs for spells you play is reduced by [1], to a minimum of [1]."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 · 2 Might · [Deflect]
 *     "(Opponents must pay [rainbow] to choose me with a spell or ability.)"
 *   (+ Frostcoat Mother ven-032-166, already Empowered — "[Empowered][>] I have +3 [Might]" — as the
 *      "something that's [Empowered]" P1 controls.)
 *
 * Question: P1 controls an Empowered Frostcoat Mother and Eager Apprentice AT a battlefield, and casts Shock Blast at
 * P2's Pouty Poro at a battlefield.
 *   (a) Exact total — 0 or 1 energy? Does the Apprentice's "minimum of [1]" stop Shock Blast's own −2 from
 *       reaching 0, and does anyone decide the order?
 *   (b) Nothing Empowered: total?   (c) Apprentice in base (Empowered present): total?
 *   (d) In every case: what power is owed, and may the Deflect pip be any domain?
 *
 * Rules: 356.1 (base 3+[mind]), 356.2.a.2 + 809.1.c/809.1.c.1 (Poro chosen → +1 power of ANY domain, mandatory),
 * 356.4.b/356.4.c/356.4.d (a discount on the Energy COMPONENT — Apprentice — is applied before a discount on the
 * total cost — Shock Blast's own: 3 → 2 → 0), 356.4.e (Apprentice's floor binds only Apprentice's discount),
 * 356.4.c.1 (even under "any order" the player would pick this order), 356.6 (floor 0). The order is fixed by the
 * rules — no player decision, one payment.
 *
 * Expected: (a) 0 energy + [mind] + 1 any-domain pip; playable from {energy 0, mind 1, calm 1}; no ordering or
 * payment prompt. (b) 3 → 2 (Apprentice) = 2 energy + [mind] + pip; 1 energy is short. (c) 3 − 2 = 1 energy +
 * [mind] + pip; 0 energy is short. (d) power is never discounted: always [mind] + one pip of any domain (calm /
 * fury / order / a second mind all work; with no spare pip the Poro is simply not offered); the Poro takes 4 and dies.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHOCK_BLAST = "ven-059-166";
const EAGER_APPRENTICE = "ogn-084-298";
const POUTY_PORO = "ogn-013-298";
const FROSTCOAT_MOTHER = "ven-032-166";

interface BoardOpts {
  readonly energy: number;
  /** Power beyond nothing: defaults to exactly one [mind]. */
  readonly power?: Record<string, number>;
  /** P1 controls an Empowered Frostcoat Mother in base (default true). */
  readonly empowered?: boolean;
  /** Where Eager Apprentice stands (default bf1); null = absent. */
  readonly apprenticeAt?: "bf1" | "base" | null;
}

/**
 * P1's turn, Neutral Open. P2 controls bf1 with Pouty Poro (Deflect) and a plain 2-Might unit (a Deflect-free
 * control target). P1 holds Shock Blast; optionally an Empowered Frostcoat Mother in base and Eager Apprentice
 * at bf1 / in base.
 */
function board({ energy, power = { mind: 1 }, empowered = true, apprenticeAt = "bf1" }: BoardOpts) {
  let s = scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .unit(P2, "bf1", { might: 2, name: "Plain" }, "plain")
    .hand(P1, SHOCK_BLAST, "blast");
  if (apprenticeAt !== null) {
    s = s.unit(P1, apprenticeAt, EAGER_APPRENTICE, "apprentice");
  }
  if (empowered) {
    s = s.unit(P1, "base", FROSTCOAT_MOTHER, "mother", { empowered: true });
  }
  return s;
}

/** The set of card ids Shock Blast may be aimed at right now (empty when it is not castable). */
function targetsOffered(game: Game): string[] {
  const field = game.p1.option("cast", "blast")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

describe("setup", () => {
  test("Frostcoat Mother is Empowered (3+3 = 6), the Apprentice stands at bf1, Shock Blast prints 3 + [mind]", async () => {
    const game = await board({ energy: 0, power: { calm: 1, mind: 1 } }).build();
    expect(game.state("mother")).toMatchObject({ isEmpowered: true, might: 6, zone: "base" });
    expect(game.locationOf("apprentice")).toBe("bf1");
    expect(game.state("blast")).toMatchObject({ energyCost: 3, powerCost: ["mind"] });
    expect(game.state("poro").keywords).toContain("Deflect");
  });
});

describe("(a) Empowered + Apprentice at a battlefield → 0 energy + [mind] + 1 any-domain Deflect pip", () => {
  test("castable at the Poro from exactly {energy 0, mind 1, calm 1}; everything is spent — total energy 0, not 1 (356.4.c/d/e, 356.6)", async () => {
    const game = await board({ energy: 0, power: { calm: 1, mind: 1 } }).build();
    expect(game.p1.can("cast", "blast")).toBe(true);
    expect(targetsOffered(game)).toContain("poro");
    await game.p1.cast("blast", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blast", controller: P1, targets: ["poro"] })]);
  });

  test("with spare energy the engine still charges 0 energy (Apprentice 3→2 first, then −2 → 0) — 5 in, 5 left; only [mind] + the calm pip go", async () => {
    const game = await board({ energy: 5, power: { calm: 1, mind: 1 } }).build();
    await game.p1.cast("blast", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 5, power: { calm: 0, mind: 0 } });
  });

  test("no ordering decision and a single implicit payment: right after the cast the next decision is P1's own priority on the chain", async () => {
    const game = await board({ energy: 0, power: { calm: 1, mind: 1 } }).build();
    const r = await game.p1.cast("blast", { targets: "poro" });
    expect(r.executed.filter((m) => m.auto !== true).map((m) => m.moveId)).toEqual(["playSpell"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.decision()?.kind).not.toBe("order");
    expect(game.decision()?.kind).not.toBe("integer");
  });

  test("on resolution the Poro takes 4 (≥ 2) and dies; Shock Blast goes to the trash", async () => {
    const game = await board({ energy: 0, power: { calm: 1, mind: 1 } }).build();
    await game.p1.cast("blast", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("blast")).toBe("trash");
    expect(game.zoneOf("plain")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) nothing Empowered, Apprentice at a battlefield → 2 energy + [mind] + pip", () => {
  test("5 energy + mind + fury at the Poro leaves exactly 3 energy (paid 2), mind and fury spent", async () => {
    const game = await board({ empowered: false, energy: 5, power: { fury: 1, mind: 1 } }).build();
    await game.p1.cast("blast", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 0, mind: 0 } });
  });

  test("2 energy is exactly enough; 1 energy is short (Apprentice's own floor of 1 is never even reached: 3 → 2)", async () => {
    const two = await board({ empowered: false, energy: 2, power: { fury: 1, mind: 1 } }).build();
    expect(two.p1.can("cast", "blast")).toBe(true);
    expect(targetsOffered(two)).toContain("poro");
    const one = await board({ empowered: false, energy: 1, power: { fury: 1, mind: 1 } }).build();
    expect(one.p1.can("cast", "blast")).toBe(false);
    await expect(one.p1.cast("blast", { targets: "plain" })).rejects.toThrow();
  });
});

describe("(c) Empowered present, Apprentice in BASE (its static is off) → 3 − 2 = 1 energy + [mind] + pip", () => {
  test("5 energy + mind + order at the Poro leaves exactly 4 energy (paid 1)", async () => {
    const game = await board({ apprenticeAt: "base", energy: 5, power: { mind: 1, order: 1 } }).build();
    expect(game.locationOf("apprentice")).toBe("base");
    await game.p1.cast("blast", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 0, order: 0 } });
  });

  test("1 energy is exactly enough; 0 energy is short — and the Apprentice in base is itself no longer 'a unit at a battlefield' target", async () => {
    const one = await board({ apprenticeAt: "base", energy: 1, power: { mind: 1, order: 1 } }).build();
    expect(one.p1.can("cast", "blast")).toBe(true);
    expect(targetsOffered(one)).toEqual(["plain", "poro"]);
    const zero = await board({ apprenticeAt: "base", energy: 0, power: { mind: 1, order: 1 } }).build();
    expect(zero.p1.can("cast", "blast")).toBe(false);
  });
});

describe("(d) power is never discounted: always [mind] + one Deflect pip of ANY domain for the Poro", () => {
  test("with only the single [mind] and no spare pip the Poro is NOT offered (Deflect unpaid) while the plain unit and P1's own Apprentice are; aiming at the Poro is rejected", async () => {
    const game = await board({ energy: 0, power: { mind: 1 } }).build();
    expect(game.p1.can("cast", "blast")).toBe(true);
    expect(targetsOffered(game)).toEqual(["apprentice", "plain"]);
    await expect(game.p1.cast("blast", { targets: "poro" })).rejects.toThrow();
    expect(game.zoneOf("blast")).toBe("hand");
  });

  test("the Deflect pip may be a SECOND [mind]: {energy 0, mind 2} casts at the Poro and empties the pool", async () => {
    const game = await board({ energy: 0, power: { mind: 2 } }).build();
    expect(targetsOffered(game)).toContain("poro");
    await game.p1.cast("blast", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });

  test("… or fury, or order — any domain pays it (809.1.c.1)", async () => {
    for (const domain of ["fury", "order"]) {
      const game = await board({ energy: 0, power: { [domain]: 1, mind: 1 } }).build();
      expect(targetsOffered(game)).toContain("poro");
      await game.p1.cast("blast", { targets: "poro" });
      expect(game.p1.resources()).toEqual({ energy: 0, power: { [domain]: 0, mind: 0 } });
    }
  });

  test("the [mind] pip itself is mandatory in every case: plenty of energy and two off-domain pips but no mind → not castable at all", async () => {
    const game = await board({ energy: 5, power: { calm: 1, fury: 1 } }).build();
    expect(game.p1.can("cast", "blast")).toBe(false);
  });

  test("the plain (non-Deflect) unit needs no pip: {energy 0, mind 1} in case (a) blasts it for exactly [mind]", async () => {
    const game = await board({ energy: 0, power: { mind: 1 } }).build();
    await game.p1.cast("blast", { targets: "plain" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("plain")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
  });
});
