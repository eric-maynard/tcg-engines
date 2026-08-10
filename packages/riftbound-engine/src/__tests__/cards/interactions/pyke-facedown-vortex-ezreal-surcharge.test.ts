/**
 * Interaction: Pyke, Dockside Butcher (unl-028-219) flipped from FACEDOWN at Mystic Vortex (ven-160-166)
 *              during a showdown, with / without Ezreal, Prodigy (sfd-149-221) discounting his optional pip.
 *
 *   Pyke, Dockside Butcher — Unit · Fury · 3 · 2 Might · Champion
 *     "[Hidden] [Ganking] You may pay [fury] as an additional cost to play me.
 *      When you play me, if you paid the additional cost, ready me and give me +2 [Might] this turn."
 *   Mystic Vortex — Battlefield
 *     "During showdowns here, cards with [Reaction] cost [rainbow] more to play. (Hidden cards have [Reaction].)"
 *   Ezreal, Prodigy — Unit · Chaos · 3 · 3 Might
 *     "… Optional additional costs you pay cost [1] or [rainbow] less."
 *
 * Question. P1 controls the Vortex with a vanilla 3-Might defender D and has Pyke FACEDOWN there since last
 * turn. P2's turn: P2 attacks the Vortex with A (5) and passes Focus; P1 flips Pyke during the showdown.
 *  (a) With Ezreal in P1's base: which flip variants are offered, what does the "+pay [fury]" variant cost,
 *      and does Pyke still ready / +2 although Ezreal shaved the [fury] to nothing?
 *  (b) WITHOUT Ezreal, pool = {0 energy, calm:1}: which variants are offered?
 *  (c) WITHOUT Ezreal, pool = {0 energy, fury:1, calm:1}: payment for the +pay variant — may calm pay the
 *      Vortex pip while fury pays Pyke's pip?
 *  (d) Control: P1 flips the same Pyke on P1's OWN turn in an open main phase (no showdown), with Ezreal.
 *
 * Rules — the cost pipeline of the flip:
 *   811.1.b / 356.1.b   played from facedown: base cost [3] ignored → 0.
 *   356.2.b.1           the optional additional [fury] is added if P1 elects it.
 *   356.3 + 356.1.b.3   Mystic Vortex adds [rainbow]: a card played from facedown HAS [Reaction] (811.6, 813.5)
 *                       and a cost increase survives an ignored base cost — but only "during showdowns here".
 *   356.4.c / 356.4.f   Ezreal's component discount removes [rainbow]-worth from the optional cost the moment
 *                       it is added → Pyke's [fury] pip becomes 0 …
 *   356.4.f.1           … and it still counts as PAID ("it doesn't matter how much the player actually paid").
 *   357.3 / 355.16      a variant whose total cost the pool cannot cover is not a legal choice → not offered
 *                       (DESIGN.md §Paying costs: legality is pool-only).
 *   135.2.e.5.a         a [rainbow] pip is payable by Power of any Domain; a [fury] pip needs fury (or rainbow).
 *   811.1.d.1 / 323.2.a the flipped unit enters AT the Vortex and, mid-combat, is a Defender.
 *
 * Expected.
 *  (a) TWO variants: no-pay = 0 energy + [rainbow] (paid by calm); +pay = ALSO 0 energy + [rainbow] (Pyke's
 *      pip eaten by Ezreal) → Pyke enters at the Vortex as a defender, the trigger sees "paid" → readied,
 *      4 Might. The no-pay flip leaves him exhausted at 2 Might.
 *  (b) {calm:1}: +pay would need [fury]+[rainbow] = 2 power incl. a fury → unaffordable → ABSENT; only the
 *      no-pay variant ([rainbow], payable with calm) is offered; Pyke enters exhausted at 2 Might.
 *  (c) {fury:1, calm:1}: +pay = 0 energy + [fury] + [rainbow]; fury covers Pyke's pip, calm the Vortex pip →
 *      legal, pool emptied, readied + 4 Might. With {fury:1} alone the +pay variant is unaffordable → absent.
 *  (d) Own turn, no showdown: the Vortex adds nothing; 0 + [fury] − Ezreal = free, still "paid" → enters at
 *      the Vortex ready with 4 Might.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PYKE = "unl-028-219";
const MYSTIC_VORTEX = "ven-160-166";
const EZREAL = "sfd-149-221";

interface BoardOpts {
  readonly ezreal?: boolean;
  readonly power?: Record<string, number>;
  /** Whose turn it is (default P2 — the attack scenario). */
  readonly active?: typeof P1 | typeof P2;
}

/**
 * Turn 3. mv = Mystic Vortex (live text) controlled by P1 with defender D (3) and Pyke facedown there since an
 * earlier turn; bf2 is P2's. P2 has attacker A (5) in base. P1 has 0 energy and the given power.
 */
function board(opts: BoardOpts = {}) {
  const b = scenario()
    .turn(3)
    .active(opts.active ?? P2)
    .resources(P1, { energy: 0, power: opts.power ?? { calm: 1 } })
    .battlefield("mv", { controller: P1, def: MYSTIC_VORTEX, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "mv", { might: 3, name: "Defender D" }, "D")
    .unit(P2, "bf2", { might: 1, name: "Holder H" }, "H")
    .unit(P2, "base", { might: 5, name: "Attacker A" }, "A")
    .facedown(P1, "mv", PYKE, "pyke");
  if (opts.ezreal) {
    b.unit(P1, "base", EZREAL, "ezreal");
  }
  return b;
}

/** P2 attacks the Vortex with A and passes Focus → P1 holds Focus in an Open showdown at the Vortex. */
async function showdown(opts: BoardOpts = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p2.move("A", "mv");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** The `paidAdditionalCost` values of P1's flip variants for Pyke: [] = not offered, [false] = no-pay only, [false,true] = both. */
function flipVariants(game: Game): boolean[] {
  const opt = game.p1.option("revealHidden", "pyke");
  if (!opt) {
    return [];
  }
  return [...new Set(opt.variants.map((v) => v.params.paidAdditionalCost === true))].toSorted();
}

/** Pass priority until the chain is empty (stops before combat resolution). */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Pyke flipped at Mystic Vortex mid-showdown — Vortex surcharge × optional [fury] × Ezreal", () => {
  // ── (a) with Ezreal, pool {calm:1} ─────────────────────────────────────────────────────────

  test("(a) with Ezreal the no-pay flip is offered in the showdown (811.6 Reaction timing; [rainbow] payable by calm, 135.2.e.5.a)", async () => {
    const game = await showdown({ ezreal: true });
    expect(game.p1.can("reveal", "pyke")).toBe(true);
    expect(flipVariants(game)).toContain(false);
  });

  // Expected (356.4.c / 356.4.f): Ezreal strips Pyke's optional [fury] the moment it is added, so the +pay
  // variant costs exactly the Vortex [rainbow] — affordable with calm — and must be offered beside the no-pay
  // one. Actual: the flip path prices the optional pip verbatim (no Ezreal), finds no fury and drops the variant.
  test.failing("BUG: (a) with Ezreal BOTH variants are offered — the +pay [fury] is discounted to 0 and only the Vortex [rainbow] remains (356.4.c, 356.4.f, 357.3)", async () => {
    const game = await showdown({ ezreal: true });
    expect(flipVariants(game)).toEqual([false, true]);
  });

  // Expected: +pay flip = 0 energy + [rainbow] (calm 1 → 0); Pyke enters at the Vortex as a defender; the cost
  // counts as PAID (356.4.f.1) → trigger readies him and gives +2 → 4 Might, ready. Actual: variant not legal.
  test.failing("BUG: (a) +pay flip with Ezreal costs only the calm, and Pyke — cost 'paid' per 356.4.f.1 — is readied at 4 Might as a defender", async () => {
    const game = await showdown({ ezreal: true });
    await game.p1.reveal("pyke", { payOptional: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.locationOf("pyke")).toBe("mv");
    await resolveChain(game);
    expect(game.state("pyke")).toMatchObject({ combatRole: "defender", isReady: true, location: "mv", might: 4 });
  });

  test("(a) no-pay flip with Ezreal: base [3] ignored (energy untouched) but the Vortex [rainbow] IS charged — calm 1 → 0 (811.1.b, 811.6, 356.1.b.3)", async () => {
    const game = await showdown({ ezreal: true });
    await game.p1.reveal("pyke");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("(a) no-pay flip: Pyke enters AT the Vortex, exhausted, 2 Might, designated a Defender; nothing paid → no ready/+2 trigger effect (811.1.d.1, 323.2.a)", async () => {
    const game = await showdown({ ezreal: true });
    await game.p1.reveal("pyke");
    await resolveChain(game);
    expect(game.zoneOf("pyke")).toBe("battlefield-mv");
    expect(game.state("pyke")).toMatchObject({ combatRole: "defender", controller: P1, isExhausted: true, might: 2, mightModifier: 0 });
  });

  // ── (b) without Ezreal, pool {calm:1} ──────────────────────────────────────────────────────

  test("(b) without Ezreal and only {calm:1}: the +pay variant ([fury]+[rainbow] = 2 power incl. fury) is ABSENT; only the no-pay flip is offered (357.3, 355.16)", async () => {
    const game = await showdown();
    expect(flipVariants(game)).toEqual([false]);
    await expect(game.p1.reveal("pyke", { payOptional: true })).rejects.toThrow();
    expect(game.zoneOf("pyke")).toBe("facedown-mv");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
  });

  test("(b) the no-pay flip spends the calm on the Vortex pip and Pyke enters exhausted at 2 Might, no bonus", async () => {
    const game = await showdown();
    await game.p1.reveal("pyke");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await resolveChain(game);
    expect(game.state("pyke")).toMatchObject({ combatRole: "defender", isExhausted: true, location: "mv", might: 2 });
  });

  test("(b) control — with NO power at all the flip is not offered during the showdown here: the Vortex [rainbow] is unpayable (356.3, 356.1.b.3)", async () => {
    const game = await showdown({ power: {} });
    expect(game.p1.can("reveal", "pyke")).toBe(false);
    expect(flipVariants(game)).toEqual([]);
  });

  // ── (c) without Ezreal, pool {fury:1, calm:1} ──────────────────────────────────────────────

  test("(c) with {fury:1, calm:1} both variants are offered", async () => {
    const game = await showdown({ power: { fury: 1, calm: 1 } });
    expect(flipVariants(game)).toEqual([false, true]);
  });

  // Expected (135.2.e.5.a / 356.7): the fury MUST go to Pyke's [fury] pip and the calm covers the Vortex's
  // any-domain pip → pool emptied, cost paid → readied, 4 Might. Actual: the engine pays the Vortex surcharge
  // first with whichever domain sits first in the pool (here fury), then finds no fury for Pyke's pip and
  // silently skips it (calm left over, no ready/+2) — the outcome depends on pool insertion order.
  test.failing("BUG: (c) +pay with {fury:1, calm:1}: fury pays Pyke's pip, calm pays the Vortex pip → pool EMPTY, Pyke readied at 4 Might (135.2.e.5.a, 356.4.f.1)", async () => {
    const game = await showdown({ power: { fury: 1, calm: 1 } });
    await game.p1.reveal("pyke", { payOptional: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, calm: 0 } });
    await resolveChain(game);
    expect(game.state("pyke")).toMatchObject({ combatRole: "defender", isReady: true, location: "mv", might: 4 });
  });

  test("(c) no-pay with {fury:1, calm:1}: exactly one power is spent on the Vortex pip, Pyke exhausted at 2 Might", async () => {
    const game = await showdown({ power: { fury: 1, calm: 1 } });
    await game.p1.reveal("pyke");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(1);
    await resolveChain(game);
    expect(game.state("pyke")).toMatchObject({ isExhausted: true, might: 2 });
  });

  // Expected (357.3 / 355.16): with a lone fury the +pay variant needs 2 power → unaffordable → absent.
  // Actual: the surcharge check and the optional-pip check each see the same fury and both pass, so the
  // engine offers a +pay flip that then eats the fury for the Vortex and never pays Pyke's pip.
  test.failing("BUG: (c) control — with {fury:1} ALONE the +pay variant is absent (one fury can't pay [fury] AND [rainbow]); only the no-pay flip is offered (357.3)", async () => {
    const game = await showdown({ power: { fury: 1 } });
    expect(flipVariants(game)).toEqual([false]);
  });

  // ── (d) own turn, open main phase, no showdown at the Vortex ───────────────────────────────

  test("(d) on P1's own turn (Neutral Open, no showdown) the no-pay flip is offered with an EMPTY pool — 'during showdowns here' adds nothing (811.1.b)", async () => {
    const game = await board({ active: P1, ezreal: true, power: {} }).build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(flipVariants(game)).toContain(false);
    await game.p1.reveal("pyke");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("pyke")).toMatchObject({ isExhausted: true, location: "mv", might: 2 });
  });

  // Expected (356.4.c / 356.4.f.1): 0 + [fury] − Ezreal's [rainbow] = 0 energy, 0 power, still "paid" → the
  // +pay variant is offered with an empty pool and Pyke enters at the Vortex READY with 4 Might.
  // Actual: the flip path ignores Ezreal, sees no fury in the pool and never offers the +pay variant.
  test.failing("BUG: (d) own turn with Ezreal and an empty pool: the +pay variant is offered for free and Pyke enters ready at 4 Might (356.4.c, 356.4.f.1)", async () => {
    const game = await board({ active: P1, ezreal: true, power: {} }).build();
    expect(flipVariants(game)).toEqual([false, true]);
    await game.p1.reveal("pyke", { payOptional: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("pyke")).toMatchObject({ isReady: true, location: "mv", might: 4 });
  });

  test("(d) control — own turn WITHOUT Ezreal, {fury:1}: the +pay flip spends exactly the fury (no Vortex pip outside a showdown) and Pyke enters at the Vortex ready with 4 Might", async () => {
    const game = await board({ active: P1, power: { fury: 1 } }).build();
    expect(flipVariants(game)).toEqual([false, true]);
    await game.p1.reveal("pyke", { payOptional: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pyke", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("pyke")).toMatchObject({ isReady: true, location: "mv", might: 4, mightModifier: 2 });
    expect(game.violations()).toEqual([]);
  });
});
