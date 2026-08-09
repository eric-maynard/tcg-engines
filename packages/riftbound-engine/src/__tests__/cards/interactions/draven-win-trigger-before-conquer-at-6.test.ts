/**
 * Interaction: Draven, Audacious (sfd-148-221) · Champion Unit · Chaos · 6 energy · 6 Might
 *     "[Deflect] … The first time I win a combat each turn, you score 1 point.
 *      When I die in combat, choose an opponent. They score 1 point."
 *   × Plundering Poro (sfd-069-221) · Unit · 2 Might · "When I conquer, play a Gold gear token exhausted."
 *   × the Final-Point rule.
 *
 * Question: 1v1, Victory Score 8, battlefields A and B. P2 controls A with a lone Plundering Poro (2).
 * On P1's turn Draven (6) attacks A alone, kills the Poro and survives. Table claim: "I'm at 6, Draven wins
 * combat = +1 and conquers = +1, that's 8, gg."
 *   (a) P1 at 6, B NOT scored this turn: in what order do the win-a-combat point and the Conquer point
 *       happen — does P1 reach 8, or end at 7 with a card?
 *   (b) P1 at 5: final total?
 *   (c) P1 began the turn at 5, Held B in the Beginning Phase (→6), then Draven wins at A: 8 and the win?
 *   (d) P1 at 7 with B unscored: total and cards drawn?
 *
 * Rules — the Resolution Step order is fixed:
 *   466.1 Combat Cleanup → 466.3 Determine Combat Result (466.3.a: Draven's side is the only one left →
 *   P1 "won the combat") → 466.4 resolve chain items arising from the result (Draven's triggered ability
 *   RESOLVES HERE) → 466.5 Establish Control / 466.5.d Conquer → 466.6 resolve those items.
 *   194.1.c / 471.1.a.1 — a point from a triggered ability is not a Conquer point: never Final-Point
 *   restricted. 471.1.b / 471.1.b.1 — a Conquer point attempted at (Victory−1) or higher is the Final
 *   Point only if every battlefield was scored this turn; otherwise draw 1 instead. 469.2 / 470 — a Hold
 *   in the Beginning Phase scores B for the turn. 472 / 323.1 — ≥ Victory Score and ahead at a cleanup → win.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN = "sfd-148-221";
const PLUNDERING_PORO = "sfd-069-221";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn (turn 2), Victory Score 8. P2 controls A with a lone Poro (2); B is uncontrolled and empty. Draven (6) in P1's base. */
function board(p1Points: number) {
  return scenario()
    .victoryScore(8)
    .points(P1, p1Points)
    .points(P2, 0)
    .battlefield("A", { controller: P2 })
    .battlefield("B", { controller: null })
    .unit(P2, "A", PLUNDERING_PORO, "poro")
    .unit(P1, "base", DRAVEN, "draven");
}

/** Draven attacks A alone and everything settles. Returns the game and how many cards P1 net-drew. */
async function dravenTakesA(s: ReturnType<typeof board>): Promise<{ game: G; drawn: number }> {
  const game = await s.build();
  const hand = game.p1.hand().length;
  await game.p1.move("draven", "A");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.settle();
  return { drawn: game.p1.hand().length - hand, game };
}

/** Combat facts common to every variant: Poro died to 6, Draven took 2 < 6 and survived (healed), P1 now controls A, P2 scored nothing. */
function expectDravenWonA(game: G): void {
  expect(game.zoneOf("poro")).toBe("trash");
  expect(game.zoneOf("draven")).toBe("battlefield-A");
  expect(game.state("draven").damage).toBe(0);
  expect(game.gameState.battlefields.A?.controller).toBe(P1);
  expect(game.gameState.battlefields.A?.contested).toBe(false);
  expect(game.gameState.scoredThisTurn[P1]).toContain("A");
  expect(game.p2.points()).toBe(0); // "When I die in combat" did not fire — Draven lived
  expect(game.chain()).toEqual([]);
}

describe("Draven, Audacious — win-combat point resolves BEFORE the conquer point (Final-Point check)", () => {
  // ── the ordering itself ─────────────────────────────────────────────────────────────────────

  test("Draven's 'first time I win a combat' ability is a TRIGGERED ability that goes on the chain after the combat result (466.3.a → 466.4) — both players get priority on it", async () => {
    const game = await board(6).build();
    await game.p1.move("draven", "A");
    await game.p1.passFocus();
    await game.p2.passFocus(); // combat damage → Poro dies → resolution begins
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "draven", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("while Draven's win-combat trigger is still pending (466.4 window) control of A must NOT yet be established — P1 should still be at 6 with A unscored; the engine conquers A (+1 → 7) before the trigger even resolves (466.4 before 466.5)", async () => {
    // Expected: points 6, A not in scoredThisTurn, A's controller not yet P1 while the trigger sits on the chain.
    // Actual: the engine runs Establish Control / Conquer first — P1 is already at 7 and controls A, THEN offers priority on the trigger.
    const game = await board(6).build();
    await game.p1.move("draven", "A");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.chain().map((c) => c.cardId)).toEqual(["draven"]);
    expect(game.p1.points()).toBe(6);
    expect(game.gameState.scoredThisTurn[P1]).not.toContain("A");
    expect(game.gameState.battlefields.A?.controller).not.toBe(P1);
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves → 7; only now 466.5 conquers
    expect(game.p1.points()).toBe(7);
  });

  // ── (a) at 6, B unscored ────────────────────────────────────────────────────────────────────

  test("(a) P1 at 6, B unscored: trigger → 7 (unrestricted, 471.1.a.1), THEN the conquer is attempted at 7 = Victory−1 with B unscored → P1 draws 1 instead (471.1.b.1). Result 7 points + 1 card, game NOT over — not 8; the engine awards the conquer first and ends the game at 8", async () => {
    // Expected: 7 points, +1 card in hand, A conquered and marked scored, game continues in P1's main phase.
    // Actual: conquer resolves first (6→7, unrestricted), then the trigger (7→8) → P1 is declared the winner with no card drawn.
    const { game, drawn } = await dravenTakesA(board(6));
    expectDravenWonA(game);
    expect(game.p1.points()).toBe(7);
    expect(drawn).toBe(1);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) epilogue: the table claim fails but P1 is not stuck — from 7 while controlling A, simply HOLDING A in P1's next Beginning Phase gains the 8th point (a Hold is never Final-Point restricted, 469.2 / 471.1.a.1) and wins", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .active(P2)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: null })
      .unit(P1, "A", DRAVEN, "draven")
      .build();
    expect(game.isOver()).toBe(false);
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  // ── (b) at 5 ────────────────────────────────────────────────────────────────────────────────

  test("(b) P1 at 5: trigger → 6, conquer attempted at 6 (< Victory−1) is an ordinary point → 7; no card drawn, game continues", async () => {
    const { game, drawn } = await dravenTakesA(board(5));
    expectDravenWonA(game);
    expect(game.p1.points()).toBe(7);
    expect(drawn).toBe(0);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) contrast on the same turn: from that 7, a SECOND P1 unit conquering B is a Conquer attempted at Victory−1 with every battlefield (A + B) scored this turn → it IS the Final Point → 8 and P1 wins, no card (471.1.b.1)", async () => {
    // Shows the other branch of 471.1.b.1: the restriction is about "scored every battlefield this turn", not about the
    // source being a conquer per se. (Draven's own trigger is 'first time each turn' and this is not his combat anyway.)
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 5)
      .points(P2, 0)
      .battlefield("A", { controller: P2 })
      .battlefield("B", { controller: P2 })
      .unit(P2, "A", PLUNDERING_PORO, "poro")
      .unit(P2, "B", { might: 1, name: "B Guard" }, "bGuard")
      .unit(P1, "base", DRAVEN, "draven")
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .build();
    await game.p1.move("draven", "A");
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    const hand = game.p1.hand().length;
    await game.p1.move("runner", "B");
    await game.settle();
    expect(game.zoneOf("bGuard")).toBe("trash");
    expect(game.gameState.battlefields.B?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]?.slice().sort()).toEqual(["A", "B"]);
    expect(game.p1.points()).toBe(8); // Final Point through a Conquer: every battlefield scored this turn
    expect(game.p1.hand().length - hand).toBe(0);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  // ── (c) began at 5, Held B, then Draven wins A ─────────────────────────────────────────────

  test("(c) P1 began the turn at 5 and HELD B in the Beginning Phase (→6, B scored); Draven then wins at A: trigger → 7, conquer attempted at 7 with EVERY battlefield (B held + A now) scored → Final Point → 8, P1 wins at the following cleanup (469.2, 470, 471.1.b.1, 472)", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 5)
      .points(P2, 0)
      .active(P2)
      .battlefield("A", { controller: P2 })
      .battlefield("B", { controller: P1 })
      .unit(P2, "A", PLUNDERING_PORO, "poro")
      .unit(P1, "B", { might: 1, name: "B Holder" }, "holder")
      .unit(P1, "base", DRAVEN, "draven")
      .build();
    await game.advanceTurn(); // P2 ends → P1's Beginning Phase: Hold B
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(6);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["B"]);
    const hand = game.p1.hand().length;
    await game.p1.move("draven", "A");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]?.slice().sort()).toEqual(["A", "B"]);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand().length - hand).toBe(0); // no "draw instead" — this WAS the Final Point
    expect(game.p2.points()).toBe(0);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  // ── (d) at 7, B unscored ────────────────────────────────────────────────────────────────────

  test("(d) P1 at 7, B unscored: trigger → 8 (unrestricted); the conquer is then attempted at 8 (≥ Victory−1) with B unscored → draw 1 instead; the cleanup finds P1 at 8 > P2 → P1 wins anyway, one card richer (471.1.a.1, 471.1.b.1, 472)", async () => {
    const { game, drawn } = await dravenTakesA(board(7));
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(drawn).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
