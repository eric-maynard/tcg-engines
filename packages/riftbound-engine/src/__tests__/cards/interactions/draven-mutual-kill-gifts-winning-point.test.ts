/**
 * Interaction: Draven, Audacious (sfd-148-221) 6 Might — "[Deflect] The first time I win a combat each
 *              turn, you score 1 point. When I die in combat, choose an opponent. They score 1 point."
 *   × Kai'Sa, Evolutionary (ogn-112-298) 6 Might — lone defender at battlefield A.
 *
 * 1v1, Victory Score 8. P2 controls A with Kai'Sa; on P1's turn Draven attacks A alone, no tricks:
 * combat damage is simultaneous, both take 6 and die together.
 *
 * Rulings under test:
 *  (a) 466.1 Combat Cleanup: 323.4 death triggers are noted, 323.5 both units go to trash. 466.3.d
 *      neither side has units → "No Result": nobody won the combat (466.3.a), so Draven's first ability
 *      does not fire. 466.5.b no units remain → A becomes Uncontrolled; no Conquer, no battlefield
 *      point for anyone.
 *  (b) 466.2 Draven's "die in combat" trigger resolves before the combat result is determined; the only
 *      opponent is P2, who scores 1. 471.1.a.1 / 194.1.c a point from a triggered ability is not a
 *      Conquer, so the Final-Point restriction does not apply → P2 reaches 8. 472 / 323.1 the next
 *      Cleanup sees P2 ≥ 8 and ahead → P2 wins right there, on P1's turn, mid-combat-resolution (not
 *      deferred to end of turn; not "immediately" either — that is only 431.3.c.1 burn-out).
 *  (c) P2 at 6 → 7; A is Uncontrolled, so P2 cannot Hold it at their next Beginning Phase (469.2,
 *      190.4.a) and stays at 7. P1 scores nothing.
 *  (d) Defender at 5 Might: only she dies, Draven heals (466.1.a.1), P1 alone has units → won the
 *      combat (466.3.a) → +1 in the 466.4 window, then 466.5 Establish Control → Conquer → +1 more
 *      (subject to 471.1.b when that conquer would be the Final Point). P2 gets nothing.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN = "sfd-148-221";
const KAISA = "ogn-112-298";

type DefSpec = string | { might: number; name: string };

function board(opts: { p2Points: number; p1Points?: number; defender?: DefSpec; secondBattlefield?: boolean }) {
  let s = scenario()
    .victoryScore(8)
    .points(P1, opts.p1Points ?? 0)
    .points(P2, opts.p2Points)
    .battlefield("bfA", { controller: P2 });
  if (opts.secondBattlefield) {
    s = s.battlefield("bfB", { controller: null });
  }
  return s.unit(P2, "bfA", opts.defender ?? KAISA, "kaisa").unit(P1, "base", DRAVEN, "draven");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

async function dravenAttacks(game: Built) {
  expect(game.state("draven").might).toBe(6);
  await game.p1.move("draven", "bfA");
  return game.settle();
}

describe("Draven, Audacious × Kai'Sa, Evolutionary — mutual kill hands over the winning point", () => {
  test("(a) 6 into 6: both die simultaneously and go to their owners' trashes", async () => {
    const game = await board({ p2Points: 6 }).build();
    expect(game.state("kaisa").might).toBe(6);
    await dravenAttacks(game);
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.p1.trash()).toContain("draven");
    expect(game.p2.trash()).toContain("kaisa");
  });

  test("(a) No Result: nobody wins the combat or conquers — A becomes Uncontrolled and P1 scores nothing (no win-combat point, no conquer point)", async () => {
    const game = await board({ p2Points: 6 }).build();
    await dravenAttacks(game);
    const bfA = game.gameState.battlefields.bfA;
    expect(bfA?.controller).toBeNull();
    expect(bfA?.contested).toBe(false);
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.p2.units("bfA")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(b) P2 at 7: Draven's 'die in combat' trigger gives P2 the 8th point — a non-conquer point ignores the Final-Point restriction — and P2 wins on P1's turn", async () => {
    const game = await board({ p2Points: 7 }).build();
    expect(game.turnPlayer()).toBe(P1);
    const turn = game.turnNumber();
    const stop = await dravenAttacks(game);
    expect(stop.reason).toBe("game-over");
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(0);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    // Won at a Cleanup during combat resolution: still P1's turn, same turn number, still the main phase —
    // not deferred to any end-of-turn step.
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(turn);
    expect(game.phase()).toBe("main");
    expect(game.gameState.battlefields.bfA?.controller).not.toBe(P1);
  });

  test("(b) 'choose an opponent' in 1v1 needs no real decision from P1 — the lone opponent P2 is it, and nothing is left pending", async () => {
    const game = await board({ p2Points: 6 }).build();
    const stop = await dravenAttacks(game);
    expect(stop.reason).not.toBe("unanswered");
    expect(game.p2.points()).toBe(7);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) P2 at 6: ends at 7, game continues, A is Uncontrolled — and P2 cannot Hold A at their next Beginning Phase, so they are still on 7 in their main phase", async () => {
    const game = await board({ p2Points: 6 }).build();
    await dravenAttacks(game);
    expect(game.p2.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    await game.advanceTurn(); // P1 ends → P2's beginning phase (no Hold) → P2's main phase
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p2.points()).toBe(7);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.isOver()).toBe(false);
  });

  test("(d) contrast — defender at 5 Might: only she dies; Draven survives healed, wins the combat (+1) and conquers A (+1) → P1 on 2, P2 (at 7) gets nothing", async () => {
    const game = await board({ p2Points: 7, defender: { might: 5, name: "Weakened Kai'Sa" } }).build();
    await dravenAttacks(game);
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.zoneOf("draven")).toBe("battlefield-bfA");
    expect(game.state("draven").damage).toBe(0);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("(d) contrast — P1 already at 7: the win-combat point is not a Conquer, so it is a legal Final Point → P1 wins with 8", async () => {
    const game = await board({ p1Points: 7, p2Points: 0, defender: { might: 5, name: "Weakened Kai'Sa" }, secondBattlefield: true }).build();
    const stop = await dravenAttacks(game);
    expect(stop.reason).toBe("game-over");
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
  });

  // Expected: 466.3/466.4 — the win-combat trigger resolves BEFORE 466.5 Establish Control. P1 at 6 with a
  // second, unscored battlefield: trigger → 7 (non-conquer, unrestricted), then the Conquer of A would be the
  // Final Point but P1 has not scored every battlefield this turn → 471.1.b.1 draws a card instead. P1 ends
  // on 7 with +1 card and the game goes on. Actual: the engine credits both points (P1 reaches 8 and wins).
  test("(d) P1 at 6 with an unscored bfB — win-combat point first (→7), then the conquer is a restricted Final Point → draw instead; P1 stays on 7 (466.4 before 466.5, 471.1.b.1)", async () => {
    const game = await board({ p1Points: 6, p2Points: 0, defender: { might: 5, name: "Weakened Kai'Sa" }, secondBattlefield: true }).build();
    const hand0 = game.p1.hand().length;
    await dravenAttacks(game);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });
});
