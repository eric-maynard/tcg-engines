/**
 * Interaction: Risen Altar (ven-163-166) · Battlefield
 *     "[Empower] costs of your units here cost [1] or [rainbow] less."
 *   × Legion Marauder (ven-074-166) · Unit · Body · [2] · 2 Might
 *     "[Empower] — [1] or [body] (Pay either cost: Empower me. Use only if not Empowered.)
 *      [Empowered] I have +1 [Might]."
 *   × Baccai Sandspinner (ven-001-166) · Unit · Fury · [6] · 6 Might
 *     "[Empower] [5]. This ability costs [3] less if you control 4 or fewer runes.
 *      [Empowered] I have [Deflect] and [Assault 2]."
 *
 * (The pairing list swaps the Altar's and the Marauder's collector numbers; the ids used here are the real
 * ones — ven-163-166 is Risen Altar, ven-074-166 is Legion Marauder.)
 *
 * Question. P1 controls Risen Altar and has the Marauder and the Sandspinner standing at it. Two nested
 * elections collide: which [Empower] cost branch to pay, and which half of the Altar's "[1] or [rainbow]"
 * discount to apply. Is the player prompted for BOTH — including branches that are inert or unpayable, and
 * including declining to Empower at all? Contrast the Marauder (a genuine either/or cost) with the
 * Sandspinner (an energy-only cost where the [rainbow] half of the Altar can do nothing).
 *
 * Rules: 827.1.c.1 ([Empower] is an activated ability with a cost), 827.1.c.2 ("pay either cost" — one
 * complete cost, never both, never neither), 827.1.c.3 (text altering the [Empower] cost is taken into
 * account), 827.3 / 441.1.b (Empowered is binary: not-yet-Empowered is not a used-up state), 356.4.b /
 * 356.4.c / 356.4.c.1 (cost adjustments and the order they may be applied in), 356.4.e / 356.6 (a Power
 * discount cannot shave an Energy component and vice versa), 357.1 (paying a cost), 404.1, 355.1.a.
 *
 * Expected / found. The branch election (357.2) IS a real Decision whenever the two halves lead to
 * different payments: the activation carries a `costOptionIndex` field offering exactly {[1], [body]} and
 * each charges its own resource — no "prefers-power" heuristic silently takes the [body] line. Declining is
 * always legal (simply not activating) and leaves the Marauder eligible later. Under the Altar both halves
 * of the Marauder's cost collapse to free, and the engine then offers ONE priced shape rather than two
 * indistinguishable ones; likewise it applies the Altar's "[1] or [rainbow] less" at its most-reducing legal
 * split instead of asking. Both are the documented cost-model design (DESIGN.md "Paying costs": a menu
 * enumerates the distinct PRICED SHAPES the current pool can cover, and equally-good intra-cost payment
 * splits are the engine's pick) — annotated `// DESIGN:` below rather than filed as bugs, because every
 * suppressed alternative is either the identical payment or a strictly costlier one.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RISEN_ALTAR = "ven-163-166";
const LEGION_MARAUDER = "ven-074-166";
const BACCAI_SANDSPINNER = "ven-001-166";

interface Opts {
  /** false → an ordinary (inert) battlefield in the Altar's place. */
  readonly altar?: boolean;
  readonly energy?: number;
  readonly power?: Record<string, number>;
  /** How many runes P1's pool holds — the Sandspinner's "[3] less if 4 or fewer runes" reads this (430.1). */
  readonly runes?: number;
}

/** P1's main phase. "mar"/"spin" stand AT the battlefield, "marHome" stays in base as the control. */
function board(o: Opts = {}) {
  const s = scenario().resources(P1, { energy: o.energy ?? 0, power: o.power ?? {} });
  return (o.altar === false ? s.battlefield("alt", { controller: P1 }) : s.battlefield("alt", { controller: P1, def: RISEN_ALTAR, inert: false }))
    .unit(P1, "alt", LEGION_MARAUDER, "mar")
    .unit(P1, "alt", BACCAI_SANDSPINNER, "spin")
    .unit(P1, "base", LEGION_MARAUDER, "marHome")
    .runes(P1, "body", o.runes ?? 3, { exhausted: true })
    .fillDecks({ main: 10, runes: 0 });
}

/** The `costOptionIndex` enum a two-branch activation offers, or undefined when the engine offers one shape. */
const branchField = (game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>, card: string) =>
  game.p1.option(`activateAbility:${card}#0`)?.fields.find((f) => f.arg === "costOptionIndex");

describe("Risen Altar × Legion Marauder / Baccai Sandspinner — the [Empower] branch election and the discount election", () => {
  // ── the branch election, with no Altar in play ────────────────────────────────────────────────

  test("827.1.c.2 / 357.2 — away from the Altar, with BOTH halves affordable, which cost is paid is a Decision: the activation carries a `costOptionIndex` field offering exactly {0 = [1], 1 = [body]} and two variants", async () => {
    const game = await board({ altar: false, energy: 1, power: { body: 1 } }).build();
    expect(game.p1.can("activate", "mar")).toBe(true);
    expect(game.p1.option("activateAbility:mar#0")?.variantCount).toBe(2);
    expect(branchField(game, "mar")?.options).toEqual([0, 1]);
  });

  test("no auto-elect: branch 0 spends the ENERGY and leaves the [body] pip alone; branch 1 spends the PIP and leaves the energy alone — each is independently payable and leaves a different pool (357.1)", async () => {
    const viaEnergy = await board({ altar: false, energy: 2, power: { body: 1 } }).build();
    await viaEnergy.p1.activate("mar", 0, { params: { costOptionIndex: 0 } });
    expect(viaEnergy.p1.resources()).toEqual({ energy: 1, power: { body: 1 } });
    await viaEnergy.settle();
    expect(viaEnergy.state("mar")).toMatchObject({ isEmpowered: true, might: 3 });

    const viaPower = await board({ altar: false, energy: 2, power: { body: 1 } }).build();
    await viaPower.p1.activate("mar", 0, { params: { costOptionIndex: 1 } });
    expect(viaPower.p1.resources()).toEqual({ energy: 2, power: { body: 0 } });
    await viaPower.settle();
    expect(viaPower.state("mar")).toMatchObject({ isEmpowered: true, might: 3 });
  });

  test("an unpayable half does not kill the whole [Empower]: with a [body] pip and NO energy the activation is still offered (and pays the pip); with only a FURY pip neither half is payable and it is not offered at all", async () => {
    const powerOnly = await board({ altar: false, energy: 0, power: { body: 1 } }).build();
    expect(powerOnly.p1.can("activate", "mar")).toBe(true);
    expect(branchField(powerOnly, "mar")).toBeUndefined(); // only one half is payable — nothing to elect
    await powerOnly.p1.activate("mar");
    expect(powerOnly.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });

    const energyOnly = await board({ altar: false, energy: 1, power: {} }).build();
    expect(energyOnly.p1.can("activate", "mar")).toBe(true);
    await energyOnly.p1.activate("mar");
    expect(energyOnly.p1.energy()).toBe(0);

    const wrongDomain = await board({ altar: false, energy: 0, power: { fury: 1 } }).build();
    expect(wrongDomain.p1.can("activate", "mar")).toBe(false);
    expect(await wrongDomain.p1.try((p) => p.activate("mar"))).toMatchObject({ ok: false });
  });

  // ── declining ────────────────────────────────────────────────────────────────────────────────

  test("827.3 / 441.1.b — declining to Empower is always legal and costs nothing: the Marauder stays un-Empowered at 2 Might with the pool intact, and is still eligible two turns later; once Empowered the ability switches off for good", async () => {
    const game = await board({ altar: false, energy: 5, power: { body: 1 } }).build();
    expect(game.state("mar")).toMatchObject({ isEmpowered: false, might: 2 });
    expect(game.p1.resources()).toEqual({ energy: 5, power: { body: 1 } });

    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("mar").isEmpowered).toBe(false);
    expect(game.p1.can("activate", "mar")).toBe(true); // not-yet-Empowered is not a used-up state
    await game.p1.activate("mar");
    await game.settle();
    expect(game.state("mar")).toMatchObject({ isEmpowered: true, might: 3 });
    expect(game.p1.can("activate", "mar")).toBe(false); // 441.1.b — Empowered is binary
  });

  // ── the Altar's discount on the Marauder ─────────────────────────────────────────────────────

  test("356.4 / 827.1.c.3 — the Altar discounts the [Empower] ACTIVATION cost of a unit HERE: with a completely EMPTY pool the Marauder at the Altar Empowers for free (3 Might) while the identical copy in base cannot Empower at all", async () => {
    const game = await board({ altar: true, energy: 0, power: {} }).build();
    expect(game.p1.can("activate", "marHome")).toBe(false); // "here" — base gets no discount
    expect(game.p1.can("activate", "mar")).toBe(true);
    await game.p1.activate("mar");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // both halves are free: nothing is deducted
    await game.settle();
    expect(game.state("mar")).toMatchObject({ isEmpowered: true, might: 3 });
    expect(game.state("marHome")).toMatchObject({ isEmpowered: false, might: 2 });
    expect(game.violations()).toEqual([]);
  });

  // DESIGN (DESIGN.md "Paying costs" — a menu offers exactly the distinct PRICED SHAPES the pool can cover;
  // equally-good intra-cost payment splits are the engine's pick, not the player's). Under the Altar the
  // [1]+[1]-less and [body]+[rainbow]-less combinations are the SAME payment — zero — so the engine offers
  // one shape and no `costOptionIndex`. The two cross combinations (356.6: a Power discount cannot shave the
  // [1], an Energy discount cannot shave the [body]) survive as strictly costlier payments and are not
  // offered. The election is NOT suppressed in general: the copy in base still shows both branches.
  test("DESIGN: under the Altar the Marauder's two branches collapse onto one payment, so no `costOptionIndex` is asked — while the SAME pool still elects between [1] and [body] for the copy in base (356.4.c, 357.2)", async () => {
    const game = await board({ altar: true, energy: 1, power: { body: 1 } }).build();
    expect(branchField(game, "mar")).toBeUndefined();
    expect(game.p1.option("activateAbility:mar#0")?.variantCount).toBe(1);
    expect(branchField(game, "marHome")?.options).toEqual([0, 1]);
    expect(game.p1.option("activateAbility:marHome#0")?.variantCount).toBe(2);
    await game.p1.activate("mar");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1 } }); // the free shape really is free
  });

  // ── the Altar's discount on the Sandspinner (energy-only cost) ───────────────────────────────

  test("356.4.c.1 — the rune clause and the Altar stack in either order: 4-or-fewer runes turns [5] into [2], and the Altar shaves one more, so the Sandspinner at the Altar Empowers for exactly [1] (Deflect + Assault 2 at 6 Might)", async () => {
    const short = await board({ altar: true, energy: 0, runes: 3 }).build();
    expect(short.p1.can("activate", "spin")).toBe(false);
    const game = await board({ altar: true, energy: 1, runes: 3 }).build();
    expect(game.p1.can("activate", "spin")).toBe(true);
    await game.p1.activate("spin");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("spin")).toMatchObject({ isEmpowered: true, might: 6 });
    expect(game.state("spin").keywords).toEqual(expect.arrayContaining(["Assault", "Deflect"]));
  });

  test("each adjustment is separately load-bearing: without the Altar the same 3-rune board pays [2]; with the Altar but FIVE runes (the [3] clause off) it pays [4]; without either it is the printed [5]", async () => {
    const noAltar = await board({ altar: false, energy: 2, runes: 3 }).build();
    expect((await board({ altar: false, energy: 1, runes: 3 }).build()).p1.can("activate", "spin")).toBe(false);
    await noAltar.p1.activate("spin");
    expect(noAltar.p1.energy()).toBe(0);

    const manyRunes = await board({ altar: true, energy: 4, runes: 5 }).build();
    expect((await board({ altar: true, energy: 3, runes: 5 }).build()).p1.can("activate", "spin")).toBe(false);
    await manyRunes.p1.activate("spin");
    expect(manyRunes.p1.energy()).toBe(0);

    const printed = await board({ altar: false, energy: 5, runes: 5 }).build();
    expect((await board({ altar: false, energy: 4, runes: 5 }).build()).p1.can("activate", "spin")).toBe(false);
    await printed.p1.activate("spin");
    expect(printed.p1.energy()).toBe(0);
  });

  // DESIGN (as above): on an Energy-only cost the [rainbow] half of "[1] or [rainbow] less" is inert (356.6
  // — a Power discount cannot reduce an Energy component), so electing it would leave the Sandspinner at [2]
  // instead of [1]. The engine applies the discount at its most-reducing legal split and never asks; the
  // suppressed alternative is a strictly costlier payment of the same ability.
  test("DESIGN: the Altar's [rainbow] half is inert on the Sandspinner's energy-only cost (356.6) — the engine applies the [1] half and charges [1], with no discount Decision surfaced", async () => {
    const game = await board({ altar: true, energy: 2, runes: 3 }).build();
    expect(branchField(game, "spin")).toBeUndefined();
    expect(game.p1.option("activateAbility:spin#0")?.variantCount).toBe(1);
    await game.p1.activate("spin");
    expect(game.p1.energy()).toBe(1); // [2] − [3] − [1] = 1, not 2
    await game.settle();
    expect(game.state("spin").isEmpowered).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  // ── scope guards ─────────────────────────────────────────────────────────────────────────────

  test("scope: the Altar helps only ITS controller's units — with the battlefield in P2's hands the Marauder standing there pays full price again", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: {} })
      .battlefield("alt", { controller: P2, def: RISEN_ALTAR, inert: false, owner: P2 })
      .unit(P2, "alt", { might: 4, name: "Guard" }, "guard")
      .unit(P1, "alt", LEGION_MARAUDER, "mar")
      .runes(P1, "body", 3, { exhausted: true })
      .fillDecks({ main: 10, runes: 0 })
      .build();
    expect(game.gameState.battlefields.alt?.controller).toBe(P2);
    expect(game.p1.can("activate", "mar")).toBe(false);
  });
});
