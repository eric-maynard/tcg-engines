/**
 * Interaction: conceding in the middle of the Combat Damage Step.
 *   × Tasty Faefolk (ogn-075-298) · Unit · Calm · 7 · 6 Might · "[Accelerate] … [Deathknell] — Channel 2 runes exhausted
 *     and draw 1."                                                                          — P1's attacker
 *   × Sunlit Guardian (ogn-054-298) · Unit · Calm · 3 · 3 Might · "[Shield] (+1 [Might] while I'm a defender.) [Tank] (I
 *     must be assigned combat damage first.)"                                              — P2's defender (reads 4)
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might · "[Deathknell] — Draw 1."   — P2's defender
 *
 * Rules: 650 (a player may concede at any time), 651.1 (one player left → that player wins), 195 / 196 (only player
 * remaining wins; the game ends), 465 (Combat Damage Step: damage is ASSIGNED, then dealt simultaneously — 465.2.c.1:
 * assigning is not dealing), 465.2.c.3 / .c.4 / .c.6 (Tank first and exactly lethal, the rest to the last unit), 466.3
 * (the Resolution Step determines the winner / conquer — never reached here), 471.1.b.1 (Final Point via conquer only
 * if every battlefield was scored this turn), 358.5 (a rejected action is rolled back — state untouched).
 *
 * Question: P1 has 7 points and already HELD bf1 this turn. P1 attacks P2's bf2 with Tasty Faefolk (6); P2 defends with
 * Sunlit Guardian (Tank, Shield → 4) and Watchful Sentry (1). Both pass in the combat showdown; the Combat Damage Step
 * is outstanding (Faefolk's 6: Tank must soak lethal 4 first, Sentry the remaining 2). (a) At that instant P2
 * concedes. (b) Variant: P1 concedes instead. Had combat finished, P1 kills both, conquers and — every battlefield
 * scored — takes the Final Point to win 8-3. What actually happens: winner, points, damage, deaths, Sentry's draw,
 * control of bf2?
 *
 * Expected: (a) legal (650); P1 wins by CONCESSION (651.1 / 195), not by points: P1 stays at 7, no damage is marked on
 * anyone (never dealt), nobody dies, Sentry's Deathknell never triggers (P2 draws 0), bf2 control unchanged (P2's), no
 * open Decision; a follow-up attempt to run the damage step is rejected and leaves the state byte-identical. (b) P2 wins
 * immediately with its 3 points; same terminal assertions; P1 stays at 7.
 *
 * Engine note: with exactly Guardian + Sentry defending, 465.2.c.3/.c.4/.c.6 leave ONE legal assignment {Guardian 4,
 * Sentry 2}, so the engine (correctly) asks nothing — `board()` therefore parks the game at the outstanding Combat
 * Damage Step with `.autoProcedures(false)` (the step is on offer as `resolveFullCombat:bf2`, nothing dealt). The
 * `backstop` variant adds an inline 2-Might vanilla defender so P1's assignment is a genuine `distribute` Decision
 * ({4,1,1} vs {4,0,2}) and the concession lands while that literal prompt is pending. The harness lists menu options
 * only for the deciding seat, so an off-seat concession goes through the raw `do("concede")` (the engine itself
 * enumerates concede as legal for every seat — 650).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TASTY_FAEFOLK = "ogn-075-298";
const SUNLIT_GUARDIAN = "ogn-054-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const FILLER = "ogn-175-298";

/**
 * Built on P2's turn 2 so that advancing once makes it P1's turn 3 with bf1 HELD (6 → 7 points, scoredThisTurn = [bf1]).
 * bf1: P1's 2-Might Holder. bf2: P2's Sunlit Guardian + Watchful Sentry (+ optional 2-Might Backstop). P1 base: Tasty
 * Faefolk (readied by Awaken). P2: 3 points, known deck p2d1.. so a Sentry draw would be visible. Victory score 8.
 */
function board(opts: { backstop?: boolean } = {}) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .points(P1, 6)
    .points(P2, 3)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "holder")
    .unit(P1, "base", TASTY_FAEFOLK, "fae")
    .unit(P2, "bf2", SUNLIT_GUARDIAN, "guardian")
    .unit(P2, "bf2", WATCHFUL_SENTRY, "sentry")
    .deck(P2, [FILLER, FILLER, FILLER], ["p2d1", "p2d2", "p2d3"]);
  if (opts.backstop) {
    b.unit(P2, "bf2", { might: 2, name: "Backstop" }, "backstop");
  } else {
    b.autoProcedures(false);
  }
  return b;
}

/** P1's turn 3 (bf1 held → 7 points); Faefolk attacks bf2; both pass Focus → the Combat Damage Step is outstanding, nothing dealt. */
async function atDamageStep(opts: { backstop?: boolean } = {}): Promise<{ game: Game; p2Hand: string[] }> {
  const game = await board(opts).build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.p1.points()).toBe(7);
  expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bf1"]);
  const p2Hand = game.p2.hand();
  await game.p1.move("fae", "bf2");
  expect(game.state("fae").combatRole).toBe("attacker");
  expect(game.state("guardian")).toMatchObject({ combatRole: "defender", might: 4 }); // Shield live
  await game.p1.passFocus();
  await game.p2.passFocus();
  return { game, p2Hand };
}

/** Everything that must be true of a game frozen mid-damage-step by a concession. */
function expectFrozenBoard(game: Game, p2Hand: readonly string[], defenders: readonly string[]): void {
  expect(game.isOver()).toBe(true);
  expect(game.decision()).toBeNull();
  expect(game.chain()).toEqual([]);
  expect(game.p1.points()).toBe(7);
  expect(game.p2.points()).toBe(3);
  for (const id of ["fae", ...defenders]) {
    expect(game.zoneOf(id)).toBe("battlefield-bf2");
    expect(game.state(id).damage).toBe(0);
  }
  expect(game.p1.trash()).toEqual([]);
  expect(game.p2.trash()).toEqual([]);
  expect(game.p2.hand()).toEqual([...p2Hand]); // Sentry's Deathknell never drew
  expect(game.p2.deck().slice(0, 3)).toEqual(["p2d1", "p2d2", "p2d3"]);
  expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  expect(game.gameState.conqueredThisTurn?.[P1] ?? []).toEqual([]);
  expect(game.violations()).toEqual([]);
}

describe("Concession during the Combat Damage Step — Tasty Faefolk into Sunlit Guardian (Tank) + Watchful Sentry", () => {
  // ── premise / control ────────────────────────────────────────────────────────────────────────────

  test("premise: after both pass Focus the showdown is closed and the Combat Damage Step is OUTSTANDING — nothing dealt, nobody dead, chain empty, P1 still 7, both seats may concede (650)", async () => {
    const { game, p2Hand } = await atDamageStep();
    expect(game.isOver()).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: P2, showdownComplete: true });
    expect(game.p1.can("resolveCombat")).toBe(true);
    expect(game.p1.can("concede")).toBe(true);
    expect(game.p2.can("concede")).toBe(true);
    for (const id of ["fae", "guardian", "sentry"]) {
      expect(game.state(id).damage).toBe(0);
      expect(game.zoneOf(id)).toBe("battlefield-bf2");
    }
    expect(game.p1.points()).toBe(7);
    expect(game.p2.hand()).toEqual(p2Hand);
  });

  test("control: if the combat is played out instead, the forced assignment (Guardian 4, Sentry 2 — 465.2.c.3/.c.4/.c.6) kills both defenders, Faefolk survives, Sentry's Deathknell draws P2 one, P1 conquers bf2 and takes the FINAL point (471.1.b.1): 8-3, P1 wins by points", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 6)
      .points(P2, 3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "holder")
      .unit(P1, "base", TASTY_FAEFOLK, "fae")
      .unit(P2, "bf2", SUNLIT_GUARDIAN, "guardian")
      .unit(P2, "bf2", WATCHFUL_SENTRY, "sentry")
      .deck(P2, [FILLER, FILLER, FILLER], ["p2d1", "p2d2", "p2d3"])
      .build(); // auto procedures ON
    await game.advanceTurn();
    const p2Hand = game.p2.hand();
    await game.p1.move("fae", "bf2");
    await game.p1.passFocus();
    await game.p2.passFocus(); // no distribute prompt: the assignment is forced
    expect(game.decision()?.kind).not.toBe("distribute");
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    const settled = await game.settle();
    expect(settled.reason).toBe("game-over");
    expect(game.zoneOf("fae")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p2.hand()).toEqual([...p2Hand, "p2d1"]);
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
    expect(game.gameState.removedPlayers ?? []).toEqual([]); // nobody conceded
  });

  // ── (a) P2 concedes ──────────────────────────────────────────────────────────────────────────────

  test("(a) P2 concedes mid-damage-step: the game ends at once with P1 the winner BY CONCESSION (651.1 / 195 / 196) — P1's score stays 7, not 8", async () => {
    const { game } = await atDamageStep();
    await game.p2.concede();
    expect(game.isOver()).toBe(true);
    expect(game.gameState.status).toBe("finished");
    expect(game.winner()).toBe(P1);
    expect(game.gameState.removedPlayers).toEqual([P2]);
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(3);
  });

  test("(a) nothing of the combat is processed: no damage marked on Faefolk / Guardian / Sentry (465 never completed), no deaths, Sentry's Deathknell never triggers (P2 draws 0), bf2 still P2's, no conquer, no open Decision", async () => {
    const { game, p2Hand } = await atDamageStep();
    await game.p2.concede();
    expectFrozenBoard(game, p2Hand, ["guardian", "sentry"]);
    // Designations may stay frozen in the snapshot — no Combat Cleanup ran.
    expect(game.state("fae").combatRole).toBe("attacker");
  });

  test("(a) a follow-up attempt to run the damage step (or any move) is rejected as GAME_OVER and leaves the state byte-identical (358.5-style rollback)", async () => {
    const { game } = await atDamageStep();
    await game.p2.concede();
    const hash = game.stateHash();
    const r1 = await game.p1.try((p) => p.choose("resolveFullCombat:bf2"));
    expect(r1.ok).toBe(false);
    expect(game.stateHash()).toBe(hash);
    const r2 = await game.p1.try((p) => p.do("resolveFullCombat", { battlefieldId: "bf2" }));
    expect(r2).toMatchObject({ ok: false });
    expect((r2 as { error?: { code?: string } }).error?.code).toBe("GAME_OVER");
    const r3 = await game.p2.try((p) => p.do("concede", {}));
    expect(r3.ok).toBe(false);
    const r4 = await game.p1.try((p) => p.endTurn());
    expect(r4.ok).toBe(false);
    expect(game.stateHash()).toBe(hash);
    expect(game.winner()).toBe(P1);
  });

  // ── (b) P1 concedes ──────────────────────────────────────────────────────────────────────────────

  test("(b) P1 concedes during its own damage step: P2 wins immediately with whatever it had (3 points — 651.1 does not consult score); P1 stays at 7", async () => {
    const { game } = await atDamageStep();
    await game.p1.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.gameState.removedPlayers).toEqual([P1]);
    expect(game.p2.points()).toBe(3);
    expect(game.p1.points()).toBe(7);
  });

  test("(b) same terminal board: no damage, no deaths, no draw, no conquer, no Decision; a late damage-step attempt is rejected with the state untouched", async () => {
    const { game, p2Hand } = await atDamageStep();
    await game.p1.concede();
    expectFrozenBoard(game, p2Hand, ["guardian", "sentry"]);
    const hash = game.stateHash();
    const r = await game.p1.try((p) => p.do("resolveFullCombat", { battlefieldId: "bf2" }));
    expect(r.ok).toBe(false);
    expect(game.stateHash()).toBe(hash);
  });

  // ── (a′/b′) the same, while a literal `distribute` Decision is pending for P1 ───────────────────

  test("(a′) backstop variant: the engine IS asking P1 to 'Assign 6 combat damage' (Guardian lethal at 4 listed first — Tank); P2 concedes right then (650: any time) → the Decision is withdrawn, P1 wins by concession at 7 points, nothing dealt, Sentry never draws", async () => {
    const { game, p2Hand } = await atDamageStep({ backstop: true });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 6 });
    expect(d?.kind === "distribute" ? d.buckets.map((b) => [b.key, b.lethal]) : []).toEqual([
      ["guardian", 4],
      ["sentry", 1],
      ["backstop", 2],
    ]);
    // The harness menu belongs to the deciding seat; the engine still accepts P2's concession.
    expect(game.engine.enumerateMoves(P2 as never, { moveIds: ["concede"], validOnly: true })).toHaveLength(1);
    await game.p2.do("concede", {});
    expect(game.winner()).toBe(P1);
    expect(game.gameState.removedPlayers).toEqual([P2]);
    expectFrozenBoard(game, p2Hand, ["guardian", "sentry", "backstop"]);
  });

  test("(a′) …and submitting the damage assignment afterwards is rejected (GAME_OVER) with the state byte-identical", async () => {
    const { game } = await atDamageStep({ backstop: true });
    await game.p2.do("concede", {});
    const hash = game.stateHash();
    const r = await game.act(P1, { allocation: { backstop: 1, guardian: 4, sentry: 1 }, kind: "distribute" });
    expect(r.ok).toBe(false);
    expect((r as { error?: { code?: string } }).error?.code).toBe("GAME_OVER");
    expect(game.stateHash()).toBe(hash);
    expect(game.state("guardian").damage).toBe(0);
  });

  test("(b′) backstop variant: P1 concedes while its own assignment prompt is open → P2 wins with 3 points; the prompt is gone, no damage / deaths / draw / conquer; the assignment can no longer be submitted", async () => {
    const { game, p2Hand } = await atDamageStep({ backstop: true });
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
    await game.p1.do("concede", {});
    expect(game.winner()).toBe(P2);
    expect(game.gameState.removedPlayers).toEqual([P1]);
    expectFrozenBoard(game, p2Hand, ["guardian", "sentry", "backstop"]);
    const hash = game.stateHash();
    const r = await game.p1.try((p) => p.distribute({ backstop: 1, guardian: 4, sentry: 1 }));
    expect(r.ok).toBe(false);
    expect(game.stateHash()).toBe(hash);
  });
});
