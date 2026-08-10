/**
 * Interaction: Smoke Screen ×2 (ogn-093-298) "[Reaction] Give a unit -4 [Might] this turn, to a minimum of
 *     1 [Might]."  (2 + [mind])
 *   × Stupefy (ogn-095-298) "[Reaction] Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1." (1)
 *   × Discipline (ogn-058-298) "[Reaction] Give a unit +2 [Might] this turn. Draw 1." (2)
 *   on Leona, Zealot (ogn-079-298, printed 6 — used only as a 6-Might body in P2's base; nobody is stunned).
 *
 * Question: Leona (6) is hit, each resolving before the next is played, by P1's Smoke Screen (6→2), P1's
 * Stupefy (2→1), a second Smoke Screen (already at 1). Then P2 plays Discipline (+2) on her. Is she 1
 * ("re-clamped"), 3, or something else? And if Discipline had resolved FIRST, before any debuff?
 *
 * Timing note (813.1.c.1): it is P1's turn, so P2's [Reaction] Discipline can only be played in a Closed
 * State. "Discipline last" = P2 responds to an unrelated P1 spell (Cleave on P1's own unit) after all three
 * debuffs have resolved; "Discipline first" = P2 responds to Smoke Screen #1, so Discipline resolves before it.
 *
 * Rules: 477.3.b + 477.3.e.2.b (a non-passive arithmetic effect with a limitation SNAPSHOTS the amount it
 * could apply when it began applying and keeps that amount for its duration), 480.1 (timestamp = when it
 * begins applying), 476 / 477.3.e.1-2 (re-evaluate: increases first, then the remembered decreases),
 * 143.2.b (the "minimum" is per effect, not a global floor).
 *
 * Expected: SS#1 snapshots -4 (6→2); Stupefy snapshots -1 (2→1); SS#2 snapshots -0 (1→1, still resolves and
 * is trashed). Discipline +2 → 6+2-4-1-0 = 3 — not 1. Discipline first: 8 → SS#1 snap -4 (4) → Stupefy
 * snap -1 (3) → SS#2 snap -2 (1): same four cards, final 1. Everything is "this turn": she is 6 next turn.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const STUPEFY = "ogn-095-298";
const DISCIPLINE = "ogn-058-298";
const LEONA_ZEALOT = "ogn-079-298";
const CLEAVE = "ogn-004-298"; // [Action] 1 energy "Give a unit [Assault 3] this turn." — an unrelated chain opener for P1

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } }) // 2+[mind], 1, 2+[mind], 1 (Cleave)
    .resources(P2, { energy: 2, power: { calm: 1 } }) // Discipline
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", LEONA_ZEALOT, "leona")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, SMOKE_SCREEN, "ss1")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P1, SMOKE_SCREEN, "ss2")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, DISCIPLINE, "discipline");
}

/** P1 plays a debuff on Leona and everyone passes: it resolves alone. */
async function resolve(game: Game, spell: string): Promise<void> {
  await game.p1.cast(spell, { targets: "leona" });
  await game.settle();
  expect(game.zoneOf(spell)).toBe("trash");
  expect(game.chain()).toHaveLength(0);
}

/** "Discipline last": P1 opens a chain with the unrelated Cleave (on Scout); P2 responds with Discipline on Leona; all resolves. */
async function disciplineInResponseToCleave(game: Game): Promise<void> {
  await game.p1.cast("cleave", { targets: "scout" });
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  expect(game.p2.can("cast", "discipline")).toBe(true);
  await game.p2.cast("discipline", { targets: "leona" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "discipline"]);
  await game.settle();
  expect(game.zoneOf("discipline")).toBe("trash");
  expect(game.chain()).toHaveLength(0);
}

/** "Discipline first": P1 plays Smoke Screen #1; P2 responds with Discipline, which resolves BEFORE it (LIFO). */
async function disciplineInResponseToSs1(game: Game): Promise<void> {
  await game.p1.cast("ss1", { targets: "leona" });
  await game.p1.passPriority();
  await game.p2.cast("discipline", { targets: "leona" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ss1", "discipline"]);
  // one round of passes resolves only the top item — Discipline — so we can observe the 8
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("discipline")).toBe("trash");
  expect(game.chain().map((c) => c.cardId)).toEqual(["ss1"]);
}

const might = (game: Game) => game.state("leona").might;

describe("Smoke Screen, Stupefy, Smoke Screen, then Discipline — per-effect snapshotted floors (477.3.b)", () => {
  test("setup: Leona, Zealot is a plain 6-Might body in P2's base, not stunned; P2 cannot fire Discipline into P1's open main phase (813.1.c.1)", async () => {
    const game = await board().build();
    expect(game.state("leona")).toMatchObject({ baseMight: 6, isStunned: false, location: "base", might: 6 });
    expect(game.p2.can("cast", "discipline")).toBe(false);
  });

  test("Smoke Screen #1 on 6: the full -4 applies (snapshot -4) → 2", async () => {
    const game = await board().build();
    await resolve(game, "ss1");
    expect(might(game)).toBe(2);
  });

  test("then Stupefy on 2: -1 (snapshot -1) → 1, and P1 draws 1", async () => {
    const game = await board().build();
    await resolve(game, "ss1");
    const hand = game.p1.hand().length;
    await resolve(game, "stupefy");
    expect(might(game)).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
  });

  test("then Smoke Screen #2 on 1: cannot go below 1 → snapshots -0; it still resolves (paid, trashed) and she stays 1", async () => {
    const game = await board().build();
    await resolve(game, "ss1");
    await resolve(game, "stupefy");
    await resolve(game, "ss2");
    expect(might(game)).toBe(1);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 0 } });
    expect(game.p1.trash().sort()).toEqual(["ss1", "ss2", "stupefy"].sort());
  });

  test("then Discipline +2: increases first, then the REMEMBERED decreases (-4, -1, -0) → 6 + 2 - 5 = 3 — not re-clamped to 1 (477.3.e, 477.3.b)", async () => {
    const game = await board().build();
    await resolve(game, "ss1");
    await resolve(game, "stupefy");
    await resolve(game, "ss2");
    expect(might(game)).toBe(1);
    const p2hand = game.p2.hand().length;
    await disciplineInResponseToCleave(game);
    expect(might(game)).toBe(3);
    expect(game.p2.hand()).toHaveLength(p2hand - 1 + 1); // Discipline: draw 1
    expect(game.state("scout").might).toBe(2); // Cleave touched only the Scout (Assault, no Might at rest)
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Discipline FIRST: 8 → SS#1 snap -4 (4) → Stupefy snap -1 (3) → SS#2 snap -2 (1): same four cards, final 1", async () => {
    const game = await board().build();
    await disciplineInResponseToSs1(game);
    expect(might(game)).toBe(8);
    await game.settle(); // now SS#1 resolves onto an 8-Might Leona
    expect(game.zoneOf("ss1")).toBe("trash");
    expect(might(game)).toBe(4);
    await resolve(game, "stupefy");
    expect(might(game)).toBe(3);
    await resolve(game, "ss2");
    expect(might(game)).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("in both orderings no effect pushes her below 1 as it applies, she is never stunned, takes no damage and stays on the board", async () => {
    const a = await board().build();
    for (const spell of ["ss1", "stupefy", "ss2"]) {
      await resolve(a, spell);
      expect(might(a)).toBeGreaterThanOrEqual(1);
    }
    await disciplineInResponseToCleave(a);
    expect(a.state("leona")).toMatchObject({ damage: 0, isStunned: false, might: 3, zone: "base" });

    const b = await board().build();
    await disciplineInResponseToSs1(b);
    await b.settle();
    for (const spell of ["stupefy", "ss2"]) {
      await resolve(b, spell);
      expect(might(b)).toBeGreaterThanOrEqual(1);
    }
    expect(b.state("leona")).toMatchObject({ damage: 0, isStunned: false, might: 1, zone: "base" });
  });

  test("all four are 'this turn': after the turn ends she is her printed 6 again in either ordering", async () => {
    const a = await board().build();
    await resolve(a, "ss1");
    await resolve(a, "stupefy");
    await resolve(a, "ss2");
    await disciplineInResponseToCleave(a);
    expect(might(a)).toBe(3);
    await a.advanceTurn();
    expect(might(a)).toBe(6);

    const b = await board().build();
    await disciplineInResponseToSs1(b);
    await b.settle();
    await resolve(b, "stupefy");
    await resolve(b, "ss2");
    expect(might(b)).toBe(1);
    await b.advanceTurn();
    expect(might(b)).toBe(6);
  });
});
