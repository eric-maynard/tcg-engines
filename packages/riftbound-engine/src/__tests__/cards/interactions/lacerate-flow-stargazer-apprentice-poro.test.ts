/**
 * Interaction: Lacerate (ven-127-166) · Spell · Order · 2 + [order]
 *     "Choose a unit. If it's [Empowered], disempower it. Then kill it if it has 3 [Might] or less.
 *      [Flow] [4][order][order] (You may play this from your trash for its Flow cost. Then banish it.)"
 *   × Stargazer (ven-098-166) · Unit · 4 Might
 *     "Spells with [Flow] you play from your trash cost [2] less, to a minimum of [1]."
 *   × Eager Apprentice (ogn-084-298) · Unit · 3 Might
 *     "While I'm at a battlefield, the Energy costs for spells you play is reduced by [1], to a
 *      minimum of [1]."
 *   × Pouty Poro (ogn-013-298) · 2 Might · "[Deflect] (Opponents must pay [rainbow] to choose me …)"
 *
 * Question: P1's turn, open state. Lacerate is in P1's TRASH; Stargazer in P1's base; Eager
 * Apprentice at bf1. P2 has Pouty Poro and a vanilla 2-Might unit at bf2. What does it cost to
 * Flow Lacerate at (i) the Poro, (ii) the vanilla unit? In what order do the two discounts apply,
 * can energy reach 0? What does legal() enumerate with {energy:1, order:2} vs {…, calm:1}? Where
 * does Lacerate go afterwards? Contrast: cast from HAND at the Poro.
 *
 * Rules:
 *   829.1.c.1 / 356.1.a — Flow cost [4][order][order] is an alternate cost replacing the base cost.
 *   829.1.b.2           — Flow does not change timing (still main-phase only; no Action/Reaction).
 *   809.1.c / 809.1.c.1 / 356.2.a.2 — choosing the ENEMY Poro adds a mandatory +1 power of ANY domain.
 *   356.4.c — Apprentice's Energy-component discount is applied first: 4 → 3.
 *   356.4.d — Stargazer's total-cost "[2] less" applies after: 3 → 1.
 *   356.4.e — each "minimum of [1]" binds only its own discount, but both floor at 1 → never 0.
 *   355.8 / 358.2 — with no spare power the Deflect pip is unpayable → Poro is not a valid choice.
 *   829.1.b.1 — played via Flow, Lacerate is BANISHED when it leaves the chain.
 *   From hand: base 2+[order]; Stargazer does not apply; Apprentice 2→1 → 1 + [order] (+1 any at Poro);
 *   goes to trash normally.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LACERATE = "ven-127-166";
const STARGAZER = "ven-098-166";
const EAGER_APPRENTICE = "ogn-084-298";
const POUTY_PORO = "ogn-013-298";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function targetsOffered(game: G, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

interface Opts {
  energy: number;
  order?: number;
  calm?: number;
  apprenticeAt?: "bf1" | "base";
  stargazer?: boolean;
  from?: "trash" | "hand";
}

/**
 * P1's turn. bf1 (P1) holds Eager Apprentice; bf2 (P2) holds Pouty Poro + a vanilla 2-Might unit.
 * Stargazer sits in P1's base. Lacerate is in P1's trash (default) or hand.
 */
function board({ energy, order = 2, calm = 0, apprenticeAt = "bf1", stargazer = true, from = "trash" }: Opts) {
  const power: Record<string, number> = { order };
  if (calm > 0) {
    power.calm = calm;
  }
  let s = scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, apprenticeAt, EAGER_APPRENTICE, "apprentice")
    .unit(P2, "bf2", POUTY_PORO, "poro")
    .unit(P2, "bf2", { might: 2, name: "Vanilla Two" }, "vanilla");
  if (stargazer) {
    s = s.unit(P1, "base", STARGAZER, "stargazer");
  }
  return from === "trash" ? s.trash(P1, LACERATE, "lac") : s.hand(P1, LACERATE, "lac");
}

describe("Lacerate via Flow × Stargazer × Eager Apprentice × Pouty Poro — stacking discounts + Deflect", () => {
  test("setup: Lacerate prints 2 + [order]; from the trash it is offered only as a Flow play", async () => {
    const game = await board({ energy: 10, order: 3, calm: 1 }).build();
    expect(game.state("lac").energyCost).toBe(2);
    expect(game.state("lac").powerCost).toEqual(["order"]);
    expect(game.zoneOf("lac")).toBe("trash");
    expect(game.locationOf("apprentice")).toBe("bf1");
    expect(game.state("poro").might).toBe(2);
    expect(game.state("vanilla").might).toBe(2);
    expect(game.p1.can("cast", "lac")).toBe(true);
    expect(game.p1.option("cast", "lac")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
  });

  // ── (ii) Flow at the vanilla unit ────────────────────────────────────────────────────────────

  test("(ii) Flow at the vanilla unit costs exactly 1 energy + [order][order]: Apprentice 4→3 (356.4.c), Stargazer 3→1 (356.4.d)", async () => {
    const game = await board({ energy: 1, order: 2 }).build();
    expect(game.p1.can("cast", "lac")).toBe(true);
    await game.p1.cast("lac", { flow: true, targets: "vanilla" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["lac"]);
  });

  test("(ii) with spare resources the engine still charges only 1 energy + 2 order (5 energy in → 4 left)", async () => {
    const game = await board({ energy: 5, order: 3 }).build();
    await game.p1.cast("lac", { flow: true, targets: "vanilla" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 1 } });
  });

  test("(ii) energy can never reach 0 — both discounts floor at [1] (356.4.e): 0 energy + 2 order is NOT castable", async () => {
    const game = await board({ energy: 0, order: 2, calm: 1 }).build();
    expect(game.p1.can("cast", "lac")).toBe(false);
    const r = await game.p1.try((p) => p.cast("lac", { flow: true, targets: "vanilla" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("lac")).toBe("trash");
  });

  test("(ii) the Flow cost needs BOTH order pips — 1 energy + 1 order is not enough (power is never discounted, 356.6)", async () => {
    const game = await board({ energy: 1, order: 1 }).build();
    expect(game.p1.can("cast", "lac")).toBe(false);
  });

  test("(ii) resolution: the 2-Might vanilla unit is killed and the Flowed Lacerate is BANISHED, not trashed (829.1.b.1)", async () => {
    const game = await board({ energy: 1, order: 2 }).build();
    await game.p1.cast("lac", { flow: true, targets: "vanilla" });
    await game.settle();
    expect(game.zoneOf("vanilla")).toBe("trash");
    expect(game.zoneOf("lac")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("lac");
    expect(game.p1.can("cast", "lac")).toBe(false); // nothing left to Flow
  });

  // ── (i) Flow at the enemy Poro (Deflect) ─────────────────────────────────────────────────────

  test("(i) Flow at the enemy Poro costs 1 energy + [order][order] + 1 power of ANY domain (calm pays Deflect, 809.1.c.1)", async () => {
    const game = await board({ energy: 1, order: 2, calm: 1 }).build();
    expect(targetsOffered(game, "lac")).toContain("poro");
    await game.p1.cast("lac", { flow: true, targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0, calm: 0 } });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash"); // 2 Might ≤ 3 → killed
    expect(game.zoneOf("lac")).toBe("banishment");
  });

  test("(i) a third order power can pay the Deflect pip too (any domain includes the spell's own)", async () => {
    const game = await board({ energy: 1, order: 3 }).build();
    expect(targetsOffered(game, "lac")).toContain("poro");
    await game.p1.cast("lac", { flow: true, targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });

  // ── legal() enumeration ──────────────────────────────────────────────────────────────────────

  test("legal() with {energy:1, order:2}: only variant (ii) — the vanilla unit (and P1's own units) are offered, the Poro is NOT (Deflect unpayable, 355.8)", async () => {
    const game = await board({ energy: 1, order: 2 }).build();
    expect(game.p1.can("cast", "lac")).toBe(true);
    const offered = targetsOffered(game, "lac");
    expect(offered).toContain("vanilla");
    expect(offered).toContain("apprentice"); // "Choose a unit" — own units are legal, no Deflect tax
    expect(offered).toContain("stargazer");
    expect(offered).not.toContain("poro");
    await expect(game.p1.cast("lac", { flow: true, targets: "poro" })).rejects.toThrow();
    expect(game.zoneOf("lac")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 2 } });
  });

  test("legal() with {energy:1, order:2, calm:1}: both variants — the Poro is now offered as well", async () => {
    const game = await board({ energy: 1, order: 2, calm: 1 }).build();
    const offered = targetsOffered(game, "lac");
    expect(offered).toContain("vanilla");
    expect(offered).toContain("poro");
  });

  test("timing unchanged by Flow (829.1.b.2): on P2's turn Lacerate cannot be Flowed from the trash", async () => {
    const game = await board({ energy: 5, order: 3, calm: 1 }).active(P2).build();
    expect(game.p1.can("cast", "lac")).toBe(false);
  });

  // ── discount attribution ─────────────────────────────────────────────────────────────────────

  test("without Stargazer: Flow at vanilla is 4 − 1 (Apprentice) = 3 energy + 2 order", async () => {
    const short = await board({ energy: 2, order: 2, stargazer: false }).build();
    expect(short.p1.can("cast", "lac")).toBe(false);
    const game = await board({ energy: 3, order: 2, stargazer: false }).build();
    await game.p1.cast("lac", { flow: true, targets: "vanilla" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });

  test("Apprentice in base (static off): Flow at vanilla is 4 − 2 (Stargazer) = 2 energy + 2 order", async () => {
    const short = await board({ energy: 1, order: 2, apprenticeAt: "base" }).build();
    expect(short.p1.can("cast", "lac")).toBe(false);
    const game = await board({ energy: 2, order: 2, apprenticeAt: "base" }).build();
    await game.p1.cast("lac", { flow: true, targets: "vanilla" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });

  // ── contrast: from HAND ──────────────────────────────────────────────────────────────────────

  test("from HAND at the Poro: base 2+[order], Apprentice 2→1, +1 any for Deflect → 1 energy + 1 order + 1 calm; Poro dies; Lacerate → TRASH", async () => {
    const game = await board({ energy: 1, order: 1, calm: 1, from: "hand" }).build();
    expect(game.p1.can("cast", "lac")).toBe(true);
    expect(game.p1.option("cast", "lac")?.fields.find((f) => f.arg === "flow")).toBeUndefined();
    await game.p1.cast("lac", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0, calm: 0 } });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("lac")).toBe("trash");
    expect(game.p1.banishment()).not.toContain("lac");
  });

  test("from HAND with only {energy:1, order:1}: vanilla is legal (1 + [order]) but the Poro is not (no spare power for Deflect)", async () => {
    const game = await board({ energy: 1, order: 1, from: "hand" }).build();
    const offered = targetsOffered(game, "lac");
    expect(offered).toContain("vanilla");
    expect(offered).not.toContain("poro");
    await game.p1.cast("lac", { targets: "vanilla" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });

  test("from HAND Stargazer does NOT apply (not a Flow play from trash): with Apprentice in base the cost is the full 2 + [order]", async () => {
    const short = await board({ energy: 1, order: 1, apprenticeAt: "base", from: "hand" }).build();
    expect(short.p1.can("cast", "lac")).toBe(false); // would be castable at [1] if Stargazer's −2 (min 1) applied
    const game = await board({ energy: 2, order: 1, apprenticeAt: "base", from: "hand" }).build();
    await game.p1.cast("lac", { targets: "vanilla" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("lac")).toBe("trash");
  });

  test("a 4-Might unit (Stargazer) may be chosen but is NOT killed — the 3-Might test is a resolution check", async () => {
    const game = await board({ energy: 1, order: 2 }).build();
    await game.p1.cast("lac", { flow: true, targets: "stargazer" });
    await game.settle();
    expect(game.zoneOf("stargazer")).toBe("base");
    expect(game.zoneOf("lac")).toBe("banishment");
  });
});
