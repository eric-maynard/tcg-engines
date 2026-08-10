/**
 * Interaction: one spell under a Deflect surcharge, an enemy cost INCREASE and a friendly total-cost DISCOUNT at
 * once — what is the single net payment?
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1+[fury] · Action — "Deal 3 to a unit at a battlefield."   — P1 casts
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 Might — "[Deflect]" (+[rainbow] to choose it)              — P2, at bf1
 *   × Helm of Suppression (ven-045-166) · Gear · Calm — "Opponents' spells cost [1] more. If this is
 *     [Empowered], they cost [1][rainbow] more instead."                                                    — P2's gear
 *   × Applied Researchers (ven-055-166) · Unit · Mind · 4 Might — "[Empowered] Your spells cost [1][rainbow]
 *     less, to a minimum of [1]."                                                                            — P1, base
 *
 * Rules: 356.1 (base) → 356.2.a.2 / 809.1.c / 809.1.c.1 / 809.1.d (Deflect = MANDATORY additional cost, +1 Power of
 * ANY domain, added in step 2) → 356.3 (Helm increase) → 356.4.d (Researchers = total-cost discount, after component
 * discounts), 356.4.e (its "minimum of [1]" floors only ITS OWN energy reduction), 356.4.f (a discount may reduce an
 * additional cost — the [rainbow] discount may remove any one power pip, including the Deflect pip or the [fury] pip),
 * 356.6 (never below 0). One payment of the final total, never incremental.
 *
 * Question — exact single payment for Ray at the Poro:
 *  (a) Helm Empowered, Researchers Empowered; (b) Helm NOT Empowered, Researchers Empowered — hittable with just
 *  {1 energy, 1 fury}? (c) Helm Empowered, Researchers not; (d) no Helm, Researchers Empowered — does the "minimum of
 *  [1]" keep Ray at 1 energy while the [rainbow] still eats a pip? Which pip may it remove?
 *
 * Expected: baseline (neither) 1 + [fury] + [A]. (a) [1][fury] +[A] +[1][A] = 2 + {fury,A,A}; −[1][A] → 1 energy +
 * 2 power — and since the [rainbow] discount may remove the [fury] pip, ANY two power pay it ({calm:2} does).
 * (b) 2 + {fury,A}; −[1][A] → 1 energy + 1 power of any domain — yes {1, fury:1} suffices, so does {1, calm:1}.
 * (c) 2 energy + {fury,A,A}: 2 energy + 3 power, at least one fury. (d) 1 + {fury,A}; energy stays 1 (own floor),
 * −1 pip → 1 energy + 1 power (any). Poro takes 3 and dies in every resolved case.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const POUTY_PORO = "ogn-013-298";
const HELM = "ven-045-166";
const RESEARCHERS = "ven-055-166";

type Cfg = {
  /** absent / present un-Empowered / present Empowered */
  helm?: false | "plain" | "empowered";
  researchers?: false | "plain" | "empowered";
  energy: number;
  power: Record<string, number>;
};

/**
 * P1's turn (Ray is an Action). P2 controls bf1 with the Pouty Poro and a vanilla 2-Might Grunt (a non-Deflect
 * reference target). Optionally: P2's Helm of Suppression in P2's base, P1's Applied Researchers in P1's base, each
 * Empowered or not. P1's pool is exactly `energy` + `power`; Ray in hand.
 */
function board(cfg: Cfg) {
  let s = scenario()
    .battlefield("bf1", { controller: P2 })
    .resources(P1, { energy: cfg.energy, power: cfg.power })
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .unit(P2, "bf1", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, HEXTECH_RAY, "ray");
  if (cfg.helm) {
    s = s.gear(P2, HELM, "helm", cfg.helm === "empowered" ? { empowered: true } : undefined);
  }
  if (cfg.researchers) {
    s = s.unit(P1, "base", RESEARCHERS, "researchers", cfg.researchers === "empowered" ? { empowered: true } : undefined);
  }
  return s;
}

function targetsOffered(game: Game): string[] {
  const field = game.p1.option("cast", "ray")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

const EMPTY = (power: Record<string, number>) => ({ energy: 0, power: Object.fromEntries(Object.keys(power).map((k) => [k, 0])) });

/** Build, sanity-check the Empowered flags, cast Ray at the Poro in ONE action and return the game (Ray on the chain). */
async function rayThePoro(cfg: Cfg): Promise<Game> {
  const game = await board(cfg).build();
  if (cfg.helm) {
    expect(game.state("helm").isEmpowered).toBe(cfg.helm === "empowered");
  }
  if (cfg.researchers) {
    expect(game.state("researchers").isEmpowered).toBe(cfg.researchers === "empowered");
  }
  expect(targetsOffered(game)).toContain("poro");
  await game.p1.cast("ray", { targets: "poro" });
  // one payment of the final total: straight to the priority window, no pay/integer prompt in between
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1, targets: ["poro"] })]);
  return game;
}

/** With this pool the Poro is NOT a legal choice (355.8) — it is absent from the offer and naming it throws. */
async function poroUnaffordable(cfg: Cfg): Promise<Game> {
  const game = await board(cfg).build();
  expect(targetsOffered(game)).not.toContain("poro");
  await expect(game.p1.cast("ray", { targets: "poro" })).rejects.toThrow();
  expect(game.zoneOf("ray")).toBe("hand");
  expect(game.p1.resources()).toEqual({ energy: cfg.energy, power: { ...cfg.power } }); // nothing taken
  return game;
}

describe("Hextech Ray at a Deflect Poro under Helm of Suppression (+) and Applied Researchers (−)", () => {
  // ── baseline: neither modifier ──────────────────────────────────────────────────────────────

  test("baseline (no Helm, no Researchers): Ray at the Poro costs exactly 1 energy + [fury] + 1 power of any domain (809.1.c.1) — {1, fury:1, calm:1} empties the pool; with {1, fury:1} the Poro is not offered but the Grunt is", async () => {
    const game = await rayThePoro({ energy: 1, power: { calm: 1, fury: 1 } });
    expect(game.p1.resources()).toEqual(EMPTY({ calm: 1, fury: 1 }));
    const short = await poroUnaffordable({ energy: 1, power: { fury: 1 } });
    expect(targetsOffered(short)).toEqual(["grunt"]);
  });

  // ── (a) Helm Empowered + Researchers Empowered ──────────────────────────────────────────────

  test("(a) Helm [Empowered] + Researchers [Empowered]: [1][fury] +[A] +[1][A] −[1][A] = 1 energy + 2 power — {1, fury:1, calm:1} pays it exactly (pool empties)", async () => {
    const game = await rayThePoro({ energy: 1, helm: "empowered", power: { calm: 1, fury: 1 }, researchers: "empowered" });
    expect(game.p1.resources()).toEqual(EMPTY({ calm: 1, fury: 1 }));
  });

  test("(a) only ONE energy is charged: from {2, fury:1, calm:1} exactly 1 energy is left after the cast", async () => {
    const game = await rayThePoro({ energy: 2, helm: "empowered", power: { calm: 1, fury: 1 }, researchers: "empowered" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0, fury: 0 } });
  });

  test("(a) 356.4.f — the [rainbow] discount may remove the [fury] pip itself, so ANY two power pay it: {1, calm:2} (no fury at all) is legal and empties the pool", async () => {
    const game = await rayThePoro({ energy: 1, helm: "empowered", power: { calm: 2 }, researchers: "empowered" });
    expect(game.p1.resources()).toEqual(EMPTY({ calm: 2 }));
  });

  test("(a) one pip short: with {1, fury:1} the Poro is NOT offered (needs 2 power) — while the non-Deflect Grunt (1 energy + 1 power net) still is", async () => {
    const game = await poroUnaffordable({ energy: 1, helm: "empowered", power: { fury: 1 }, researchers: "empowered" });
    expect(targetsOffered(game)).toEqual(["grunt"]);
  });

  // ── (b) Helm NOT Empowered + Researchers Empowered ──────────────────────────────────────────

  test("(b) Helm un-Empowered (+[1]) + Researchers [Empowered] (−[1][A]): 2 + {fury, A} − [1][A] = 1 energy + 1 power — yes, {1, fury:1} is enough to hit the Deflect Poro (pool empties): the Deflect surcharge was legally discounted away", async () => {
    const game = await rayThePoro({ energy: 1, helm: "plain", power: { fury: 1 }, researchers: "empowered" });
    expect(game.p1.resources()).toEqual(EMPTY({ fury: 1 }));
  });

  test("(b) … and under player-optimal application the remaining pip may be of ANY domain: {1, calm:1} is legal too", async () => {
    const game = await rayThePoro({ energy: 1, helm: "plain", power: { calm: 1 }, researchers: "empowered" });
    expect(game.p1.resources()).toEqual(EMPTY({ calm: 1 }));
  });

  test("(b) but not free: with {1 energy, no power} the Poro is not offered (one pip is still owed)", async () => {
    await poroUnaffordable({ energy: 1, helm: "plain", power: {}, researchers: "empowered" });
  });

  // ── (c) Helm Empowered + Researchers NOT Empowered ──────────────────────────────────────────

  test("(c) Helm [Empowered] (+[1][A]) with Researchers un-Empowered (no discount): 2 energy + {fury, A, A} — {2, fury:1, calm:2} pays it exactly", async () => {
    const game = await rayThePoro({ energy: 2, helm: "empowered", power: { calm: 2, fury: 1 }, researchers: "plain" });
    expect(game.p1.resources()).toEqual(EMPTY({ calm: 2, fury: 1 }));
  });

  test("(c) exactness: {2, fury:1, calm:1} (a pip short) and {1, fury:1, calm:2} (an energy short) do not reach the Poro; {2, calm:3} cannot cast Ray at anything — the [fury] pip is owed and nothing discounts it", async () => {
    await poroUnaffordable({ energy: 2, helm: "empowered", power: { calm: 1, fury: 1 }, researchers: "plain" });
    await poroUnaffordable({ energy: 1, helm: "empowered", power: { calm: 2, fury: 1 }, researchers: "plain" });
    const noFury = await board({ energy: 2, helm: "empowered", power: { calm: 3 }, researchers: "plain" }).build();
    expect(noFury.p1.can("cast", "ray")).toBe(false);
  });

  // ── (d) no Helm + Researchers Empowered ─────────────────────────────────────────────────────

  test("(d) Researchers [Empowered] alone: 1 + {fury, A}; 356.4.e — its own 'minimum of [1]' keeps the energy at 1 while the [rainbow] half still removes a pip → 1 energy + 1 power: {1, fury:1} pays exactly", async () => {
    const game = await rayThePoro({ energy: 1, power: { fury: 1 }, researchers: "empowered" });
    expect(game.p1.resources()).toEqual(EMPTY({ fury: 1 }));
  });

  test("(d) the energy floor is real: {0 energy, fury:1, calm:1} cannot cast Ray at all (energy never drops below Researchers' own [1] minimum)", async () => {
    const game = await board({ energy: 0, power: { calm: 1, fury: 1 }, researchers: "empowered" }).build();
    expect(game.p1.can("cast", "ray")).toBe(false);
  });

  test("(d) which pip may the [rainbow] discount remove? Either — {1, calm:1} (Deflect pip kept, [fury] pip discounted) is as legal as {1, fury:1} ([fury] kept, Deflect pip discounted)", async () => {
    const keepDeflect = await rayThePoro({ energy: 1, power: { calm: 1 }, researchers: "empowered" });
    expect(keepDeflect.p1.resources()).toEqual(EMPTY({ calm: 1 }));
    const keepFury = await rayThePoro({ energy: 1, power: { fury: 1 }, researchers: "empowered" });
    expect(keepFury.p1.resources()).toEqual(EMPTY({ fury: 1 }));
  });

  test("(d) contrast — Researchers present but NOT Empowered gives no discount: back to the baseline 1 + [fury] + [A], so {1, fury:1} no longer reaches the Poro", async () => {
    await poroUnaffordable({ energy: 1, power: { fury: 1 }, researchers: "plain" });
    const game = await rayThePoro({ energy: 1, power: { calm: 1, fury: 1 }, researchers: "plain" });
    expect(game.p1.resources()).toEqual(EMPTY({ calm: 1, fury: 1 }));
  });

  // ── resolution: the Poro dies every time ────────────────────────────────────────────────────

  test("in every resolved case Ray deals 3 to the 2-Might Poro and it dies; Ray → trash; the Grunt is untouched", async () => {
    const cases: Cfg[] = [
      { energy: 1, power: { calm: 1, fury: 1 } },
      { energy: 1, helm: "empowered", power: { calm: 2 }, researchers: "empowered" },
      { energy: 1, helm: "plain", power: { fury: 1 }, researchers: "empowered" },
      { energy: 2, helm: "empowered", power: { calm: 2, fury: 1 }, researchers: "plain" },
      { energy: 1, power: { calm: 1 }, researchers: "empowered" },
    ];
    for (const cfg of cases) {
      const game = await rayThePoro(cfg);
      await game.p1.passPriority();
      await game.p2.passPriority();
      expect(game.zoneOf("poro")).toBe("trash");
      expect(game.zoneOf("ray")).toBe("trash");
      expect(game.state("grunt").damage).toBe(0);
      expect(game.chain()).toEqual([]);
      expect(game.violations()).toEqual([]);
    }
  });
});
