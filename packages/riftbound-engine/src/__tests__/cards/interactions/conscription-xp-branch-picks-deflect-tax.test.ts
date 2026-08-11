/**
 * Interaction: Conscription (unl-140-219) · Spell · Chaos · 5 energy + [chaos][chaos]
 *     "You may spend 5 XP as an additional cost to play this.
 *      Choose an enemy unit at a battlefield with 3 [Might] or less. If you paid the additional
 *      cost, choose any enemy unit at a battlefield instead. Take control of it, exhaust it, and
 *      recall it."
 *   × Volibear, Furious (ogn-041-298) · 9 [Might] · [Deflect 2]
 *   × Pouty Poro (ogn-013-298) · 2 [Might] · [Deflect]
 *
 * Rules: 355.1.a (whether to pay an Optional Additional Cost is decided in step 2 of playing),
 * 355.5 (targets are chosen after that — and here the legal set DEPENDS on the election),
 * 355.8 (a spell only goes on the chain if valid choices exist for every target), 355.16 (a
 * choice that deterministically leads to an illegal later choice may not be made "unless they
 * have no choice"), 356.2.b.1 (the "may … as an additional cost" branch), 356.2.a.2 + 809
 * (Deflect is a MANDATORY additional cost, never waived), 809.1.b.2 (Deflect Value), 809.2
 * (values sum), 809.1.c.1 (Deflect power may be of any Domain), 356.7 / 357.1 / 357.2 (the
 * combined cost is paid as one).
 *
 * Question: the XP election gates which targets are legal AND, through Deflect, how big the
 * surcharge is. Are both branches payable with different totals, what happens at 4 XP, and what
 * happens at 5 XP when Volibear is the only enemy unit at a battlefield?
 *
 * Expected: three legal lines with three different totals —
 *   declined + Poro  = 5 energy + [chaos][chaos] + [rainbow]              (XP untouched)
 *   paid    + Poro   = the same resources, plus 5 XP
 *   paid    + Volibear = 5 energy + [chaos][chaos] + [rainbow][rainbow], plus 5 XP
 * declined + Volibear never exists (9 > 3 Might). At 4 XP the paid branch is not selectable at
 * all, but Conscription is still playable on Pouty Poro — "can't afford the optional cost" is
 * not "can't play Conscription". At 5 XP with Volibear the ONLY enemy unit, the decline branch
 * deterministically has no legal target (355.16 / 355.8) so it must not be selectable, and the
 * election collapses to {spend 5 XP} — still shown as a real election that is being forced.
 * Deflect is mandatory: with the printed cost exactly covered but no spare Power, the spell is
 * not castable at all.
 *
 * DESIGN: the engine settles the election and the target as ONE bundled play whose enumerated
 * variants are the legal (election × target) pairs, rather than as two sequential Decisions
 * (`moves/play/play-options.ts`, DESIGN.md § Paying costs: "every destination × every
 * optional-cost election … that is legal AND payable from the CURRENT pool"). The ordering
 * constraint of 355.1.a → 355.5 is therefore asserted on the variant SET: which pairs exist,
 * which are absent, and when the `payOptional` field is forced to a single value.
 */
import { describe, expect, test } from "bun:test";
import type { ActionField, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CONSCRIPTION = "unl-140-219";
const VOLIBEAR = "ogn-041-298";
const POUTY_PORO = "ogn-013-298";

/** P1's main phase: 5 energy + [chaos][chaos] plus `spare` Power of another Domain for Deflect. */
function board(opts: { xp?: number; spare?: number; poro?: boolean; volibear?: boolean } = {}) {
  const { poro = true, spare = 3, volibear = true, xp = 5 } = opts;
  let s = scenario()
    .xp(P1, xp)
    .resources(P1, { energy: 5, power: spare > 0 ? { calm: spare, chaos: 2 } : { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .hand(P1, CONSCRIPTION, "con");
  if (volibear) {
    s = s.unit(P2, "bf1", VOLIBEAR, "voli");
  }
  if (poro) {
    s = s.unit(P2, "bf1", POUTY_PORO, "poro");
  }
  return s;
}

const field = (game: Game, name: string): ActionField | undefined =>
  game.p1.option("cast", "con")?.fields.find((f) => f.name === name);

/** The legal (payOptional, target) pairs the cast option enumerates, as sorted "paid|target" keys. */
function lines(game: Game): string[] {
  const variants = game.p1.option("cast", "con")?.variants ?? [];
  return variants
    .map((v) => `${v.params.paidAdditionalCost === true ? "paid" : "declined"}|${(v.params.targets as string[])[0]}`)
    .sort();
}

describe("Conscription — the XP election picks the target set, and Deflect taxes each branch differently", () => {
  test("setup: Volibear is a 9-Might [Deflect 2] and Pouty Poro a 2-Might [Deflect]; both are enemy units at a battlefield", async () => {
    const game = await board().build();
    expect(game.state("voli")).toMatchObject({ controller: P2, location: "bf1", might: 9 });
    expect(game.state("voli").keywords).toContain("Deflect");
    expect(game.state("poro")).toMatchObject({ controller: P2, location: "bf1", might: 2 });
    expect(game.state("poro").keywords).toContain("Deflect");
  });

  test("both branches exist and each branch carries its own target set: declined → Pouty Poro only (≤3 Might), paid → both; 'declined + Volibear' is never a legal line", async () => {
    const game = await board().build();
    expect(lines(game)).toEqual(["declined|poro", "paid|poro", "paid|voli"]);
    expect([...(field(game, "paidAdditionalCost")?.options ?? [])].sort()).toEqual([false, true]);
    await expect(game.p1.cast("con", { payOptional: false, targets: "voli" })).rejects.toThrow();
    expect(game.zoneOf("con")).toBe("hand");
    expect(game.p1.xp()).toBe(5);
  });

  test("declined + Pouty Poro: 5 energy + [chaos][chaos] + ONE Deflect Power of any Domain (809.1.c.1); XP is untouched and the Poro is conscripted", async () => {
    const game = await board().build();
    await game.p1.cast("con", { payOptional: false, targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 2, chaos: 0 } });
    expect(game.p1.xp()).toBe(5);
    await game.settle();
    expect(game.state("poro")).toMatchObject({ controller: P1, isExhausted: true, location: "base", owner: P2 });
    expect(game.zoneOf("con")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("paid + Pouty Poro: the same resources PLUS 5 XP — the election is a real extra payment even when it buys nothing new", async () => {
    const game = await board().build();
    await game.p1.cast("con", { payOptional: true, targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 2, chaos: 0 } });
    expect(game.p1.xp()).toBe(0);
    await game.settle();
    expect(game.state("poro")).toMatchObject({ controller: P1, isExhausted: true, location: "base" });
  });

  test("paid + Volibear: 5 energy + [chaos][chaos] + TWO Deflect Power (809.1.b.2 / 809.2) plus 5 XP; the 9-Might champion ends up P1's, exhausted, in P1's base, still owned by P2", async () => {
    const game = await board().build();
    await game.p1.cast("con", { payOptional: true, targets: "voli" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1, chaos: 0 } });
    expect(game.p1.xp()).toBe(0);
    await game.settle();
    expect(game.state("voli")).toMatchObject({ controller: P1, isExhausted: true, location: "base", owner: P2 });
    expect(game.p1.units("base")).toContain("voli");
    expect(game.violations()).toEqual([]);
  });

  test("the Deflect surcharge scales the branch, so the pool alone decides which lines exist: with only 1 spare Power, Volibear (+2) drops out while both Poro (+1) branches remain", async () => {
    const game = await board({ spare: 1 }).build();
    expect(lines(game)).toEqual(["declined|poro", "paid|poro"]);
    await expect(game.p1.cast("con", { payOptional: true, targets: "voli" })).rejects.toThrow();
    expect(game.p1.resources()).toEqual({ energy: 5, power: { calm: 1, chaos: 2 } });
  });

  test("Deflect is a MANDATORY additional cost (356.2.a.2): with the printed 5 + [chaos][chaos] exactly covered but no spare Power, Conscription is not castable at all — the surcharge is never waived", async () => {
    const game = await board({ spare: 0 }).build();
    expect(game.p1.can("cast", "con")).toBe(false);
    expect(game.p1.option("cast", "con")).toBeUndefined();
    await expect(game.p1.cast("con", { payOptional: false, targets: "poro" })).rejects.toThrow();
    expect(game.zoneOf("con")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { chaos: 2 } });
  });

  test("4 XP: the paid branch is not selectable — no `payOptional` field at all, no paid line, and forcing it is refused; but Conscription is STILL playable on Pouty Poro via the decline branch", async () => {
    const game = await board({ xp: 4 }).build();
    expect(lines(game)).toEqual(["declined|poro"]);
    expect(field(game, "paidAdditionalCost")).toBeUndefined();
    expect((await game.p1.try((p) => p.cast("con", { payOptional: true, targets: "voli" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("con", { payOptional: true, targets: "poro" }))).ok).toBe(false);
    expect(game.p1.xp()).toBe(4);

    expect(game.p1.can("cast", "con")).toBe(true);
    await game.p1.cast("con", { targets: "poro" });
    expect(game.p1.xp()).toBe(4); // the unpaid branch spends no XP
    await game.settle();
    expect(game.state("poro")).toMatchObject({ controller: P1, location: "base" });
  });

  test("5 XP with Volibear as the ONLY enemy unit: the decline branch would deterministically have no legal target (355.16 / 355.8), so it is not selectable — the election collapses to {spend 5 XP} but is still shown as a required election", async () => {
    const game = await board({ poro: false }).build();
    expect(lines(game)).toEqual(["paid|voli"]);
    const election = field(game, "paidAdditionalCost");
    expect(election).toBeDefined();
    expect(election?.options).toEqual([true]); // forced, not silently dropped from the move
    expect(election?.required).toBe(true);
    await expect(game.p1.cast("con", { payOptional: false, targets: "voli" })).rejects.toThrow();

    await game.p1.cast("con", { payOptional: true, targets: "voli" });
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1, chaos: 0 } });
    await game.settle();
    expect(game.state("voli")).toMatchObject({ controller: P1, isExhausted: true, location: "base" });
  });

  test("naming no election takes the DECLINE branch (the cheaper, narrower one): XP survives and the Poro is taken", async () => {
    const game = await board().build();
    await game.p1.cast("con", { targets: "poro" });
    expect(game.p1.xp()).toBe(5);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 2, chaos: 0 } });
    await game.settle();
    expect(game.state("poro").controller).toBe(P1);
    expect(game.state("voli").controller).toBe(P2);
  });
});
