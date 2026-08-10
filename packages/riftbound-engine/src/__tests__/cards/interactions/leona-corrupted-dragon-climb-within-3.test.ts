/**
 * Interaction: Leona, Zealot (ogn-079-298) · Champion Unit · Calm · 6 + [calm] · 6 Might
 *     "If AN OPPONENT's score is within 3 points of the Victory Score, I enter ready. …"
 *   × Corrupted Dragon (ven-091-166) · Unit · Body · 10 + [body]×2 · 10 Might
 *     "If YOUR score is NOT within 3 points of the Victory Score, I enter ready. …"
 *   × Aspirant's Climb (ogn-276-298) · Battlefield · "Increase the points needed to win the game by 1."
 *
 * Question: two 'Victory Score' riders a 2-player engine is tempted to hardcode as "8" and as "the
 * other guy". P1 plays each unit from hand to base in these states:
 *   (i)   VS 8,  P1 5 / P2 4     (ii)  VS 8,  P1 4 / P2 5
 *   (iii) Aspirant's Climb in play (VS 9), P1 5 / P2 5     (iv) Climb in play, P1 2 / P2 6
 * For each: does Leona enter ready? does the Dragon? Does P1's OWN 5 ever satisfy Leona's "an
 * opponent", and does the threshold move from 5 to 6 while the Climb is out?
 *
 * Rules: 485.2 (Duel: each player's opponents = the other player), 485.3 / 194.3 (Victory Score 8),
 * 194.3.a (effects in play modify it — Aspirant's Climb → 9, a live passive per 365.1), 483.3, 140.3
 * (units enter exhausted unless something says otherwise). Ruling: "within 3 points of the Victory
 * Score" = score ≥ VS − 3 (5+ at 8, 6+ at 9).
 *
 * Expected:            Leona      Dragon
 *   (i)   8, 5/4       exhausted  exhausted   (P1's own 5 does not count for Leona; own 5 IS within 3)
 *   (ii)  8, 4/5       READY      READY
 *   (iii) 9, 5/5       exhausted  READY       (both flip vs. a hardcoded 8)
 *   (iv)  9, 2/6       READY      READY
 * Static enter-ready conditions: evaluated as the permanent enters, no chain item, nothing to respond to.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEONA = "ogn-079-298";
const CORRUPTED_DRAGON = "ven-091-166";
const ASPIRANTS_CLIMB = "ogn-276-298";

interface Position {
  readonly p1: number;
  readonly p2: number;
  readonly climb: boolean;
}

/**
 * P1's turn 2, main phase, Mode-of-Play Victory Score 8. P1 holds Leona AND the Dragon with exactly
 * both costs (16 energy, 1 calm, 2 body). `climb` puts a live (non-inert) Aspirant's Climb on the
 * board as an uncontrolled, empty battlefield; otherwise the lone battlefield is an inert blank.
 */
function board(pos: Position) {
  return scenario()
    .victoryScore(8)
    .points(P1, pos.p1)
    .points(P2, pos.p2)
    .resources(P1, { energy: 16, power: { body: 2, calm: 1 } })
    .battlefield("bf1", pos.climb ? { controller: null, def: ASPIRANTS_CLIMB, inert: false } : { controller: null })
    .hand(P1, LEONA, "leona")
    .hand(P1, CORRUPTED_DRAGON, "dragon");
}

/** Play `alias` to base and let it land; returns the game for assertions. */
async function playToBase(pos: Position, alias: "leona" | "dragon"): Promise<Game> {
  const game = await board(pos).build();
  expect(game.p1.can("play", alias)).toBe(true);
  await game.p1.play(alias, { to: "base" });
  // A unit resolves immediately (337.2): it is on the board before anyone could respond.
  expect(game.zoneOf(alias)).toBe("base");
  expect(game.chain()).toEqual([]);
  await game.settle();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

describe("Leona 'an opponent within 3' vs Corrupted Dragon 'you NOT within 3' — under VS 8 and under Aspirant's Climb (VS 9)", () => {
  test("premise: the Mode-of-Play score stays 8 in every position; Aspirant's Climb is a live board passive on top (its bf is in play only in (iii)/(iv))", async () => {
    const plain = await board({ climb: false, p1: 5, p2: 4 }).build();
    expect(plain.gameState.victoryScore).toBe(8);
    const climb = await board({ climb: true, p1: 5, p2: 5 }).build();
    expect(climb.gameState.victoryScore).toBe(8); // 194.3 untouched — the +1 is layered (194.3.a / 365.1)
    expect(climb.state("bf1").name).toBe("Aspirant's Climb");
    expect(climb.p1.points()).toBe(5);
    expect(climb.p2.points()).toBe(5);
  });

  // ── (i) VS 8, P1 5 / P2 4 ─────────────────────────────────────────────────────────────────────

  test("(i) VS 8, P1 5 / P2 4 — Leona enters EXHAUSTED: the only opponent (P2) is at 4 < 5, and P1's OWN 5 never satisfies 'an opponent' (485.2)", async () => {
    const game = await playToBase({ climb: false, p1: 5, p2: 4 }, "leona");
    expect(game.state("leona")).toMatchObject({ controller: P1, isExhausted: true, isReady: false, might: 6 });
    expect(game.p1.resources()).toEqual({ energy: 10, power: { body: 2, calm: 0 } });
  });

  test("(i) VS 8, P1 5 / P2 4 — Corrupted Dragon enters EXHAUSTED: P1's own 5 IS within 3 of 8, so 'not within 3' is false", async () => {
    const game = await playToBase({ climb: false, p1: 5, p2: 4 }, "dragon");
    expect(game.state("dragon")).toMatchObject({ controller: P1, isExhausted: true, isReady: false, might: 10 });
    expect(game.p1.resources()).toEqual({ energy: 6, power: { body: 0, calm: 1 } });
  });

  // ── (ii) VS 8, P1 4 / P2 5 ────────────────────────────────────────────────────────────────────

  test("(ii) VS 8, P1 4 / P2 5 — Leona enters READY: opponent P2 at 5 ≥ 8 − 3", async () => {
    const game = await playToBase({ climb: false, p1: 4, p2: 5 }, "leona");
    expect(game.state("leona")).toMatchObject({ isExhausted: false, isReady: true });
  });

  test("(ii) VS 8, P1 4 / P2 5 — Corrupted Dragon enters READY: P1's own 4 is not within 3 of 8 (P2's 5 is irrelevant to 'your score')", async () => {
    const game = await playToBase({ climb: false, p1: 4, p2: 5 }, "dragon");
    expect(game.state("dragon")).toMatchObject({ isExhausted: false, isReady: true });
  });

  // ── (iii) Aspirant's Climb → VS 9, P1 5 / P2 5 ────────────────────────────────────────────────

  test("(iii) Climb in play (VS 9), 5 / 5 — Leona enters EXHAUSTED: 5 < 9 − 3 = 6 (she would wrongly be ready against a hardcoded 8) (194.3.a)", async () => {
    const game = await playToBase({ climb: true, p1: 5, p2: 5 }, "leona");
    expect(game.state("leona")).toMatchObject({ isExhausted: true, isReady: false });
  });

  test("(iii) Climb in play (VS 9), 5 / 5 — Corrupted Dragon enters READY: own 5 is NOT within 3 of 9 (it would wrongly be exhausted against a hardcoded 8) (194.3.a)", async () => {
    const game = await playToBase({ climb: true, p1: 5, p2: 5 }, "dragon");
    expect(game.state("dragon")).toMatchObject({ isExhausted: false, isReady: true });
  });

  test("(iii) control: the SAME 5 / 5 position with the Climb's text stripped (inert battlefield, VS 8) flips both — Leona READY, Dragon EXHAUSTED — so the difference above is the Climb's passive alone", async () => {
    const leona = await playToBase({ climb: false, p1: 5, p2: 5 }, "leona");
    expect(leona.state("leona").isReady).toBe(true);
    const dragon = await playToBase({ climb: false, p1: 5, p2: 5 }, "dragon");
    expect(dragon.state("dragon").isExhausted).toBe(true);
  });

  // ── (iv) Aspirant's Climb → VS 9, P1 2 / P2 6 ────────────────────────────────────────────────

  test("(iv) Climb in play (VS 9), P1 2 / P2 6 — Leona enters READY: opponent 6 ≥ 6", async () => {
    const game = await playToBase({ climb: true, p1: 2, p2: 6 }, "leona");
    expect(game.state("leona")).toMatchObject({ isExhausted: false, isReady: true });
  });

  test("(iv) Climb in play (VS 9), P1 2 / P2 6 — Corrupted Dragon enters READY: own 2 < 6", async () => {
    const game = await playToBase({ climb: true, p1: 2, p2: 6 }, "dragon");
    expect(game.state("dragon")).toMatchObject({ isExhausted: false, isReady: true });
  });

  // ── mechanics: static, not a trigger ──────────────────────────────────────────────────────────

  test("the enter-ready riders are static conditions checked as the unit enters: playing both in (ii) puts NO item on the chain, opens no prompt for either player, and both are ready the instant they land", async () => {
    const game = await board({ climb: false, p1: 4, p2: 5 }).build();
    await game.p1.play("leona", { to: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.p2.decision()).toBeNull();
    expect(game.state("leona").isReady).toBe(true);
    await game.p1.play("dragon", { to: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.p2.decision()).toBeNull();
    expect(game.state("dragon").isReady).toBe(true);
    expect(game.p1.units("base").sort()).toEqual(["dragon", "leona"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, calm: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the check is made at the moment of play: in (i) Leona lands exhausted, then P2 reaching 5 later does NOT retroactively ready her", async () => {
    const game = await board({ climb: false, p1: 5, p2: 4 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2, name: "P2 Holder" }, "holder")
      .build();
    await game.p1.play("leona", { to: "base" });
    expect(game.state("leona").isExhausted).toBe(true);
    // P1 ends the turn; P2 holds bf2 at the start of its turn → P2 5 (now "within 3"). Leona, already
    // on the board and not the turn player's, stays exhausted.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(5);
    expect(game.state("leona").isExhausted).toBe(true);
  });
});
