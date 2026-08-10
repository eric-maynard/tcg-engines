/**
 * Interaction: Ride the Wind (ogn-173-298) · Spell · Chaos · 2 + [chaos]
 *     "[Action] (Play on your turn or in showdowns.) Move a friendly unit and ready it."   — two copies
 *   × Kai'Sa, Survivor (ogn-039-298) · Champion Unit · Fury · 4 · 4 Might
 *     "[Accelerate] … When I conquer, draw 1."
 *
 * Board: 1v1, Victory Score 8. P1's turn, Neutral Open; battlefields A and B empty / uncontrolled. P1 has
 * a vanilla 2-Might V in base. P2 has in base a vanilla 3-Might W and Kai'Sa (4), two Ride the Wind in
 * hand and the runes for both (4 energy, 2 chaos).
 * Line: P1 Standard-Moves V → A (Non-Combat Showdown at A, P1 Focus); P1 passes; P2 (Focus) plays Ride
 * the Wind #1 moving W base → B; everyone passes until A closes; the staged showdown at B opens with P2
 * (contester) holding Focus, P2 plays Ride the Wind #2 moving Kai'Sa base → A (now P1's); B closes; the
 * staged Combat at A opens: Kai'Sa (attacker 4) vs V (2).
 *
 * Questions: (i) P2 starts on 6 — point deltas at B and at A; does P2 WIN on P1's turn? (ii) P2 starts
 * on 7 — delta at B (point or draw?), is B still "scored this turn", does the later Conquer of A award
 * the Final Point and the win, and does Kai'Sa's draw resolve before the game ends? (iii) P2 on 7 with
 * only ONE Ride the Wind (W → B only): delta at B, and what happens in P2's next Scoring Step?
 *
 * Rules: 190.3.a.1 (arrival at an uncontrolled / enemy battlefield applies Contested), 345 (contester
 * gains Focus), 347.1 / 347.1.b (the Focus holder may play an [Action] spell on the opponent's turn;
 * when its chain closes Focus passes), 460 / 323.12 (nothing opens at B while A's showdown is live; the
 * next Neutral-Open Cleanup begins it), 323.9 (Kai'Sa arriving at P1's A stages a Combat there),
 * 348.2.a.1 / 466.5.d / 466.5.e / 469.1 (establishing control = Conquer if THAT PLAYER has not scored
 * the battlefield this turn — whose turn it is is irrelevant), 464.2.c (Attacker = the player who
 * applied Contested → P2 at A), 466.3.a (sole survivor wins the combat), 470 (score once per battlefield
 * per turn), 471.1.b / 471.1.b.1 (at Victory−1 a Conquer point is the Final Point only if the player has
 * scored EVERY battlefield this turn, else draw 1 instead — the battlefield still counts as Scored),
 * 471.1.a.1 (Hold points are not subject to that restriction), 471.2.a (conquer triggers), 472 (at a
 * Cleanup, ≥ Victory Score and more than any opponent → win).
 *
 * Expected score events (seat, bf, method, delta):
 *   common: (P1, A, conquer, +1) when A's non-combat showdown closes.
 *   (i)  6: (P2, B, conquer, +1) → 7; (P2, A, conquer, +1) = Final Point (B and A both scored) → 8 →
 *        P2 WINS during P1's turn; Kai'Sa's "draw 1" is still on the chain, unresolved.
 *   (ii) 7: (P2, B, conquer, +0) + draw 1 (only B scored, A is P1's); B IS scored this turn; then
 *        (P2, A, conquer, +1) = Final Point → 8 → P2 wins on P1's turn exactly as in (i).
 *   (iii) 7, one RtW: (P2, B, conquer, +0) + draw 1; P2 stays 7, P1's turn continues. P2's next
 *        Beginning Phase: (P2, B, hold, +1) → 8 → P2 wins in its own Scoring Step.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const KAISA = "ogn-039-298";

function board(p2Points: number, opts: { twoRtw?: boolean } = {}) {
  const s = scenario()
    .victoryScore(8)
    .points(P2, p2Points)
    .resources(P2, { energy: 4, power: { chaos: 2 } }) // 2 × (2 + [chaos])
    .battlefield("bfA", { controller: null })
    .battlefield("bfB", { controller: null })
    .unit(P1, "base", { might: 2, name: "Vanilla V" }, "V")
    .unit(P2, "base", { might: 3, name: "Vanilla W" }, "W")
    .unit(P2, "base", KAISA, "kaisa")
    .hand(P2, RIDE_THE_WIND, "rtw1");
  return opts.twoRtw === false ? s : s.hand(P2, RIDE_THE_WIND, "rtw2");
}

// ---- score-event recorder ---------------------------------------------------------------------------

interface Snap {
  readonly turn: number;
  readonly points: Record<Seat, number>;
  readonly hand: Record<Seat, number>;
  readonly scored: Record<Seat, readonly string[]>;
  readonly ledger: Record<Seat, Record<string, number>>;
}
interface ScoreEvent {
  readonly seat: Seat;
  readonly bf: string;
  readonly method: "conquer" | "hold";
  readonly delta: number;
  /** cards drawn INSTEAD of the point (471.1.b.1) — hand-size delta net of `spent`. */
  readonly drewInstead: number;
}

function snap(game: Game): Snap {
  const gs = game.gameState as unknown as {
    scoredThisTurn?: Record<string, string[]>;
    pointsGainedThisTurn?: Record<string, Record<string, number>>;
  };
  return {
    hand: { [P1]: game.p1.hand().length, [P2]: game.p2.hand().length },
    ledger: { [P1]: { ...(gs.pointsGainedThisTurn?.[P1] ?? {}) }, [P2]: { ...(gs.pointsGainedThisTurn?.[P2] ?? {}) } },
    points: { [P1]: game.p1.points(), [P2]: game.p2.points() },
    scored: { [P1]: [...(gs.scoredThisTurn?.[P1] ?? [])], [P2]: [...(gs.scoredThisTurn?.[P2] ?? [])] },
    turn: game.turnNumber(),
  };
}

/** Score events between two snapshots (at most one battlefield per seat per step on this line). */
function scoreEvents(before: Snap, after: Snap, spent: Partial<Record<Seat, number>> = {}): ScoreEvent[] {
  const out: ScoreEvent[] = [];
  for (const seat of [P1, P2]) {
    const newBfs = after.turn === before.turn ? after.scored[seat]!.filter((b) => !before.scored[seat]!.includes(b)) : after.scored[seat]!;
    const holdUp = (after.ledger[seat]!.hold ?? 0) - (after.turn === before.turn ? (before.ledger[seat]!.hold ?? 0) : 0);
    for (const bf of newBfs) {
      out.push({
        bf,
        delta: after.points[seat]! - before.points[seat]!,
        drewInstead: after.hand[seat]! - before.hand[seat]! + (spent[seat] ?? 0),
        method: holdUp > 0 ? "hold" : "conquer",
        seat,
      });
    }
  }
  return out;
}

// ---- the line, step by step -------------------------------------------------------------------------

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** P1: V base → A. Non-combat showdown at A opens, P1 Focus; P1 passes → P2 has Focus. */
async function vToA(game: Game): Promise<void> {
  await game.p1.move("V", "bfA");
  await game.p1.passFocus();
}

/** P2 (Focus at A) plays Ride the Wind #1: W → B; both pass priority → it resolves. */
async function rtw1WtoB(game: Game): Promise<void> {
  await game.p2.cast("rtw1", { targets: "W" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("battlefield-bfB");
  }
  await game.p2.passPriority();
  await game.p1.passPriority();
}

/** Focus passed to P1 after the chain closed (347.1.b): P1 pass, P2 pass → A's showdown closes. */
async function closeA(game: Game): Promise<void> {
  await game.acting().pass();
  await game.acting().pass();
}

/** The Cleanup began B's showdown (P2 Focus). P2 plays Ride the Wind #2: Kai'Sa → A; both pass → resolves. */
async function rtw2KaisaToA(game: Game): Promise<void> {
  await game.settle(); // hands the auto-begun showdown at B back once (nothing else to drain)
  await game.p2.cast("rtw2", { targets: "kaisa" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("battlefield-bfA");
  }
  await game.p2.passPriority();
  await game.p1.passPriority();
}

/** Focus → P1; P1 pass, P2 pass → B's showdown closes (P2 establishes control of B). */
async function closeB(game: Game): Promise<void> {
  await game.acting().pass();
  await game.acting().pass();
}

describe("Double Ride the Wind × Kai'Sa on the opponent's turn — two conquers and the Final Point (Victory 8)", () => {
  // ---- common mechanics -----------------------------------------------------------------------------

  test("common: V contests A → non-combat showdown at A with P1 Focus; after P1 passes, Ride the Wind is LEGAL for P2 (Focus) on P1's turn (190.3.a.1, 345, 347.1)", async () => {
    const game = await board(6).build();
    await game.p1.move("V", "bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(showdown(game)).toMatchObject({ battlefieldId: "bfA", focusPlayer: P1, isCombatShowdown: false });
    expect(game.p2.can("cast", "rtw1")).toBe(false); // no Focus yet
    await game.p1.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.can("cast", "rtw1")).toBe(true);
    await game.p2.cast("rtw1", { targets: "W" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["battlefield-bfA", "battlefield-bfB"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw1", controller: P2 })]);
  });

  test("common: RtW #1 resolves — W is at B READY, B is Contested by P2 but NO showdown opens there while A's is live; Focus passes to P1 (347.1.b, 460 / 323.12)", async () => {
    const game = await board(6).build();
    await vToA(game);
    await rtw1WtoB(game);
    expect(game.zoneOf("rtw1")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
    expect(game.locationOf("W")).toBe("bfB");
    expect(game.state("W").isReady).toBe(true);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(showdown(game)).toMatchObject({ battlefieldId: "bfA", focusPlayer: P1 });
    expect(game.gameState.interaction?.showdownStack?.filter((s) => s.active)).toHaveLength(1);
    expect(game.chain()).toEqual([]);
  });

  test("common: pass/pass closes A — only P1's unit there → (P1, A, conquer, +1); the Cleanup then BEGINS the staged showdown at B with P2 (contester) holding Focus (348.2.a.1, 323.12, 345)", async () => {
    const game = await board(6).build();
    await vToA(game);
    await rtw1WtoB(game);
    const before = snap(game);
    await closeA(game);
    expect(scoreEvents(before, snap(game))).toEqual([{ bf: "bfA", delta: 1, drewInstead: 0, method: "conquer", seat: P1 }]);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(showdown(game)).toMatchObject({ autoBegun: true, battlefieldId: "bfB", focusPlayer: P2, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "rtw2")).toBe(true);
  });

  test("common: RtW #2 resolves — Kai'Sa is at A (P1's, with V) READY; A is Contested by P2 with a Combat STAGED but not open while B's showdown is live (323.9, 460)", async () => {
    const game = await board(6).build();
    await vToA(game);
    await rtw1WtoB(game);
    await closeA(game);
    await rtw2KaisaToA(game);
    expect(game.zoneOf("rtw2")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.locationOf("kaisa")).toBe("bfA");
    expect(game.state("kaisa").isReady).toBe(true);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(showdown(game)).toMatchObject({ battlefieldId: "bfB", focusPlayer: P1, isCombatShowdown: false });
    expect(game.state("kaisa").combatRole).toBeNull(); // no combat yet
    expect(game.p2.points()).toBe(6);
  });

  // ---- (i) P2 starts on 6 ---------------------------------------------------------------------------

  test("(i) at 6: B closes → (P2, B, conquer, +1) = 7 on P1's turn (466.5.e / 469.1 — whose turn it is is irrelevant); the Combat at A then opens with P2 as ATTACKER (464.2.c)", async () => {
    const game = await board(6).build();
    await vToA(game);
    await rtw1WtoB(game);
    await closeA(game);
    await rtw2KaisaToA(game);
    const before = snap(game);
    await closeB(game);
    expect(scoreEvents(before, snap(game))).toEqual([{ bf: "bfB", delta: 1, drewInstead: 0, method: "conquer", seat: P2 }]);
    expect(game.p2.points()).toBe(7);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    expect(game.isOver()).toBe(false);
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bfA", defendingPlayer: P1, isCombatShowdown: true, focusPlayer: P2 });
    expect(game.state("kaisa").combatRole).toBe("attacker");
    expect(game.state("V").combatRole).toBe("defender");
    expect(game.turnPlayer()).toBe(P1);
  });

  test("(i) at 6: combat at A — Kai'Sa 4 kills V 2; P2 establishes control of A → scoring via Conquer at Victory−1 with EVERY battlefield (B, A) scored this turn → Final Point: (P2, A, conquer, +1) = 8 → P2 WINS during P1's turn (466.3.a, 466.5.d, 471.1.b.1, 472)", async () => {
    const game = await board(6).build();
    await vToA(game);
    await rtw1WtoB(game);
    await closeA(game);
    await rtw2KaisaToA(game);
    await closeB(game);
    const before = snap(game);
    const r = await game.settle(); // pass/pass → combat damage → resolution
    expect(r.reason).toBe("game-over");
    expect(scoreEvents(before, snap(game))).toEqual([{ bf: "bfA", delta: 1, drewInstead: 0, method: "conquer", seat: P2 }]);
    expect(game.zoneOf("V")).toBe("trash");
    expect(game.locationOf("kaisa")).toBe("bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect((game.gameState as unknown as { scoredThisTurn: Record<string, string[]> }).scoredThisTurn[P2]?.slice().sort()).toEqual(["bfA", "bfB"]);
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(1);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.turnPlayer()).toBe(P1); // it never became P2's turn
  });

  test("(i) at 6: Kai'Sa's 'When I conquer, draw 1' is put on the chain (471.2.a) but the game ends at that Cleanup BEFORE it resolves — P2 drew nothing from it", async () => {
    const game = await board(6).build();
    await vToA(game);
    await rtw1WtoB(game);
    await closeA(game);
    await rtw2KaisaToA(game);
    await closeB(game);
    const hand = game.p2.hand().length;
    const deck = game.p2.deck().length;
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kaisa", controller: P2, triggered: true })]);
    expect(game.p2.hand()).toHaveLength(hand);
    expect(game.p2.deck()).toHaveLength(deck);
    expect(game.decision()).toBeNull();
  });

  // ---- (ii) P2 starts on 7 --------------------------------------------------------------------------

  test("(ii) at 7: B closes → P2 at Victory−1 has scored only B (A is P1's) → draws 1 INSTEAD: (P2, B, conquer, +0) with +1 card; B nevertheless IS 'scored this turn' and P2 controls it (471.1.b.1, 469.1)", async () => {
    const game = await board(7).build();
    await vToA(game);
    await rtw1WtoB(game);
    await closeA(game);
    await rtw2KaisaToA(game);
    const before = snap(game);
    const deck = game.p2.deck().length;
    await closeB(game);
    expect(scoreEvents(before, snap(game))).toEqual([{ bf: "bfB", delta: 0, drewInstead: 1, method: "conquer", seat: P2 }]);
    expect(game.p2.points()).toBe(7);
    expect(game.p2.deck()).toHaveLength(deck - 1);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    expect((game.gameState as unknown as { scoredThisTurn: Record<string, string[]> }).scoredThisTurn[P2]).toEqual(["bfB"]);
    expect(game.isOver()).toBe(false);
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bfA", isCombatShowdown: true });
  });

  test("(ii) at 7: the Conquer of A now finds EVERY battlefield scored this turn → Final Point: (P2, A, conquer, +1) = 8 → P2 wins on P1's turn exactly as in (i); Kai'Sa's draw again never resolves", async () => {
    const game = await board(7).build();
    await vToA(game);
    await rtw1WtoB(game);
    await closeA(game);
    await rtw2KaisaToA(game);
    await closeB(game);
    const before = snap(game);
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(scoreEvents(before, snap(game))).toEqual([{ bf: "bfA", delta: 1, drewInstead: 0, method: "conquer", seat: P2 }]);
    expect(game.p2.points()).toBe(8);
    expect(game.winner()).toBe(P2);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("V")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kaisa", triggered: true })]);
    expect(game.p2.hand()).toHaveLength(before.hand[P2]!); // the draw-instead already happened at B; nothing more
  });

  test("(i) vs (ii): the deltas differ — start 6 gives +1 / +1 with no draw; start 7 gives 0 (+draw) / +1 — both end on exactly 8", async () => {
    const run = async (start: number) => {
      const game = await board(start).build();
      await vToA(game);
      await rtw1WtoB(game);
      await closeA(game);
      await rtw2KaisaToA(game);
      const s0 = snap(game);
      await closeB(game);
      const s1 = snap(game);
      await game.settle();
      const s2 = snap(game);
      return { atA: scoreEvents(s1, s2)[0], atB: scoreEvents(s0, s1)[0], final: game.p2.points(), winner: game.winner() };
    };
    const six = await run(6);
    const seven = await run(7);
    expect([six.atB?.delta, six.atB?.drewInstead, six.atA?.delta]).toEqual([1, 0, 1]);
    expect([seven.atB?.delta, seven.atB?.drewInstead, seven.atA?.delta]).toEqual([0, 1, 1]);
    expect([six.final, seven.final]).toEqual([8, 8]);
    expect([six.winner, seven.winner]).toEqual([P2, P2]);
  });

  // ---- (iii) P2 on 7 with only ONE Ride the Wind ------------------------------------------------------

  test("(iii) at 7, one RtW (W → B only): (P1, A, conquer, +1) then (P2, B, conquer, +0) + draw 1; P2 stays on 7, no win, and P1's turn simply continues in an open main phase", async () => {
    const game = await board(7, { twoRtw: false }).build();
    await vToA(game);
    await rtw1WtoB(game);
    const s0 = snap(game);
    await closeA(game);
    const s1 = snap(game);
    expect(scoreEvents(s0, s1)).toEqual([{ bf: "bfA", delta: 1, drewInstead: 0, method: "conquer", seat: P1 }]);
    await game.settle(); // B's showdown handed back (P2 Focus, nothing to play)
    expect(showdown(game)).toMatchObject({ battlefieldId: "bfB", focusPlayer: P2 });
    expect(game.p2.can("cast")).toBe(false);
    await closeB(game);
    const s2 = snap(game);
    expect(scoreEvents(s1, s2)).toEqual([{ bf: "bfB", delta: 0, drewInstead: 1, method: "conquer", seat: P2 }]);
    expect(game.p2.points()).toBe(7);
    expect(game.p1.points()).toBe(1);
    expect(game.isOver()).toBe(false);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.locationOf("kaisa")).toBe("base");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.turnPlayer()).toBe(P1);
  });

  test("(iii) P2's next Beginning Phase: W still holds B → (P2, B, hold, +1) = 8 — Hold points ignore the Final-Point restriction (471.1.a.1) → P2 wins in its own Scoring Step", async () => {
    const game = await board(7, { twoRtw: false }).build();
    await vToA(game);
    await rtw1WtoB(game);
    await closeA(game);
    await game.settle();
    await closeB(game);
    await game.settle();
    expect(game.p2.points()).toBe(7);
    const before = snap(game);
    const next = await game.advanceTurn(); // P1 ends the turn → P2's Beginning Phase scores B
    expect(next.next).toBe(P2);
    const after = snap(game);
    expect(after.turn).toBe(before.turn + 1);
    expect(scoreEvents(before, after)).toEqual([{ bf: "bfB", delta: 1, drewInstead: expect.any(Number), method: "hold", seat: P2 }]);
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(1);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
