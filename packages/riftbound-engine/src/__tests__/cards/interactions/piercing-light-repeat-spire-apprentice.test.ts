/**
 * Interaction: Piercing Light (sfd-023-221) · Spell · Fury · [2][fury] · Action
 *     "[Repeat] [2][fury] — Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit."
 *   × Marai Spire (sfd-211-221) · Battlefield · "While you control this battlefield, friendly [Repeat] costs cost [1] less."
 *   × Eager Apprentice (ogn-084-298) · Unit · Mind · 3 Might
 *     "While I'm at a battlefield, the Energy costs for spells you play is reduced by [1], to a minimum of [1]."
 *   × Pouty Poro (ogn-013-298) · Unit · 2 Might · "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)"
 *
 * Board: P1 controls Marai Spire (a Holder unit keeps it) with Eager Apprentice AT that battlefield. P2 holds bf2
 * with Pouty Poro (2) and a vanilla Grunt (5). P1 casts Piercing Light paying Repeat; first execution → Poro and
 * no second unit; the repeat execution → Grunt only.
 *
 * Question — kitchen-sink total cost: (a) per-step breakdown and the single payment; (b) same but the repeat
 * execution ALSO names the Poro; (c) Repeat declined, Poro only; (d) as (a) without Marai Spire; (e) as (a)
 * with the Apprentice in base. Confirm the engine asks for payment once, with the final figure.
 *
 * Expected:
 *   (a) 356.1 base [2][fury]; 356.2.a.2 Poro chosen once → +[A]; 356.2.b Repeat +[2][fury], and Marai Spire is a
 *       discount on THAT component so it applies as the component is added (356.4.c) → +[1][fury]; running
 *       [3]+[fury][fury]+[A]; 356.4.d Apprentice −1 Energy (floor 1) → 2. Final: 2 energy + [fury][fury] + 1
 *       any-domain power, taken in one payment; on resolution Poro takes 2 (dies), then the repeat: Grunt 2.
 *   (b) Deflect per choice (809.1.c, 820.2): +[A][A] → 2 energy + [fury][fury] + [A][A].
 *   (c) [2][fury]+[A], Apprentice → 1 energy + [fury] + [A] (the floor of 1 is exactly met).
 *   (d) no Spire: Repeat full +[2][fury] → [4] → Apprentice 3: 3 energy + [fury][fury] + [A].
 *   (e) Apprentice not at a battlefield: 3 energy + [fury][fury] + [A].
 *   In every branch Repeat counts as paid however far Spire reduced it (356.4.f.1) → the effect runs twice;
 *   nothing drops below 0 (356.6).
 *
 * Harness note: `[rainbow]`/any-domain pips are paid from `power.rainbow`; targets for a Repeated cast are given
 * in execution order (`["poro", "grunt"]` = first execution Poro, repeat execution Grunt).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";
const MARAI_SPIRE = "sfd-211-221";
const EAGER_APPRENTICE = "ogn-084-298";
const POUTY_PORO = "ogn-013-298";

interface BoardOpts {
  /** P1 controls a live Marai Spire (default) or an inert vanilla battlefield in its place. */
  spire?: boolean;
  apprenticeAt?: "spire" | "base";
  energy?: number;
  fury?: number;
  rainbow?: number;
}

const FULL = { energy: 10, fury: 3, rainbow: 3 } as const;

/**
 * P1's turn. "spire" = Marai Spire (live, P1's) held by a 2-Might Holder, Apprentice at it (or in base).
 * P2 holds bf2 with Pouty Poro (2) + Grunt (5). Piercing Light in P1's hand. Default pool 10 / 3 fury / 3 rainbow.
 */
function board(o: BoardOpts = {}) {
  const s = scenario().resources(P1, {
    energy: o.energy ?? FULL.energy,
    power: { fury: o.fury ?? FULL.fury, rainbow: o.rainbow ?? FULL.rainbow },
  });
  if (o.spire === false) {
    s.battlefield("spire", { controller: P1 });
  } else {
    s.battlefield("spire", { controller: P1, def: MARAI_SPIRE, inert: false, owner: P1 });
  }
  return s
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "spire", { might: 2, name: "Holder" }, "holder")
    .unit(P1, o.apprenticeAt ?? "spire", EAGER_APPRENTICE, "app")
    .unit(P2, "bf2", POUTY_PORO, "poro")
    .unit(P2, "bf2", { might: 5, name: "Grunt" }, "grunt")
    .hand(P1, PIERCING_LIGHT, "pl");
}

/** What one cast took out of the default FULL pool. */
function paid(game: Game): { energy: number; fury: number; any: number } {
  return {
    any: FULL.rainbow - game.p1.power("rainbow"),
    energy: FULL.energy - game.p1.energy(),
    fury: FULL.fury - game.p1.power("fury"),
  };
}

/** Cast from the FULL pool and report the single deduction + that it went straight to a priority window. */
async function castAndPay(o: BoardOpts, args: Parameters<Game["p1"]["cast"]>[1]): Promise<{ game: Game; paid: ReturnType<typeof paid>; moves: string[] }> {
  const game = await board(o).build();
  const r = await game.p1.cast("pl", args);
  return { game, moves: r.executed.map((m) => m.moveId), paid: paid(game) };
}

/** Is the exact line castable from EXACTLY this pool (and nothing cheaper)? */
async function castableWith(o: BoardOpts, pool: { energy: number; fury: number; rainbow: number }, args: Parameters<Game["p1"]["cast"]>[1]): Promise<boolean> {
  const game = await board({ ...o, ...pool }).build();
  return (await game.p1.try((p) => p.cast("pl", args))).ok;
}

const LINE_A = { repeat: 1, targets: ["poro", "grunt"] } as const; // exec 1: Poro (no second unit); exec 2: Grunt

describe("Piercing Light + Repeat under Marai Spire, Eager Apprentice and a Deflect target — one payment, final figure", () => {
  test("setup sanity: P1 controls the live Marai Spire with the Apprentice AT it; Piercing Light prints [2][fury]; Poro has Deflect", async () => {
    const game = await board().build();
    expect(game.gameState.battlefields.spire?.controller).toBe(P1);
    expect(game.locationOf("app")).toBe("spire");
    expect(game.state("pl").energyCost).toBe(2);
    expect(game.state("pl").powerCost).toEqual(["fury"]);
    expect(game.state("poro").keywords).toContain("Deflect");
    expect(game.p1.option("cast", "pl")?.fields.find((f) => f.name === "repeatCount")?.max).toBe(1);
  });

  // ── (a) ─────────────────────────────────────────────────────────────────────────────────────

  test("(a) Spire + Apprentice@bf, Repeat paid, Poro then Grunt: ONE playSpell deducts exactly 2 energy + [fury][fury] + 1 any-domain pip and opens the priority window — no separate pay prompt (356.1 → 356.2.a.2 → 356.2.b/356.4.c → 356.4.d)", async () => {
    const { game, paid: p, moves } = await castAndPay({}, LINE_A);
    expect(moves).toEqual(["playSpell"]);
    expect(p).toEqual({ any: 1, energy: 2, fury: 2 });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pl", controller: P1, triggered: false })]);
  });

  test("(a) that figure is exact: castable from precisely 2 energy / 2 fury / 1 rainbow; not with 1 energy, not with 1 fury, not without the Deflect pip (356.6: nothing went below 0 either)", async () => {
    expect(await castableWith({}, { energy: 2, fury: 2, rainbow: 1 }, LINE_A)).toBe(true);
    expect(await castableWith({}, { energy: 1, fury: 2, rainbow: 1 }, LINE_A)).toBe(false);
    expect(await castableWith({}, { energy: 2, fury: 1, rainbow: 1 }, LINE_A)).toBe(false);
    expect(await castableWith({}, { energy: 2, fury: 2, rainbow: 0 }, LINE_A)).toBe(false);
  });

  test("(a) the Deflect pip is Power of ANY domain (809.1.c.1): a third fury pays it when no rainbow is held", async () => {
    const game = await board({ energy: 2, fury: 3, rainbow: 0 }).build();
    await game.p1.cast("pl", LINE_A);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } });
  });

  test("(a) on resolution the effect runs twice with its OWN choices per execution (820.2.a, 356.4.f.1): Poro takes 2 and dies, then the repeat deals exactly 2 to Grunt — Grunt ends on 2 damage", async () => {
    // Expected: execution 1 = (Poro, no second unit), execution 2 = (Grunt, no second unit) → Grunt 2 damage.
    // Actual: the engine charges the list as one Poro choice (1 Deflect pip) yet resolves it as the SHARED pair
    // (Poro, then Grunt) executed twice, so Grunt takes 4 — cost and resolution disagree about what was chosen.
    const { game } = await castAndPay({}, LINE_A);
    await game.settle();
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("grunt")).toMatchObject({ damage: 2, zone: "battlefield-bf2" });
  });

  test("(a) resolution, the part the engine does get right: one chain item, Poro (2 Might) is dealt 2 and dies, Grunt is damaged, spell to trash, back to P1's main phase", async () => {
    const { game } = await castAndPay({}, LINE_A);
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("grunt").damage).toBeGreaterThanOrEqual(2);
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (b) the repeat also names the Poro ──────────────────────────────────────────────────────

  test.failing("BUG: (b) the repeat execution may name its own pair — Grunt, THEN the Poro as its 'other unit' — and Deflect is owed per choice: 2 energy + [fury][fury] + [A][A] (809.1.c, 820.2)", async () => {
    // Expected: exec 1 = (Poro), exec 2 = (Grunt, Poro) is a legal set of choices costing two Deflect pips.
    // Actual: the engine offers at most two target slots for a Repeated two-slot spell, so a per-execution
    // pair for the repeat cannot be declared at all (the cast is rejected).
    const { paid: p, moves } = await castAndPay({}, { repeat: 1, targets: ["poro", "grunt", "poro"] });
    expect(moves).toEqual(["playSpell"]);
    expect(p).toEqual({ any: 2, energy: 2, fury: 2 });
  });

  test("(b′) Deflect per choice where the engine CAN express it: naming the Poro for BOTH executions costs [A][A] → 2 energy + [fury][fury] + 2 any-domain; with a single rainbow (and no spare fury) that line is not castable", async () => {
    const { game, paid: p, moves } = await castAndPay({}, { repeat: 1, targets: ["poro", "poro"] });
    expect(moves).toEqual(["playSpell"]);
    expect(p).toEqual({ any: 2, energy: 2, fury: 2 });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("grunt").damage).toBe(0);
    expect(await castableWith({}, { energy: 2, fury: 2, rainbow: 2 }, { repeat: 1, targets: ["poro", "poro"] })).toBe(true);
    expect(await castableWith({}, { energy: 2, fury: 2, rainbow: 1 }, { repeat: 1, targets: ["poro", "poro"] })).toBe(false);
  });

  // ── (c) Repeat declined ─────────────────────────────────────────────────────────────────────

  test("(c) Repeat declined, Poro only: [2][fury] + [A], Apprentice → exactly 1 energy + [fury] + [A] (its floor of 1 is met, not undercut); one execution: Poro dies, Grunt untouched", async () => {
    const { game, paid: p, moves } = await castAndPay({}, { targets: ["poro"] });
    expect(moves).toEqual(["playSpell"]);
    expect(p).toEqual({ any: 1, energy: 1, fury: 1 });
    expect(await castableWith({}, { energy: 1, fury: 1, rainbow: 1 }, { targets: ["poro"] })).toBe(true);
    expect(await castableWith({}, { energy: 0, fury: 1, rainbow: 1 }, { targets: ["poro"] })).toBe(false); // floor [1]
    expect(await castableWith({}, { energy: 1, fury: 1, rainbow: 0 }, { targets: ["poro"] })).toBe(false); // Deflect still due
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("grunt").damage).toBe(0);
  });

  // ── (d) no Marai Spire ──────────────────────────────────────────────────────────────────────

  test("(d) without Marai Spire (inert battlefield instead): Repeat is the full +[2][fury] → [4] → Apprentice 3: exactly 3 energy + [fury][fury] + [A]; 2 energy is short", async () => {
    const { game, paid: p, moves } = await castAndPay({ spire: false }, LINE_A);
    expect(moves).toEqual(["playSpell"]);
    expect(p).toEqual({ any: 1, energy: 3, fury: 2 });
    expect(game.chain()).toHaveLength(1);
    expect(await castableWith({ spire: false }, { energy: 3, fury: 2, rainbow: 1 }, LINE_A)).toBe(true);
    expect(await castableWith({ spire: false }, { energy: 2, fury: 2, rainbow: 1 }, LINE_A)).toBe(false);
  });

  test("(d) Marai Spire only helps its CONTROLLER: with P2 controlling the Spire P1 pays the same undiscounted 3 energy + [fury][fury] + [A]", async () => {
    const game = await scenario()
      .resources(P1, { energy: FULL.energy, power: { fury: FULL.fury, rainbow: FULL.rainbow } })
      .battlefield("spire", { controller: P2, def: MARAI_SPIRE, inert: false, owner: P2 })
      .battlefield("bf3", { controller: P1 })
      .unit(P2, "spire", POUTY_PORO, "poro")
      .unit(P2, "spire", { might: 5, name: "Grunt" }, "grunt")
      .unit(P1, "bf3", EAGER_APPRENTICE, "app")
      .hand(P1, PIERCING_LIGHT, "pl")
      .build();
    await game.p1.cast("pl", LINE_A);
    expect(paid(game)).toEqual({ any: 1, energy: 3, fury: 2 });
  });

  // ── (e) Apprentice in base ──────────────────────────────────────────────────────────────────

  test("(e) Apprentice in BASE (its static is off), Spire live: [2]+[1] Repeat → exactly 3 energy + [fury][fury] + [A]; 2 energy is short", async () => {
    const { game, paid: p, moves } = await castAndPay({ apprenticeAt: "base" }, LINE_A);
    expect(game.locationOf("app")).toBe("base");
    expect(moves).toEqual(["playSpell"]);
    expect(p).toEqual({ any: 1, energy: 3, fury: 2 });
    expect(await castableWith({ apprenticeAt: "base" }, { energy: 3, fury: 2, rainbow: 1 }, LINE_A)).toBe(true);
    expect(await castableWith({ apprenticeAt: "base" }, { energy: 2, fury: 2, rainbow: 1 }, LINE_A)).toBe(false);
  });

  // ── Repeat counts as paid in every branch ───────────────────────────────────────────────────

  test("Repeat counts as paid however far the Spire cut it (356.4.f.1): naming the 5-Might Grunt for both executions, it takes 2 + 2 = 4 and survives in every branch — Spire-discounted (2e), no Spire (3e), Apprentice in base (3e) — always + [fury][fury], no Deflect", async () => {
    const expectedEnergy = [2, 3, 3];
    for (const [i, o] of ([{}, { spire: false }, { apprenticeAt: "base" as const }] as BoardOpts[]).entries()) {
      const { game, paid: p } = await castAndPay(o, { repeat: 1, targets: ["grunt"] });
      expect(p).toEqual({ any: 0, energy: expectedEnergy[i] as number, fury: 2 });
      expect(game.chain()).toHaveLength(1);
      await game.settle();
      expect(game.state("grunt")).toMatchObject({ damage: 4, zone: "battlefield-bf2" });
      expect(game.state("poro").damage).toBe(0);
      expect(game.zoneOf("pl")).toBe("trash");
      expect(game.violations()).toEqual([]);
    }
  });
});
