/**
 * Interaction: conceding at / after the Victory Score.
 *   Aspirant's Climb (ogn-276-298) · Battlefield — "Increase the points needed to win the game by 1."
 *   × Ahri, Alluring (ogn-066-298) · Champion Unit · Calm · 5 · 4 Might — "When I hold, you score 1 point."
 *
 * Question:
 *   (a) Aspirant's Climb is in play (Victory Score 9). P1 has 8 points, P2 has 5, it is P2's Main Phase. P1 concedes.
 *       Legal? Who wins, with how many points?
 *   (b) No Climb (Victory Score 8). P1 at 7 holds a battlefield with Ahri in P1's Beginning Phase: Hold scores 1 (→8)
 *       and Ahri's hold trigger is added to the chain. Does P1 win at 8 before the trigger resolves, or at 9 after?
 *   (c) Right after (b) P1 sends concede, then P2 sends concede. Accepted? Any state change? A second game-over?
 *
 * Rules: 650 (a player may concede at any time — while a game is in progress), 651.1 (the remaining player wins),
 * 194.2 / 194.3.a (Victory Score; Aspirant's Climb raises it), 195 / 196 (winning ends the game), 469.2 (Hold scores
 * in the Beginning Phase), 471.1.b (the Final-Point restriction is Conquer-only), 471.2.b (hold triggers become
 * Pending items), 319.3 / 323.1 (the Cleanup after adding a Pending item checks the Victory Score), 358.5 (an illegal
 * action is rolled back entirely).
 *
 * Expected: (a) legal; P1 at 8 < 9 has not won; P2 — the only player left — wins with 5 points; status finished,
 * reason concede. (b) P1 wins at exactly 8 in the Beginning Phase; Ahri's trigger is still on the chain, never
 * resolves; no Channel/Draw follow. (c) both concedes are rejected, state byte-identical, winner stays P1, no
 * 'concede' game-over record appears.
 *
 * Harness note: a seat's action menu is only populated while it is the acting seat, so P1's out-of-turn concede in
 * (a) is sent as the raw engine move (`do("concede")`) after checking the engine enumerates it as valid for P1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ASPIRANTS_CLIMB = "ogn-276-298";
const AHRI = "ogn-066-298";

/**
 * (a) board: end of P2's turn 2. P1 at 7 holds Aspirant's Climb (live text) with a vanilla unit; P2 at 5 with a unit
 * in base. P2 ends turn → P1 holds → 8; P1's turn is then advanced into P2's Main Phase (turn 4).
 */
async function climbBoardAtP2Main(opts: { climb?: boolean } = {}): Promise<Game> {
  const b = scenario().turn(2).active(P2).points(P1, 7).points(P2, 5);
  if (opts.climb === false) {
    b.battlefield("plainBf", { controller: P1 });
    b.unit(P1, "plainBf", { might: 2, name: "Holder" }, "holder");
  } else {
    b.battlefield("climb", { controller: P1, def: ASPIRANTS_CLIMB, inert: false });
    b.unit(P1, "climb", { might: 2, name: "Holder" }, "holder");
  }
  b.unit(P2, "base", { might: 1, name: "P2 Grunt" }, "grunt");
  const game = await b.build();
  await game.p2.endTurn(); // → P1's Beginning Phase: hold → 8
  await game.settle();
  return game;
}

/** (b) board: end of P2's turn 2. P1 at `p1Points` controls bf1 with a lone Ahri; P2 at 3. No Aspirant's Climb. */
function ahriBoard(p1Points: number) {
  return scenario()
    .turn(2)
    .active(P2)
    .points(P1, p1Points)
    .points(P2, 3)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", AHRI, "ahri")
    .unit(P2, "base", { might: 1, name: "P2 Grunt" }, "grunt");
}

/** P2 ends turn → P1 holds bf1 with Ahri at 7 → 8: game over on the spot. */
async function ahriWon(): Promise<Game> {
  const game = await ahriBoard(7).build();
  await game.p2.endTurn();
  return game;
}

describe("Concede at 8 under Aspirant's Climb vs after Ahri already won at 8", () => {
  // ---- (a) Aspirant's Climb: 8 is not a win; conceding hands P2 the game with 5 --------------------------------

  test("(a) premise: with Aspirant's Climb in play P1 holding to 8 does NOT end the game (Victory Score is 9) — play continues into P2's Main Phase (194.3.a)", async () => {
    const game = await climbBoardAtP2Main();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(false);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 }); // Neutral Open, P2 acting
  });

  test("(a) control: the very same hold WITHOUT Aspirant's Climb wins P1 the game at 8 on the spot", async () => {
    const game = await climbBoardAtP2Main({ climb: false });
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("(a) conceding is legal for P1 at any time while the game is live — even off-turn in P2's Main Phase, even sitting on 8 (650): the engine enumerates it as a valid P1 move", async () => {
    const game = await climbBoardAtP2Main();
    await game.advanceTurn();
    const rows = game.engine.enumerateMoves(P1 as never, { moveIds: ["concede"], validOnly: false });
    expect(rows).toEqual([expect.objectContaining({ isValid: true, moveId: "concede", playerId: P1 })]);
    expect(game.p2.can("concede")).toBe(true); // and of course for the acting seat too
  });

  test("(a) P1 concedes → P2, the only player remaining, WINS with 5 points; P1 keeps its irrelevant 8; status finished, reason 'concede' by P1 (651.1, 195)", async () => {
    const game = await climbBoardAtP2Main();
    await game.advanceTurn();
    await game.p1.do("concede");
    expect(game.isOver()).toBe(true);
    expect(game.gameState.status).toBe("finished");
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(5);
    expect(game.p1.points()).toBe(8);
    expect(game.engine.getGameEndResult()).toEqual({ metadata: { concededBy: P1 }, reason: "concede", winner: P2 });
    expect(game.decision()).toBeNull();
    expect(game.p1.legal()).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
  });

  // ---- (b) Ahri: the Hold point wins at 8 before her trigger resolves --------------------------------------------

  test("(b) P1 at 7 holds bf1 with Ahri: the Hold point makes 8 and Ahri's 'When I hold' trigger is put on the chain — and the game is ALREADY over: P1 wins at exactly 8, still in the Beginning Phase (469.2, 471.2.b, 323.1)", async () => {
    const game = await ahriWon();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.gameState.status).toBe("finished");
    expect(game.winner()).toBe(P1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, triggered: true })]);
  });

  test("(b) Ahri's trigger never resolves and nothing follows: no priority window for P2, no Channel (0 runes), no Draw (hand unchanged), P1 finishes on 8 not 9", async () => {
    const game = await ahriBoard(7).build();
    const hand = game.p1.hand().length;
    const runes = game.p1.runes().length;
    await game.p2.endTurn();
    expect(game.decision()).toBeNull();
    expect(game.p2.decision()).toBeNull();
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.runes()).toHaveLength(runes);
    expect(game.chain()).toHaveLength(1); // still sitting there, unresolved
    expect(game.p2.points()).toBe(3);
  });

  test("(b) contrast from 6: Hold → 7 (not a win), Ahri's trigger resolves → 8 → P1 wins on her point instead — so at 7 it really is the Hold point, not Ahri, that ends it", async () => {
    const game = await ahriBoard(6).build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", triggered: true })]);
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.chain()).toEqual([]);
  });

  test("(b) the Final-Point restriction is Conquer-only: a HOLD may score the 8th point (471.1.b)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 7)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
  });

  // ---- (c) conceding after the game is over -----------------------------------------------------------------------

  test("(c) after P1 has won, P1's concede is not a legal action: not on any menu, the raw move is rejected, state byte-identical, winner still P1 (650 presupposes a game in progress; 358.5)", async () => {
    const game = await ahriWon();
    const before = game.stateHash();
    expect(game.p1.can("concede")).toBe(false);
    expect(game.engine.enumerateMoves(P1 as never, { moveIds: ["concede"], validOnly: true })).toEqual([]);
    await expect(game.p1.concede()).rejects.toThrow();
    const raw = await game.p1.try((p) => p.do("concede"));
    expect(raw.ok).toBe(false);
    expect(game.stateHash()).toBe(before);
    expect(game.winner()).toBe(P1);
    expect(game.gameState.status).toBe("finished");
  });

  test("(c) …then P2's concede is rejected the same way: no state change, P1 remains the winner by points, P2 does not get to 'lose differently'", async () => {
    const game = await ahriWon();
    await game.p1.try((p) => p.do("concede"));
    const before = game.stateHash();
    expect(game.p2.can("concede")).toBe(false);
    expect(game.engine.enumerateMoves(P2 as never, { moveIds: ["concede"], validOnly: true })).toEqual([]);
    await expect(game.p2.concede()).rejects.toThrow();
    const raw = await game.p2.try((p) => p.do("concede"));
    expect(raw.ok).toBe(false);
    expect(game.stateHash()).toBe(before);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(3);
  });

  test("(c) exactly one game-over: no 'concede' end record is ever written over the points victory, nobody is marked removed/conceded, and the harness reports game-over with no decision for anyone", async () => {
    const game = await ahriWon();
    await game.p1.try((p) => p.do("concede"));
    await game.p2.try((p) => p.do("concede"));
    expect(game.engine.getGameEndResult()?.reason).not.toBe("concede");
    expect((game.gameState as { removedPlayers?: string[] }).removedPlayers ?? []).toEqual([]);
    expect(game.winner()).toBe(P1);
    expect(game.isOver()).toBe(true);
    expect(game.decision()).toBeNull();
    expect(game.p1.legal()).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
    expect((await game.settle()).reason).toBe("game-over");
    expect(game.violations()).toEqual([]);
  });

  test("(c) same protection on the concede path of (a): once P1 has conceded, a second concede (by either seat) is rejected and the record stays 'P1 conceded, P2 won'", async () => {
    const game = await climbBoardAtP2Main();
    await game.advanceTurn();
    await game.p1.do("concede");
    const before = game.stateHash();
    expect((await game.p1.try((p) => p.do("concede"))).ok).toBe(false);
    expect((await game.p2.try((p) => p.do("concede"))).ok).toBe(false);
    expect(game.stateHash()).toBe(before);
    expect(game.winner()).toBe(P2);
    expect(game.engine.getGameEndResult()).toEqual({ metadata: { concededBy: P1 }, reason: "concede", winner: P2 });
  });
});
