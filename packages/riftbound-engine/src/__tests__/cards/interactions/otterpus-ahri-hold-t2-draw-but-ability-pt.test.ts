/**
 * Interaction: Otterpus (ven-053-166) × Ahri, Alluring (ogn-066-298) × The Arena's Greatest (ogn-290-298)
 *
 *   Otterpus — Unit · Mind · 2 · 2 Might
 *     "If a player would score 1 point from conquering or holding during their first or second turn,
 *      they draw 1 instead."
 *   Ahri, Alluring — Champion Unit · Calm · 5 + [calm] · 4 Might
 *     "When I hold, you score 1 point."
 *   The Arena's Greatest — Battlefield
 *     "At the start of each player's first Beginning Phase, that player gains 1 point."
 *
 * Rules: 468 / 468.1 (Scoring = Conquer or Hold), 469.2 (Hold: control a battlefield in your Beginning
 * Phase → 1 point), 470 (score once per battlefield per turn, either method), 471.1 / 471.1.a.1 (points
 * GAINED from non-Conquer/Hold sources are not scoring and escape those restrictions), 471.2.b,
 * 383.4.d.2.c (if the Hold point is negated or REPLACED the Hold Effect still triggers), 369.1 / 370.1.b
 * (replacement effects — "instead"), 372.1 (affected player orders several), 373 (simultaneous events are
 * replaced one by one), 365.1.
 *
 * Question / expected:
 *   (a) P1's FIRST Beginning Phase with the Arena in play and P2's Otterpus on the board: the Arena point
 *       is a plain GAIN, not a score from conquering/holding → NOT replaced: P1 0→1, no extra card.
 *   (b) P1's SECOND turn, P1 holds bf1 with Ahri there: the Hold point IS replaced by "draw 1" (score
 *       stays, hand +1); Ahri's Hold trigger still goes on the chain (383.4.d.2.c) and its point — from a
 *       triggered ability, not from holding — is NOT replaced: +1 point. bf1 counts as scored this turn
 *       (470): re-taking it later this turn yields neither a point nor an Otterpus draw.
 *   (c) P1's THIRD-or-later turn, same board: hold point + Ahri point, no Otterpus draw.
 *   (d) Symmetric ("a player" includes Otterpus's controller): P2's own turn-2 hold/conquer draws instead;
 *       two turn-2 holds are two separate events (373) → two draws, zero hold points.
 *
 * Harness notes: a built scenario has seen no Beginning Phase yet, so a player's NEXT Beginning Phase is
 * their "first" for the Arena; `turnsTaken` starts at max(1, ⌊turn/2⌋), so `.turn(2)` makes the next own
 * turn a player's SECOND and `.turn(6)` their fourth. Every own turn start also draws 1 in the Draw step.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const OTTERPUS = "ven-053-166";
const AHRI = "ogn-066-298";
const ARENA = "ogn-290-298";
const DRAW_STEP = 1; // the turn player's ordinary draw

/** (a) P2 to end turn 2 → P1's first-seen Beginning Phase on P1's 2nd turn. Arena live, P1 holds nothing. */
function boardArena() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("ag", { controller: null, def: ARENA, inert: false, owner: P1 })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", OTTERPUS, "otter");
}

/** (b)/(c) P2 to end the turn → P1's Beginning Phase; P1 controls bf1 with Ahri on it; P2's Otterpus in base. */
function boardHold(turn: number, withOtterpus = true) {
  const s = scenario()
    .turn(turn)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", AHRI, "ahri")
    .unit(P1, "base", { might: 2, name: "Runner" }, "runner");
  return withOtterpus ? s.unit(P2, "base", OTTERPUS, "otter") : s;
}

describe("Otterpus × Ahri × The Arena's Greatest — what is 'scoring from conquering or holding'", () => {
  // ── (a) Arena's Greatest: a GAIN, not a score ─────────────────────────────────────────────

  test("(a) P1's first Beginning Phase on P1's 2nd turn: the Arena trigger resolves as +1 POINT for P1 — Otterpus does not turn a plain gain into a draw (471.1.a.1)", async () => {
    const game = await boardArena().build();
    expect(game.gameState.players[P1]?.turnsTaken).toBe(1); // the coming turn is P1's second → inside Otterpus's window
    const hand = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ag", controller: P1, triggered: true })]);
    const s = await game.settle();
    expect(s.reason).toBe("open"); // no replacement / ordering Decision was raised
    expect(game.gameState.players[P1]?.turnsTaken).toBe(2);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand + DRAW_STEP); // only the Draw-step card, no Otterpus draw
    expect(game.p2.points()).toBe(0);
  });

  test("(a) control: the same first Beginning Phase WITHOUT Otterpus is identical (+1 point, +1 card) — Otterpus contributed nothing", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("ag", { controller: null, def: ARENA, inert: false, owner: P1 })
      .battlefield("bf1", { controller: null })
      .build();
    const hand = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand + DRAW_STEP);
  });

  // ── (b) turn 2: hold replaced, Ahri still triggers, Ahri's point not replaced ─────────────

  test("(b) P1's 2nd turn holding bf1: the Hold point is replaced by a draw — while Ahri's trigger waits on the chain P1 has 0 points and already +1 card (370.1.b)", async () => {
    const game = await boardHold(2).build();
    const hand = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(0); // the hold point did not happen …
    expect(game.p1.hand()).toHaveLength(hand + 1); // … a draw happened instead (Draw step not reached yet)
    // 383.4.d.2.c — the Hold Effect still triggers even though its point was replaced.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(b) Ahri's 'you score 1 point' comes from a triggered ability, not from conquering/holding → NOT replaced: net turn 2 = +1 point (Ahri only) and +1 Otterpus card (+1 Draw step)", async () => {
    const game = await boardHold(2).build();
    const hand = game.p1.hand().length;
    const deck = game.p1.deck().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand + 1 + DRAW_STEP);
    expect(game.p1.deck()).toHaveLength(deck - 1 - DRAW_STEP);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.hand()).toHaveLength(0); // "they draw" = the would-be scorer, not Otterpus's controller
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) bf1 counts as SCORED this turn although its point was replaced (470): it is in scoredThisTurn, and vacating + re-taking bf1 later this turn gives neither a point nor an Otterpus draw", async () => {
    const game = await boardHold(2).build();
    await game.advanceTurn();
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
    const pts = game.p1.points();
    const hand = game.p1.hand().length;
    await game.p1.move("ahri", "base");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // control lapsed once nobody of P1's stood there
    await game.p1.move("runner", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // re-taken …
    expect(game.p1.points()).toBe(pts); // … but no second score from bf1 this turn
    expect(game.p1.hand()).toHaveLength(hand); // and nothing for Otterpus to replace either
  });

  test("(b) contrast: conquering a DIFFERENT battlefield (bf2) on that same 2nd turn IS a fresh score event → Otterpus replaces it: +1 card, no point", async () => {
    const game = await boardHold(2).build();
    await game.advanceTurn();
    const pts = game.p1.points();
    const hand = game.p1.hand().length;
    await game.p1.move("runner", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(pts);
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });

  test("(b) control without Otterpus: the same 2nd-turn hold gives hold + Ahri = 2 points and only the Draw-step card", async () => {
    const game = await boardHold(2, false).build();
    const hand = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.p1.points()).toBe(2);
    expect(game.p1.hand()).toHaveLength(hand + DRAW_STEP);
  });

  // ── (c) turn 3+: Otterpus's window is closed ──────────────────────────────────────────────

  test("(c) P1's 4th turn, same board: Otterpus no longer applies — hold point + Ahri point = +2, hand only +1 (Draw step)", async () => {
    const game = await boardHold(6).build();
    expect(game.gameState.players[P1]?.turnsTaken).toBe(3);
    const hand = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(1); // the hold point lands immediately this time
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", triggered: true })]);
    await game.settle();
    expect(game.p1.points()).toBe(2);
    expect(game.p1.hand()).toHaveLength(hand + DRAW_STEP);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
  });

  // ── (d) symmetry and per-event application ────────────────────────────────────────────────

  test("(d) 'a player' includes Otterpus's own controller: P2 holding on P2's 2nd turn draws 1 instead of scoring", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Holder" }, "h1")
      .unit(P2, "base", OTTERPUS, "otter")
      .build();
    expect(game.gameState.players[P2]?.turnsTaken).toBe(1);
    const hand = game.p2.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.hand()).toHaveLength(hand + 1 + DRAW_STEP);
    expect(game.gameState.scoredThisTurn[P2]).toEqual(["bf1"]);
  });

  test("(d) P2 CONQUERING an empty battlefield on P2's 2nd turn also draws instead of scoring (both methods are covered)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .battlefield("bf3", { controller: null })
      .unit(P2, "base", OTTERPUS, "otter")
      .unit(P2, "base", { might: 2, name: "Runner" }, "r2")
      .build();
    await game.advanceTurn();
    const hand = game.p2.hand().length;
    await game.p2.move("r2", "bf3");
    await game.settle();
    expect(game.gameState.battlefields.bf3?.controller).toBe(P2);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.hand()).toHaveLength(hand + 1);
    expect(game.gameState.conqueredThisTurn[P2]).toEqual(["bf3"]);
  });

  test("(d) two battlefields held on a 2nd turn are two separate score events (373) and Otterpus is not once-per-turn: two draws, zero hold points", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Holder 1" }, "h1")
      .unit(P2, "bf2", { might: 2, name: "Holder 2" }, "h2")
      .unit(P2, "base", OTTERPUS, "otter")
      .build();
    const hand = game.p2.hand().length;
    const deck = game.p2.deck().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.hand()).toHaveLength(hand + 2 + DRAW_STEP);
    expect(game.p2.deck()).toHaveLength(deck - 2 - DRAW_STEP);
    expect([...game.gameState.scoredThisTurn[P2] ?? []].sort()).toEqual(["bf1", "bf2"]);
    expect(game.violations()).toEqual([]);
  });

  test("(d) Hold Effects at BOTH held battlefields still trigger when both hold points are replaced: two Ahris → two triggers → +2 points, +2 Otterpus cards", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", AHRI, "ahri1")
      .unit(P2, "bf2", AHRI, "ahri2")
      .unit(P2, "base", OTTERPUS, "otter")
      .build();
    const hand = game.p2.hand().length;
    await game.p1.endTurn();
    expect(game.p2.points()).toBe(0);
    await game.acceptTriggerOrder(); // two same-controller triggers may be offered for ordering (383.3.d)
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["ahri1", "ahri2"]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p2.points()).toBe(2);
    expect(game.p2.hand()).toHaveLength(hand + 2 + DRAW_STEP);
  });
});
