/**
 * Interaction: Cull the Weak (ogn-209-298) · Action spell · Order · 2+[order] — "Each player kills one of their units."
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might — "[Deathknell] — Draw 1."
 *   × Kog'Maw, Caustic (ogn-190-298) · Champion Unit · Chaos · 3 · 1 Might — "[Deathknell] — Deal 4 to all units
 *     at my battlefield."
 *   × Conceding (650–652) in the middle of a spell's resolution, while the engine waits on the OTHER seat.
 *
 * Rules: 650 (a player may concede AT ANY TIME), 651 / 651.1 (the conceder is removed; with one player left that
 * player Wins), 195 / 196 (last player remaining wins; when a player wins the game ENDS), 652 / 652.4 (removal
 * steps — incl. countering the conceder's spells — apply only "if the game continues"), 355.10.e (Cull the Weak
 * does not target: each player chooses one of THEIR units as it resolves), 303.1 / 303.2.a (game actions are
 * performed one at a time; simultaneous ones are sequenced in turn order from the Turn Player), 411 (Cull the
 * Weak example: "each player chooses a unit they control and kills that unit — they are responsible for the
 * death of their own unit"), 428.1.a.1.b / 808.1.d.2 (a Deathknell is pended as its unit is killed and only
 * does something when it later RESOLVES), 383.3.d.1 (cross-controller triggers go on the chain in turn order).
 *
 * Question: P1 (turn player) has Watchful Sentry + Kog'Maw in base; P2 has Watchful Sentry + Kog'Maw at bf1 (P2's).
 * P1 resolves Cull the Weak; P1 (first in turn order) picks its Sentry; the engine now asks P2 which of ITS two
 * units to kill — a Decision pending for the non-active, non-caster seat mid-resolution.
 *   (a) P1 concedes while P2's pick is pending.   (b) P2 concedes instead of answering.
 *   In each: winner? is P1's chosen Sentry killed? any P2 unit killed? do any Deathknells trigger/resolve? where
 *   is Cull the Weak?   (c) NO-side: P2 simply answers (its Sentry).
 *
 * Expected: (a) conceding is legal for P1 even though the engine is waiting on P2 (650); P2 wins at once (651.1,
 * 196); Cull the Weak's resolution is abandoned: P2 kills nothing, no Deathknell ever RESOLVES (nobody draws,
 * no 4 damage), no Cleanup runs, Cull the Weak stays an unresolved chain item in the frozen end state (never
 * "resolved" into a trash; 652.4 is moot because the game did not continue); P2's pending Decision is withdrawn
 * and exactly one winner is reported. (b) P1 wins immediately; same board assertions. (c) both Sentries die,
 * both Deathknells go on the chain (P1's first/bottom, P2's on top, 383.3.d.1), each player draws 1, Cull → P1's
 * trash, game continues in P1's main phase — the only difference is the concession.
 *
 * Note on P1's Sentry: the pairing brief reads "each player kills one" as ONE simultaneous kill performed after
 * everybody has chosen (so a concession mid-pick would leave P1's designated Sentry alive). The CR text points
 * the other way — 303.1/303.2.a sequence the two players' Kill actions in turn order and the 411 example makes
 * each player perform (and be responsible for) their own kill — so P1's kill has already been EXECUTED by the
 * time P2 is asked. The engine follows that reading; this file asserts it (Sentry already in P1's trash, its
 * Deathknell pended but never resolved → P1 drew nothing) and flags the divergence here rather than as a BUG.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const KOGMAW_CAUSTIC = "ogn-190-298";

/** P1's turn with exactly Cull's 2 + [order]. P1: Sentry + Kog'Maw in base. P2: Sentry + Kog'Maw holding bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", WATCHFUL_SENTRY, "p1Sentry")
    .unit(P1, "base", KOGMAW_CAUSTIC, "p1Kog")
    .unit(P2, "bf1", WATCHFUL_SENTRY, "p2Sentry")
    .unit(P2, "bf1", KOGMAW_CAUSTIC, "p2Kog")
    .hand(P1, CULL_THE_WEAK, "cull");
}

interface Snap {
  readonly game: Game;
  readonly p1Hand: number;
  readonly p2Hand: number;
  readonly p1Deck: number;
  readonly p2Deck: number;
}

/**
 * P1 casts Cull the Weak (no play-time pick — 355.10.e), nobody responds, it starts resolving: P1 (turn order
 * first) picks its Sentry. Returns with P2's "which of your units" pick PENDING, plus hand/deck baselines taken
 * before the cast.
 */
async function p2PickPending(): Promise<Snap> {
  const game = await board().build();
  const snap = { p1Deck: game.p1.deck().length, p1Hand: game.p1.hand().length - 1, p2Deck: game.p2.deck().length, p2Hand: game.p2.hand().length };
  await game.p1.cast("cull", { targets: [] });
  const r = await game.settle(); // both pass → resolution begins → P1 is asked first
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "cull" } });
  await game.p1.pick("p1Sentry");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "cull" } });
  return { game, ...snap };
}

/** The frozen end state both concession variants must share. */
function expectAbandonedResolution(s: Snap): void {
  const { game } = s;
  // P2 killed nothing: both of its units are exactly where they were, undamaged.
  expect(game.zoneOf("p2Sentry")).toBe("battlefield-bf1");
  expect(game.zoneOf("p2Kog")).toBe("battlefield-bf1");
  expect(game.state("p2Sentry").damage).toBe(0);
  expect(game.state("p2Kog").damage).toBe(0);
  expect(game.zoneOf("p1Kog")).toBe("base");
  expect(game.state("p1Kog").damage).toBe(0);
  // No Deathknell RESOLVED: nobody drew (Sentry) and nothing took 4 (Kog'Maw).
  expect(game.p1.hand()).toHaveLength(s.p1Hand);
  expect(game.p2.hand()).toHaveLength(s.p2Hand);
  expect(game.p1.deck()).toHaveLength(s.p1Deck);
  expect(game.p2.deck()).toHaveLength(s.p2Deck);
  // Cull the Weak never finished resolving: it is still a chain-zone card, in nobody's trash.
  expect(game.zoneOf("cull")).toBe("chain");
  expect(game.p1.trash()).not.toContain("cull");
  expect(game.p2.trash()).not.toContain("cull");
  // The pending pick is withdrawn for every viewer.
  expect(game.decision()).toBeNull();
  expect(game.view(P1).decision).toBeNull();
  expect(game.view(P2).decision).toBeNull();
  expect(game.violations()).toEqual([]);
}

describe("Cull the Weak — the position: P2's pick pending mid-resolution", () => {
  test("Cull the Weak resolves with per-player picks in TURN ORDER: P1 is asked first among exactly its own two units, then P2 among exactly its own two (355.10.e, 303.2.a)", async () => {
    const game = await board().build();
    await game.p1.cast("cull", { targets: [] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    const d1 = game.decision();
    expect(d1).toMatchObject({ allowDecline: false, kind: "pick", seat: P1, timing: "RES" });
    expect(d1?.kind === "pick" ? d1.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["p1Kog", "p1Sentry"]);
    await game.p1.pick("p1Sentry");
    const d2 = game.decision();
    expect(d2).toMatchObject({ allowDecline: false, kind: "pick", seat: P2, timing: "RES" });
    expect(d2?.kind === "pick" ? d2.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["p2Kog", "p2Sentry"]);
    expect(game.actingSeat()).toBe(P2);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.isOver()).toBe(false);
  });

  test("while P2 decides: P1's own Kill was already executed in turn order (303.1/303.2.a, 411) — its Sentry is in P1's trash and its Deathknell is PENDED on the chain but has not resolved (P1 has drawn nothing); P2's units untouched; Cull still resolving", async () => {
    const s = await p2PickPending();
    const { game } = s;
    expect(game.zoneOf("p1Sentry")).toBe("trash");
    expect(game.p1.trash()).toEqual(["p1Sentry"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "p1Sentry", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(s.p1Hand);
    expect(game.p1.deck()).toHaveLength(s.p1Deck);
    expect(game.zoneOf("p2Sentry")).toBe("battlefield-bf1");
    expect(game.zoneOf("p2Kog")).toBe("battlefield-bf1");
    expect(game.zoneOf("cull")).toBe("chain");
  });
});

describe("(a) P1 concedes while P2's Cull the Weak pick is pending", () => {
  // rule 650: "A player may concede at any time" — `concede` stays on P1's legal menu even though the only open
  // Decision belongs to P2, and `p1.concede()` goes through.
  test("(a) concede is a legal action for P1 while the engine waits on P2's pick (650)", async () => {
    const { game } = await p2PickPending();
    expect(game.p1.can("concede")).toBe(true);
    await game.p1.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });

  test("(a) the raw concede move IS accepted from P1 mid-pick: the game is over immediately and P2 — the only player remaining — is the one winner (651.1, 195, 196)", async () => {
    const { game } = await p2PickPending();
    await game.p1.do("concede");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.view(P1).winner).toBe(P2);
    expect(game.view(P2).winner).toBe(P2);
    expect(game.gameState.status).not.toBe("active");
  });

  test("(a) Cull the Weak's resolution is abandoned: P2 kills nothing, no Deathknell resolves (no draw, no 4 damage), Cull stays an unresolved chain card, and P2's pending Decision is withdrawn", async () => {
    const s = await p2PickPending();
    await s.game.p1.do("concede");
    expectAbandonedResolution(s);
  });

  test("(a) P1's already-executed kill stands in the frozen state — Sentry in P1's trash — but its pended Deathknell never resolved: P1's hand and deck are exactly as before", async () => {
    const s = await p2PickPending();
    await s.game.p1.do("concede");
    expect(s.game.zoneOf("p1Sentry")).toBe("trash");
    expect(s.game.p1.hand()).toHaveLength(s.p1Hand);
    expect(s.game.p1.deck()).toHaveLength(s.p1Deck);
  });

  // rule 651.3 / 196: once the game has ended nobody "must decide" anything — the withdrawn pick is gone from
  // the state itself (not merely hidden by the harness), so no acting seat is reported.
  test("(a) the abandoned pick is cleared from the end state — no acting seat is reported after the concession (651.3, 196)", async () => {
    const { game } = await p2PickPending();
    await game.p1.do("concede");
    expect(game.isOver()).toBe(true);
    expect(game.gameState.pendingChoice ?? undefined).toBeUndefined();
    expect(game.actingSeat()).toBeUndefined();
  });

  test("(a) after game over nothing more can be done: P2's former pick and any further P1 action are rejected", async () => {
    const { game } = await p2PickPending();
    await game.p1.do("concede");
    expect((await game.p2.try((p) => p.pick("p2Sentry"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.endTurn())).ok).toBe(false);
    expect(game.p1.legal()).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
    expect(game.winner()).toBe(P2); // unchanged
  });
});

describe("(b) P2 concedes instead of answering its Cull the Weak pick", () => {
  // rule 650: P2 — the seat being asked — may concede instead of picking, so `concede` is offered alongside
  // answering the pick.
  test("(b) concede is a legal action for P2 while its own resolution-time pick is pending (650)", async () => {
    const { game } = await p2PickPending();
    expect(game.p2.can("concede")).toBe(true);
    await game.p2.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("(b) the raw concede move from P2: game over immediately, P1 is the one winner", async () => {
    const { game } = await p2PickPending();
    await game.p2.do("concede");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.view(P1).winner).toBe(P1);
    expect(game.view(P2).winner).toBe(P1);
  });

  test("(b) identical frozen board: P2's Sentry and Kog'Maw untouched at bf1, zero draws, zero damage, Cull the Weak unresolved on the chain, no Decision left for anyone", async () => {
    const s = await p2PickPending();
    await s.game.p2.do("concede");
    expectAbandonedResolution(s);
    expect(s.game.zoneOf("p1Sentry")).toBe("trash"); // P1's sequenced kill had already happened; its Deathknell never resolved
  });
});

describe("(c) NO-side contrast: P2 answers — the only difference is the concession", () => {
  test("(c) P2 picks its Sentry: both Sentries are dead, both Deathknells are on the chain — P1's (turn player) first/bottom, P2's on top (383.3.d.1) — and the game is NOT over", async () => {
    const { game } = await p2PickPending();
    await game.p2.pick("p2Sentry");
    expect(game.isOver()).toBe(false);
    expect(game.zoneOf("p1Sentry")).toBe("trash");
    expect(game.zoneOf("p2Sentry")).toBe("trash");
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered])).toEqual([
      ["p1Sentry", P1, true],
      ["p2Sentry", P2, true],
    ]);
  });

  test("(c) everything resolves: each player drew exactly 1 off their Sentry, both Kog'Maws survive undamaged, Cull the Weak → P1's trash, play continues in P1's main phase with P2 still holding bf1", async () => {
    const s = await p2PickPending();
    const { game } = s;
    await game.p2.pick("p2Sentry");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.p1.hand()).toHaveLength(s.p1Hand + 1);
    expect(game.p2.hand()).toHaveLength(s.p2Hand + 1);
    expect(game.p1.deck()).toHaveLength(s.p1Deck - 1);
    expect(game.p2.deck()).toHaveLength(s.p2Deck - 1);
    expect(game.zoneOf("p1Kog")).toBe("base");
    expect(game.zoneOf("p2Kog")).toBe("battlefield-bf1");
    expect(game.state("p2Kog").damage).toBe(0);
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["cull", "p1Sentry"]);
    expect(game.p2.trash()).toEqual(["p2Sentry"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("concede")).toBe(true); // and NOW concede is on the ordinary menu again
    expect(game.violations()).toEqual([]);
  });
});
