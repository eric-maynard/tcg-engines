/**
 * Interaction: Sky Splitter (ogn-014-298) · Spell · Fury · 8+[fury] · Action
 *     "This spell's Energy cost is reduced by the highest Might among units you control. Deal 5 to a unit at a
 *      battlefield."
 *   × Temporal Portal (sfd-078-221) · Gear · Mind · 3
 *     "[rainbow], [Exhaust]: Give the next spell you play this turn [Repeat] equal to its cost."
 *   × Marai Spire (sfd-211-221) · Battlefield · "While you control this battlefield, friendly [Repeat] costs cost [1] less."
 *   (+ a 12-Might vanilla "Giant" standing in for Master Yi, Unstoppable; a 7-Might one for the control branch;
 *    Defy ogn-045-298 for the printed-cost parity check.)
 *
 * Question: an X-like SELF discount meets a granted Repeat priced at the printed cost. P1 activates the Portal, then
 * casts Sky Splitter at an enemy unit while its highest Might is 12 (optionally controlling Marai Spire).
 *  (a) What Repeat cost is granted — [8][fury] (printed) or the already-reduced figure?
 *  (b) Repeat declined: what is paid; is the Portal grant still consumed?
 *  (c) Repeat elected, no Spire: is the Might reduction applied to the BASE energy only ((8-12→0)+8 = 8) or ONCE to
 *      the summed Energy cost (16-12 = 4)? Exact (energy, power) and number of executions.
 *  (d) Same with Marai Spire controlled: where does the Spire's −1 land, what is the total?
 *  (e) Swap the 12-Might unit for a 7-Might one: (b)/(c)/(d) figures?
 *  (f) Parity: pool {4, fury:1, calm:1} in (c) — is the Repeat variant offered (can calm pay the second pip)?
 *
 * Rules: 206 / 356.1.c ("equal to its cost" reads the PRINTED cost → Repeat [8][fury]); 820.1.d (Repeat = optional
 * additional cost, 356.2.b.1) added in step 356.2; 356.4 discounts applied AFTER additional costs — Sky Splitter's
 * clause is a discount on "this spell's Energy cost" = the summed Energy, applied once (356.4.d); Marai Spire is a
 * COMPONENT discount on the Repeat cost, applied the moment that component is added (356.4.c); 356.6 floor 0;
 * 820.2.a each execution picks its own target at play; 820.3.a played once; 357.3 / 355.16 unpayable variants are
 * not offered. Riftjudge Temporal Portal rulings: "reductions apply to the total (base + Repeat), not twice / not to
 * base alone".
 *
 * Expected: (a) Repeat [8][fury]. (b) 0 energy + [fury]; grant spent. (c) 16−12 = 4 energy + [fury][fury]; Deal 5
 * twice; one spell played. (d) Repeat 8→7 (Spire), 15−12 = 3 energy + [fury][fury]. (e) 7-Might: (b) 1+[fury],
 * (c) 9 + 2 fury, (d) 8 + 2 fury. (f) not offered — both pips are FURY; only the no-Repeat line (0+[fury]) is listed.
 * Defy can never target Sky Splitter (printed 8 > 4).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SKY_SPLITTER = "ogn-014-298";
const TEMPORAL_PORTAL = "sfd-078-221";
const MARAI_SPIRE = "sfd-211-221";
const DEFY = "ogn-045-298";

/** Inline pip-less 1-cost Action spell "Draw 1" — a second spell in hand to observe the Portal grant being consumed. */
const PING = { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 1, name: "Ping", timing: "action" };

interface BoardOpts {
  /** Might of P1's biggest unit ("Giant", in base). Default 12. */
  might?: number;
  /** P1 controls a live Marai Spire (held by a 1-Might Holder) instead of an inert battlefield. */
  spire?: boolean;
}

interface Pool {
  energy: number;
  fury: number;
  calm?: number;
}

/** The pool P1 holds when casting, unless a test names an exact one. */
const FULL: Pool = { energy: 20, fury: 3 };

/**
 * P1's turn. P1: Giant (12 or `might`) in base, a 1-Might Holder on "spire" (live Marai Spire or inert), Temporal Portal
 * ready, Sky Splitter + Ping in hand, and ONLY the Portal's [rainbow] pip in the pool — the casting pool is added after the
 * Portal is up (`portalUp`) so every figure below is exactly what Sky Splitter took.
 * P2: two 6-Might units at bf2 (each survives one Deal 5) and Defy in hand with exactly 1 + [calm].
 */
function board(o: BoardOpts = {}) {
  const s = scenario()
    .resources(P1, { energy: 0, power: { rainbow: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } });
  if (o.spire) {
    s.battlefield("spire", { controller: P1, def: MARAI_SPIRE, inert: false, owner: P1 });
  } else {
    s.battlefield("spire", { controller: P1 });
  }
  return s
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "spire", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "base", { might: o.might ?? 12, name: "Giant" }, "giant")
    .unit(P2, "bf2", { might: 6, name: "Foe A" }, "foeA")
    .unit(P2, "bf2", { might: 6, name: "Foe B" }, "foeB")
    .gear(P1, TEMPORAL_PORTAL, "portal")
    .hand(P1, SKY_SPLITTER, "sky")
    .hand(P1, PING, "ping")
    .hand(P2, DEFY, "defy");
}

/** Build, activate the Portal (pays the [rainbow], exhausts), let it resolve, then stock P1's pool with exactly `pool`. */
async function portalUp(o: BoardOpts = {}, pool: Pool = FULL): Promise<Game> {
  const game = await board(o).build();
  await game.p1.activate("portal");
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.state("portal").isExhausted).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p1.do("addResources", { energy: pool.energy, power: { calm: pool.calm ?? 0, fury: pool.fury } });
  expect(game.p1.energy()).toBe(pool.energy);
  expect(game.p1.power("fury")).toBe(pool.fury);
  return game;
}

function repeatOptions(game: Game, alias: string): number[] {
  const field = game.p1.option("cast", alias)?.fields.find((f) => f.name === "repeatCount");
  return ((field?.options ?? []) as number[]).map(Number);
}

/** What the cast took out of the FULL pool. */
function paid(game: Game): { energy: number; fury: number } {
  return { energy: FULL.energy - game.p1.energy(), fury: FULL.fury - game.p1.power("fury") };
}

/** Is Sky Splitter castable with these args from EXACTLY this pool (Portal already up)? */
async function castableWith(o: BoardOpts, pool: Pool, args: Parameters<Game["p1"]["cast"]>[1]): Promise<boolean> {
  const game = await portalUp(o, pool);
  return (await game.p1.try((p) => p.cast("sky", args))).ok;
}

const REPEAT_AB = { repeat: 1, targets: ["foeA", "foeB"] } as const; // exec 1 → Foe A, exec 2 → Foe B

describe("Sky Splitter × Temporal Portal (Repeat = printed cost) × 12-Might unit × Marai Spire", () => {
  test("setup sanity: Giant is P1's highest Might (12), Sky Splitter prints 8 + [fury]; before the Portal no Repeat is offered", async () => {
    const game = await board().build();
    expect(game.state("giant").might).toBe(12);
    expect(game.state("holder").might).toBe(1);
    expect(game.state("sky").energyCost).toBe(8);
    expect(game.state("sky").powerCost).toEqual(["fury"]);
    expect(repeatOptions(game, "sky")).toEqual([]);
    expect(repeatOptions(game, "ping")).toEqual([]);
  });

  // ── (a) the grant ─────────────────────────────────────────────────────────────────────────────

  test("(a) after the Portal resolves, Sky Splitter (and any other spell in hand) is offered exactly ONE Repeat instance (820.3)", async () => {
    const game = await portalUp();
    expect(repeatOptions(game, "sky")).toEqual([1]);
    expect(repeatOptions(game, "ping")).toEqual([1]);
  });

  test("(a) the granted Repeat is priced at the PRINTED [8][fury], not the reduced figure: with the 12-Might Giant the Repeat line needs exactly 4 energy + 2 fury (16−12), not 0 + 2 fury (206, 356.1.c)", async () => {
    expect(await castableWith({}, { energy: 4, fury: 2 }, REPEAT_AB)).toBe(true);
    expect(await castableWith({}, { energy: 3, fury: 2 }, REPEAT_AB)).toBe(false); // would pass if Repeat were the reduced 0+[fury]
    expect(await castableWith({}, { energy: 4, fury: 1 }, REPEAT_AB)).toBe(false); // second [fury] pip is due
  });

  // ── (b) Repeat declined ───────────────────────────────────────────────────────────────────────

  test("(b) Repeat declined, 12-Might: pays 8−12 → 0 energy (356.6) + [fury]; one execution — Foe A takes 5", async () => {
    const game = await portalUp();
    await game.p1.cast("sky", { targets: "foeA" });
    expect(paid(game)).toEqual({ energy: 0, fury: 1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sky", controller: P1, targets: ["foeA"], triggered: false })]);
    await game.settle();
    expect(game.state("foeA").damage).toBe(5);
    expect(game.state("foeB").damage).toBe(0);
    expect(game.zoneOf("sky")).toBe("trash");
  });

  test("(b) the Portal grant is consumed by Sky Splitter even though its Repeat went unpaid — the next spell (Ping) has no Repeat any more", async () => {
    const game = await portalUp();
    expect(repeatOptions(game, "ping")).toEqual([1]);
    await game.p1.cast("sky", { targets: "foeA" });
    await game.settle();
    expect(game.p1.can("cast", "ping")).toBe(true);
    expect(repeatOptions(game, "ping")).toEqual([]);
    await expect(game.p1.cast("ping", { repeat: 1 })).rejects.toThrow();
  });

  // ── (c) Repeat elected, no Spire ──────────────────────────────────────────────────────────────

  test("(c) Repeat elected, no Spire, 12-Might: the Might discount hits the SUMMED Energy once — (8+8)−12 = exactly 4 energy + [fury][fury] in one payment; ONE chain item naming both targets (356.2 → 356.4.d, 820.3.a)", async () => {
    const game = await portalUp();
    const r = await game.p1.cast("sky", REPEAT_AB);
    expect(r.executed.map((m) => m.moveId)).toEqual(["playSpell"]);
    expect(paid(game)).toEqual({ energy: 4, fury: 2 }); // NOT 8 (base-only reading), NOT 0 (discount twice)
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sky", controller: P1, targets: ["foeA", "foeB"], triggered: false })]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1); // one spell played
  });

  test("(c) on resolution Deal 5 executes twice with its own target each time (820.2.a): Foe A 5, Foe B 5, both survive (6 Might); spell → trash; back to P1's open main phase", async () => {
    const game = await portalUp();
    await game.p1.cast("sky", REPEAT_AB);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("foeA")).toMatchObject({ damage: 5, zone: "battlefield-bf2" });
    expect(game.state("foeB")).toMatchObject({ damage: 5, zone: "battlefield-bf2" });
    expect(game.zoneOf("sky")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) the same target may be named for both executions: Foe A takes 5 + 5 = 10 and dies", async () => {
    const game = await portalUp();
    await game.p1.cast("sky", { repeat: 1, targets: ["foeA", "foeA"] });
    expect(paid(game)).toEqual({ energy: 4, fury: 2 });
    await game.settle();
    expect(game.zoneOf("foeA")).toBe("trash");
    expect(game.state("foeB").damage).toBe(0);
  });

  // ── (d) with Marai Spire ──────────────────────────────────────────────────────────────────────

  test("(d) Marai Spire controlled, 12-Might: Spire −1 lands on the Repeat COMPONENT as it is added (8→7), then (8+7)−12 = exactly 3 energy + [fury][fury] (356.4.c then 356.4.d)", async () => {
    const game = await portalUp({ spire: true });
    expect(game.gameState.battlefields.spire?.controller).toBe(P1);
    await game.p1.cast("sky", REPEAT_AB);
    expect(paid(game)).toEqual({ energy: 3, fury: 2 });
    expect(game.chain()).toHaveLength(1);
    expect(await castableWith({ spire: true }, { energy: 3, fury: 2 }, REPEAT_AB)).toBe(true);
    expect(await castableWith({ spire: true }, { energy: 2, fury: 2 }, REPEAT_AB)).toBe(false);
    await game.settle();
    expect(game.state("foeA").damage).toBe(5);
    expect(game.state("foeB").damage).toBe(5);
  });

  test("(d) the Spire does nothing to the no-Repeat line: Repeat declined with the Spire is still 0 energy + [fury]", async () => {
    const game = await portalUp({ spire: true });
    await game.p1.cast("sky", { targets: "foeA" });
    expect(paid(game)).toEqual({ energy: 0, fury: 1 });
  });

  // ── (e) 7-Might control ───────────────────────────────────────────────────────────────────────

  test("(e) 7-Might Giant, Repeat declined: 8−7 = exactly 1 energy + [fury] (0 energy is short)", async () => {
    const game = await portalUp({ might: 7 });
    expect(game.state("giant").might).toBe(7);
    await game.p1.cast("sky", { targets: "foeA" });
    expect(paid(game)).toEqual({ energy: 1, fury: 1 });
    expect(await castableWith({ might: 7 }, { energy: 0, fury: 1 }, { targets: "foeA" })).toBe(false);
  });

  test("(e) 7-Might Giant, Repeat elected, no Spire: (8+8)−7 = exactly 9 energy + [fury][fury]; two executions", async () => {
    const game = await portalUp({ might: 7 });
    await game.p1.cast("sky", REPEAT_AB);
    expect(paid(game)).toEqual({ energy: 9, fury: 2 });
    expect(await castableWith({ might: 7 }, { energy: 9, fury: 2 }, REPEAT_AB)).toBe(true);
    expect(await castableWith({ might: 7 }, { energy: 8, fury: 2 }, REPEAT_AB)).toBe(false);
    await game.settle();
    expect(game.state("foeA").damage).toBe(5);
    expect(game.state("foeB").damage).toBe(5);
  });

  test("(e) 7-Might Giant, Repeat elected, Marai Spire: (8+7)−7 = exactly 8 energy + [fury][fury]", async () => {
    const game = await portalUp({ might: 7, spire: true });
    await game.p1.cast("sky", REPEAT_AB);
    expect(paid(game)).toEqual({ energy: 8, fury: 2 });
    expect(await castableWith({ might: 7, spire: true }, { energy: 7, fury: 2 }, REPEAT_AB)).toBe(false);
  });

  // ── (f) parity: the second pip is FURY ────────────────────────────────────────────────────────

  test("(f) pool {4, fury:1, calm:1}, 12-Might, no Spire: the Repeat variant is NOT offered (both pips are [fury]; calm cannot substitute) — only the no-Repeat line is listed and a forced repeat cast is rejected with nothing spent (355.16 / 357.3)", async () => {
    const game = await portalUp({}, { calm: 1, energy: 4, fury: 1 });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 1, fury: 1, rainbow: 0 } });
    expect(game.p1.can("cast", "sky")).toBe(true);
    expect(repeatOptions(game, "sky")).toEqual([]);
    const targets = game.p1.option("cast", "sky")?.fields.find((f) => f.name === "targets");
    expect(targets?.max).toBe(1); // single-execution target lists only
    await expect(game.p1.cast("sky", REPEAT_AB)).rejects.toThrow();
    expect(game.zoneOf("sky")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 1, fury: 1, rainbow: 0 } });
    // the no-Repeat line goes through: 0 energy + [fury], calm untouched
    await game.p1.cast("sky", { targets: "foeA" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 1, fury: 0, rainbow: 0 } });
  });

  test("(f) control: the same pool with a second FURY instead of calm ({4, fury:2}) does list the Repeat variant", async () => {
    const game = await portalUp({}, { energy: 4, fury: 2 });
    expect(repeatOptions(game, "sky")).toEqual([1]);
  });

  // ── Defy parity ───────────────────────────────────────────────────────────────────────────────

  test("Defy still cannot target Sky Splitter in any branch — printed 8 > 4 (206): with the 4-energy Repeat cast on the chain P2's Defy is not castable and a forced cast is rejected", async () => {
    for (const o of [{}, { spire: true }, { might: 7 }] as BoardOpts[]) {
      const game = await portalUp(o);
      await game.p1.cast("sky", REPEAT_AB);
      await game.p1.passPriority();
      expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
      expect(game.p2.can("cast", "defy")).toBe(false);
      await expect(game.p2.cast("defy", { targets: "sky" })).rejects.toThrow();
      expect(game.zoneOf("defy")).toBe("hand");
      expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
      expect(game.chain().map((c) => c.cardId)).toEqual(["sky"]);
    }
  });
});
