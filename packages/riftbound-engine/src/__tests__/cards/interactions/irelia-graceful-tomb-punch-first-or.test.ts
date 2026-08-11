/**
 * Interaction: two cost discounts on one spell — a fixed one and an ELECTIVE one
 *
 *   Sandswept Tomb (ven-164-166) — Battlefield
 *       "Each spell that chooses one or more units here that are friendly to it costs [rainbow] less."
 *   Irelia, Graceful (sfd-141-221) — Unit · Chaos · Champion · 4 + [chaos] · 4 Might
 *       "Your spells that choose me cost [1] or [rainbow] less."
 *   Punch First (sfd-097-221) — [Action] · Body · 1 energy + [body][body]
 *       "Give a unit +5 [Might] this turn."
 *
 * Rules: 356.4.b (a discount is applied while the cost is being determined, i.e. from the targets chosen
 * as the spell is played), 356.4.c / 356.4.c.1 (COMPONENT discounts — an Energy or a Power pip — may be
 * applied in any order), 356.4.d (a TOTAL-cost discount would have to be applied after every component
 * one), 356.6 (no component may be reduced below 0 — a pip discount can never claw back Energy), 356.4
 * generally, 355.5 / 355.7 (targets are chosen in step 2 of playing the spell, so the discounts are decided
 * from them), 355.1.a (playing is one action: choose, determine cost, pay), 357.1 (pay the total cost),
 * 740.1.a ("friendly to it" = friendly to the SPELL, i.e. its controller).
 *
 * Question — P1 controls Sandswept Tomb with Irelia at it and plays Punch First choosing Irelia. Two
 * discounts apply: the Tomb's fixed [rainbow]-less and Irelia's elective [1]-or-[rainbow]-less.
 *  Is the elective half surfaced as a Decision, and are BOTH branches actually payable with genuinely
 *  different pools? Then the no-side: Punch First choosing another friendly unit at the Tomb, and
 *  Punch First choosing Irelia after she has moved off the Tomb, and an opponent's spell choosing Irelia.
 *
 * Expected: the Tomb applies unconditionally and silently ([body][body] → [body]). Irelia's is an ELECTION
 * the caster makes — {reduce by [1], reduce by [rainbow]}, with no decline branch (a discount is not
 * optional; only which half is chosen). Branch A ([rainbow]-less) totals 1 Energy + 0 Power; branch B
 * ([1]-less) totals 0 Energy + [body]. Both must be independently payable and must leave demonstrably
 * different pools. With a pool of exactly 1 Energy and no Power only branch A is payable; with exactly one
 * Body Power and no Energy only branch B is — and the engine must not auto-elect one half and declare the
 * spell unplayable for the other player. Neither discount may push a component below 0, so a double
 * [rainbow] waiver cannot claw back the Energy. No-side: another friendly unit at the Tomb gets the Tomb's
 * discount and NO election; Irelia at P1's base gets the election and NOT the Tomb's; an opponent's spell
 * choosing Irelia gets neither.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TOMB = "ven-164-166";
const IRELIA = "sfd-141-221";
const PUNCH_FIRST = "sfd-097-221";

type Pool = { energy?: number; power?: Record<string, number> };

/** Total resource units in a pool (energy + every pip) — the quantity a single discount reduces by one. */
const poolSize = (game: Game, seat: "p1" | "p2" = "p1") => {
  const r = game[seat].resources();
  return r.energy + Object.values(r.power).reduce((a, b) => a + b, 0);
};

/** P1's turn. Sandswept Tomb (live) controlled by P1; Irelia at `ireliaAt`; a friendly Buddy and an enemy Foe at the Tomb. */
function board(pool: Pool, ireliaAt: "tomb" | "base" = "tomb") {
  return scenario()
    .resources(P1, pool)
    .battlefield("tomb", { controller: P1, def: TOMB, inert: false })
    .unit(P1, ireliaAt, IRELIA, "irelia")
    .unit(P1, "tomb", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "tomb", { might: 2, name: "Foe" }, "foe")
    .hand(P1, PUNCH_FIRST, "pf");
}

/** P2's turn, P1 still controls the Tomb with Irelia on it; P2 has a unit there too. */
function enemyBoard(pool: Pool) {
  return scenario()
    .active(P2)
    .resources(P2, pool)
    .battlefield("tomb", { controller: P1, def: TOMB, inert: false, owner: P1 })
    .unit(P1, "tomb", IRELIA, "irelia")
    .unit(P2, "tomb", { might: 2, name: "Theirs" }, "theirs")
    .hand(P2, PUNCH_FIRST, "pf");
}

describe("Sandswept Tomb (fixed) × Irelia, Graceful (elective) on one Punch First", () => {
  // ── baseline: what Punch First costs with neither discount ─────────────────────────────────

  test("baseline — neither discount: Punch First choosing the ENEMY unit at the Tomb pays its full 1 energy + [body][body] and gives it +5 this turn", async () => {
    const game = await board({ energy: 1, power: { body: 2 } }).build();
    await game.p1.cast("pf", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.state("foe").might).toBe(7);
    expect(game.zoneOf("pf")).toBe("trash");
  });

  // ── the Tomb alone: unconditional, silent, one pip ─────────────────────────────────────────

  test("no-side — the Tomb's discount alone: choosing friendly Buddy at the Tomb waives exactly one pip ([body][body] → [body]) and NO election is ever surfaced (356.4.c)", async () => {
    const game = await board({ energy: 1, power: { body: 2 } }).build();
    await game.p1.cast("pf", { targets: "buddy" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1 } }); // 1 energy + exactly one pip paid
    // nothing was asked: P1 simply holds priority on its own chain item
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.settle();
    expect(game.state("buddy").might).toBe(7);
  });

  test("no-side — the Tomb needs a unit friendly TO THE SPELL (740.1.a): P2's Punch First on P2's OWN unit at P1's Tomb IS discounted, but P2's Punch First on Irelia is not", async () => {
    const theirs = await enemyBoard({ energy: 1, power: { body: 1 } }).build();
    expect(theirs.p2.can("cast", "pf")).toBe(true);
    await theirs.p2.cast("pf", { targets: "theirs" });
    expect(theirs.p2.resources()).toEqual({ energy: 0, power: { body: 0 } }); // 1 + one pip

    const onIrelia = await enemyBoard({ energy: 1, power: { body: 1 } }).build();
    const refused = await onIrelia.p2.try((p) => p.cast("pf", { targets: "irelia" }));
    expect(refused.ok).toBe(false); // "your spells" is P1's; "friendly to it" is P2's — neither applies
    expect(onIrelia.zoneOf("pf")).toBe("hand");
  });

  test("no-side — an OPPONENT's spell choosing Irelia gets NEITHER discount: with 1 energy + [body][body] P2 pays every last resource", async () => {
    const game = await enemyBoard({ energy: 1, power: { body: 2 } }).build();
    await game.p2.cast("pf", { targets: "irelia" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.state("irelia").might).toBe(9);
  });

  // ── both discounts live: the two branches, each on a pool only it can pay ──────────────────

  test("branch A ([rainbow]-less) — total 1 Energy + 0 Power: with EXACTLY 1 energy and no Power at all, Punch First on Irelia at the Tomb is castable and empties the pool", async () => {
    const game = await board({ energy: 1 }).build();
    expect(game.p1.can("cast", "pf")).toBe(true);
    await game.p1.cast("pf", { targets: "irelia" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("irelia").might).toBe(9);
    expect(game.zoneOf("pf")).toBe("trash");
  });

  test("branch B ([1]-less) — total 0 Energy + [body]: with ZERO energy and [body][body], Punch First on Irelia at the Tomb is castable, spends one pip and leaves the other", async () => {
    const game = await board({ energy: 0, power: { body: 2 } }).build();
    expect(game.p1.can("cast", "pf")).toBe(true);
    await game.p1.cast("pf", { targets: "irelia" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1 } });
    await game.settle();
    expect(game.state("irelia").might).toBe(9);
  });

  test("the two branches leave DIFFERENT pools, and exactly one resource unit is spent either way: from 1 energy + [body][body] the caster ends on {0,[body][body]} or {1,[body]}", async () => {
    const game = await board({ energy: 1, power: { body: 2 } }).build();
    await game.p1.cast("pf", { targets: "irelia" });
    // Whichever half is elected, the Tomb's pip plus Irelia's one unit come off a 3-unit pool.
    expect(poolSize(game)).toBe(2);
    const r = game.p1.resources();
    const branchA = r.energy === 0 && r.power.body === 2; // [rainbow]-less: 1 energy paid
    const branchB = r.energy === 1 && r.power.body === 1; // [1]-less: one pip paid
    expect(branchA || branchB).toBe(true);
    expect(branchA && branchB).toBe(false);
  });

  // BUG — expected (356.4.b): with 0 energy and a single [body] the caster elects the [1]-less half, so the
  // total is 0 Energy + [body] (the Tomb already ate the other pip) and the spell IS castable. Actual: the
  // engine never asks — `moves/play/cost.ts prefersPowerWaiver` auto-elects the [rainbow] half whenever the
  // pool cannot cover the PRINTED pips, leaving a 1-Energy total this pool cannot pay, so the cast is refused.
  test("the Power-only caster is not stranded — 0 energy + one [body] must be enough for Punch First on Irelia at the Tomb via the [1]-less half (356.4.b, 356.4.c.1)", async () => {
    const game = await board({ energy: 0, power: { body: 1 } }).build();
    expect(game.p1.can("cast", "pf")).toBe(true);
    await game.p1.cast("pf", { targets: "irelia" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.state("irelia").might).toBe(9);
    expect(game.zoneOf("pf")).toBe("trash");
  });

  // BUG — expected (356.4.b / 356.4.c): "[1] or [rainbow] less" is ONE discount whose half the CASTER picks,
  // so playing Punch First on Irelia must surface a two-option choice (reduce by [1] / reduce by [rainbow])
  // with no decline branch, and electing [rainbow] must leave 0 energy and both pips. Actual: no choice
  // exists anywhere — neither as a field of the cast option (its only field is `targets`) nor as a Decision;
  // the engine silently applies the pool heuristic and here picks the [1] half.
  test.failing("BUG: Irelia's elective half is never offered — casting Punch First on her must raise a 2-option, non-declinable cost-election Decision for P1", async () => {
    const game = await board({ energy: 1, power: { body: 2 } }).build();
    expect(game.p1.option("cast", "pf")?.fields.map((f) => f.name)).toContain("cost-election");
    await game.p1.cast("pf", { targets: "irelia" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, allowDecline: false });
    expect(d?.kind === "pick" ? d.options.length : 0).toBe(2);
    await game.p1.pick(d?.kind === "pick" ? (d.options[1]?.key as string) : "");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 2 } }); // the [rainbow] branch
  });

  // ── 356.6 — a discount never pushes a component below 0 ────────────────────────────────────

  test("356.6 — neither discount can claw resources out of the other component: with a completely empty pool Punch First on Irelia at the Tomb is still not castable", async () => {
    const game = await board({ energy: 0 }).build();
    expect(game.p1.can("cast", "pf")).toBe(false);
    const r = await game.p1.try((p) => p.cast("pf", { targets: "irelia" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("pf")).toBe("hand");
  });

  test("356.6 — the two [rainbow] waivers cancel both pips but leave the Energy alone: 1 energy suffices, 0 energy never does", async () => {
    expect((await board({ energy: 1 }).build()).p1.can("cast", "pf")).toBe(true);
    const broke = await board({ energy: 0 }).build();
    expect(broke.p1.can("cast", "pf")).toBe(false);
  });

  // ── no-side: Irelia off the Tomb ───────────────────────────────────────────────────────────

  test("no-side — Irelia at P1's BASE: only her election applies, the Tomb's does not, so the cost is 1 + [body][body] minus ONE unit", async () => {
    // [1]-less branch: 0 energy + [body][body]
    const pips = await board({ energy: 0, power: { body: 2 } }, "base").build();
    expect(pips.p1.can("cast", "pf")).toBe(true);
    await pips.p1.cast("pf", { targets: "irelia" });
    expect(pips.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });

    // [rainbow]-less branch: 1 energy + [body]
    const mixed = await board({ energy: 1, power: { body: 1 } }, "base").build();
    expect(mixed.p1.can("cast", "pf")).toBe(true);
    await mixed.p1.cast("pf", { targets: "irelia" });
    expect(mixed.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await mixed.settle();
    expect(mixed.state("irelia").might).toBe(9);
  });

  test("no-side — Irelia at P1's BASE with 1 energy and NO power is NOT castable: without the Tomb one pip always survives the single discount", async () => {
    const game = await board({ energy: 1 }, "base").build();
    expect(game.p1.can("cast", "pf")).toBe(false);
    expect((await game.p1.try((p) => p.cast("pf", { targets: "irelia" }))).ok).toBe(false);
    // …whereas the very same pool works while she stands at the Tomb (both pips waived)
    const atTomb = await board({ energy: 1 }).build();
    expect(atTomb.p1.can("cast", "pf")).toBe(true);
  });

  test("no-side — Buddy at the Tomb never triggers Irelia's static even though she is on the board: 1 energy + [body] is charged and Irelia gains nothing", async () => {
    const game = await board({ energy: 1, power: { body: 1 } }).build();
    expect(game.p1.can("cast", "pf")).toBe(true);
    await game.p1.cast("pf", { targets: "buddy" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.state("buddy").might).toBe(7);
    expect(game.state("irelia").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  // ── resolution ────────────────────────────────────────────────────────────────────────────

  test("resolution — the +5 is 'this turn': Irelia is 9 Might after the spell resolves and back to 4 next turn", async () => {
    const game = await board({ energy: 1, power: { body: 2 } }).build();
    await game.p1.cast("pf", { targets: "irelia" });
    // NB: no `violations()` oracle here — the harness `costPaid` invariant compares the PRINTED energy
    // cost against the pool delta and does not know about component discounts, so an elected "[1] less"
    // (energy 1 → 0, only a pip paid) trips it spuriously. The resource assertions above are the real check.
    expect(poolSize(game)).toBe(2);
    await game.settle();
    expect(game.state("irelia").might).toBe(9);
    await game.advanceTurn();
    expect(game.state("irelia").might).toBe(4);
  });
});
