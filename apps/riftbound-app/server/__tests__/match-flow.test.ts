/**
 * Match play (server/match.ts + match-state.ts + the `initiative` pregame step
 * in server/pregame.ts):
 *  - Bo3 vs Goldfish: concede_game → score 0–1, game 2 is rebuilt in place
 *    (fresh engine, sideboard window open, used battlefields excluded — rule
 *    486.5 —, the game-1 LOSER choosing who goes first), the bot seat completes
 *    its game-2 pregame; winning games 2 and 3 → match_over 2–1.
 *  - concede_match at any point (mid-game, between games) → match_over now.
 *  - Bo1: a concession ends the match; Rematch rebuilds game 1.
 *  - Two humans: Continue needs both seats; the loser (a human) gets the choice.
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import { buildDefaultDeck } from "../decks";
import { matchSummary } from "../match-state";
import { createGameFromDecks, finalizePregame, handlePregameMessage, runBotPregame, selectBattlefield } from "../pregame";
import { type GameSession, type WsData, gameSessions } from "../state";
import { gameWsMessage } from "../ws-game";

const P1 = "player-1";
const P2 = "player-2";
const BASE = buildDefaultDeck();
const SIDE = ["ogn-005-298", "ogn-008-298"];

interface Frame { type: string; match?: ReturnType<typeof matchSummary>; pregame?: Record<string, unknown> | null; error?: string; errorCode?: string; state?: { status: string; log: { text: string }[] } }

function client(session: GameSession, gameId: string, playerId: string) {
  const frames: Frame[] = [];
  const ws = { close: () => undefined, data: { connId: `${playerId}-${gameId}`, gameId, playerId }, send: (s: string) => { frames.push(JSON.parse(s) as Frame); } } as unknown as ServerWebSocket<WsData>;
  session.clients.set(`${playerId}-${gameId}`, { playerId, ws });
  return { frames, last: (type?: string) => [...frames].reverse().find((f) => !type || f.type === type), send: (msg: Record<string, unknown>) => gameWsMessage(ws, msg), ws };
}

const made: string[] = [];
let seq = 0;
afterEach(() => { for (const id of made.splice(0)) {gameSessions.delete(id);} });

/** A registered Bo3 (or Bo1) session; `sandbox` seats the Goldfish on player-2. */
function newMatch(opts: { gameMode?: "duel" | "match"; sandbox?: boolean; sideboard?: boolean } = {}) {
  const gameId = `match-${++seq}`;
  const d1 = opts.sideboard ? { ...BASE, sideboardCardIds: SIDE } : BASE;
  const session = createGameFromDecks(d1, buildDefaultDeck("calm", "mind"), gameId, {
    firstPlayer: P1,
    gameMode: opts.gameMode ?? "match",
    names: { [P1]: "Tester", [P2]: opts.sandbox === false ? "Bob" : "Goldfish" },
    sandbox: opts.sandbox ?? true,
  });
  gameSessions.set(gameId, session);
  made.push(gameId);
  const c1 = client(session, gameId, P1);
  const c2 = client(session, gameId, P2);
  return { c1, c2, gameId, session };
}

/** Drive the current pregame to a playing game: battlefields (human picks its first free one), first player, sideboard lock, mulligans. */
async function playOut(session: GameSession, gameId: string, c1: ReturnType<typeof client>, c2?: ReturnType<typeof client>) {
  for (let i = 0; i < 12 && session.pregame; i++) {
    const pg = session.pregame;
    await runBotPregame(session, { gameId });
    if (pg.phase === "battlefield_select") {
      for (const [seat, c] of [[P1, c1], [P2, c2]] as const) {
        if (!c || pg.battlefieldSelections[seat] || (session.sandbox && seat === P2)) {continue;}
        const free = (pg.battlefieldOptions[seat] ?? []).find((id) => !(pg.battlefieldExcluded?.[seat] ?? []).includes(id));
        handlePregameMessage(c.ws, { battlefieldId: free, type: "pregame_battlefield_select" }, session, gameId, seat);
      }
    } else if (pg.phase === "sideboard") {
      for (const [seat, c] of [[P1, c1], [P2, c2]] as const) {
        if (c && pg.sideboard?.[seat] && !pg.sideboard[seat].locked) {handlePregameMessage(c.ws, { type: "sideboard_lock" }, session, gameId, seat);}
      }
    } else if (pg.phase === "initiative") {
      const chooser = pg.initiative?.chooser as string;
      const c = chooser === P1 ? c1 : c2;
      if (c) {handlePregameMessage(c.ws, { choice: "self", type: "pregame_choose_first" }, session, gameId, chooser);}
    } else if (pg.phase === "mulligan") {
      for (const [seat, c] of [[P1, c1], [P2, c2]] as const) {
        if (c && session.pregame && !session.pregame.mulliganComplete.has(seat)) {handlePregameMessage(c.ws, { sendBack: [], type: "pregame_mulligan" }, session, gameId, seat);}
      }
    }
  }
  expect(session.pregame).toBeUndefined();
  expect(session.engine.getState().status).toBe("playing");
}

/** Simulate a points win for `winner` in the running game (the engine's own end path is covered elsewhere). */
function winByPoints(session: GameSession, winner: string) {
  session.engine.applyPatches([
    { op: "replace", path: ["players", winner, "victoryPoints"], value: 8 },
    { op: "replace", path: ["status"], value: "finished" },
    { op: "replace", path: ["winner"], value: winner },
  ]);
}

describe("Bo3 vs Goldfish", () => {
  test("game 1: concede_game → 0–1 game_over; Continue builds game 2 in place: fresh engine, sideboard window, used battlefields excluded (486.5), the game-1 loser (human) chooses first; bot completes its pregame", async () => {
    const { c1, gameId, session } = newMatch({ sideboard: true });
    expect(session.pregame?.phase).toBe("battlefield_select");
    expect(session.pregame?.sideboard).toBeUndefined(); // never before game 1
    await playOut(session, gameId, c1);
    const engine1 = session.engine;
    const bf1 = { ...session.engine.getState().battlefields };
    expect(Object.keys(bf1)).toHaveLength(2);
    expect(matchSummary(session)).toMatchObject({ decided: false, format: "bo3", gameNumber: 1, score: { [P1]: 0, [P2]: 0 }, winsNeeded: 2 });

    c1.send({ type: "concede_game" });
    expect(session.engine.getState().status).toBe("finished");
    const over = c1.last("game_over");
    expect(over?.match).toMatchObject({ current: { concededBy: P1, finished: true, reason: "concede", winner: P2 }, decided: false, gameNumber: 1, score: { [P1]: 0, [P2]: 1 } });
    expect(c1.frames.some((f) => f.type === "match_over")).toBe(false);
    expect(session.log.some((l) => /Game 1: Goldfish wins by concession\. Match score: Tester 0 – 1 Goldfish/.test(l.text))).toBe(true);
    // Conceding again / continuing twice is harmless; concede_game on a finished game is refused.
    c1.send({ type: "concede_game" });
    expect(c1.last()?.errorCode).toBe("GAME_OVER");

    // Continue: sandbox ⇒ the human's vote suffices.
    c1.send({ type: "match_continue" });
    expect(session.engine).not.toBe(engine1); // nothing of game 1's state survives
    expect(session.gameNumber).toBe(2);
    expect(session.match?.games).toEqual([{ concededBy: P1, gameNumber: 1, reason: "concede", winner: P2 }]);
    const sync = c1.last("sync");
    expect(sync?.pregame).toMatchObject({ gameNumber: 2, phase: "battlefield_select" });
    expect(sync?.match).toMatchObject({ current: { finished: false }, gameNumber: 2, score: { [P1]: 0, [P2]: 1 } });
    expect((sync?.state?.log ?? session.log).some((l) => /Game 2 of the match · Tester 0 – 1 Goldfish/.test(l.text))).toBe(true);
    // rule 486.5: each seat's game-1 battlefield is listed as used and refused.
    const pg = session.pregame!;
    for (const pid of [P1, P2]) {
      const usedId = Object.keys(bf1).find((id) => id.startsWith(`${pid}-bf-`))!.slice(`${pid}-bf-`.length);
      expect(pg.battlefieldExcluded?.[pid]).toEqual([usedId]);
      expect(session.match?.usedBattlefields[pid]).toEqual([usedId]);
    }
    const usedMine = pg.battlefieldExcluded![P1]![0]!;
    expect((sync?.pregame?.battlefieldOptions as { id: string; used?: boolean }[]).find((b) => b.id === usedMine)?.used).toBe(true);
    expect(selectBattlefield(session, P1, usedMine)).toMatchObject({ ok: false });
    // The bot already picked one of its REMAINING battlefields.
    await runBotPregame(session, { gameId });
    expect(pg.battlefieldSelections[P2]).toBeDefined();
    expect(pg.battlefieldExcluded![P2]).not.toContain(pg.battlefieldSelections[P2]);
    // Human picks → sideboard window (game 2, human registered a sideboard; bot pre-locked) → lock → initiative: loser (P1) chooses.
    const free = BASE.battlefieldIds.find((id) => id !== usedMine)!;
    handlePregameMessage(c1.ws, { battlefieldId: free, type: "pregame_battlefield_select" }, session, gameId, P1);
    expect(pg.phase).toBe("sideboard");
    expect(pg.sideboard?.[P2]?.locked).toBe(true);
    // Hands are NOT drawn yet (rule 116 comes after the first-player decision, 115).
    handlePregameMessage(c1.ws, { type: "sideboard_lock" }, session, gameId, P1);
    expect(pg.phase).toBe("initiative");
    expect(pg.initiative).toMatchObject({ afterGame: 1, chooser: P1, decided: false, kind: "loser_chooses" });
    expect(pg.handsDrawn).toBe(false);
    expect(c1.last("sync")?.pregame).toMatchObject({ firstPlayer: null, initiative: { chooser: P1, decided: false, kind: "loser_chooses" }, phase: "initiative" });
    // Only the chooser may answer.
    handlePregameMessage(c1.ws, { choice: "self", type: "pregame_choose_first" }, session, gameId, P2);
    expect(c1.last()?.errorCode).toBe("CHOOSE_FIRST");
    handlePregameMessage(c1.ws, { choice: "opponent", type: "pregame_choose_first" }, session, gameId, P1);
    expect(pg.phase).toBe("mulligan");
    expect(pg.firstPlayer).toBe(P2);
    expect(pg.handsDrawn).toBe(true);
    expect(session.log.some((l) => /Chose Goldfish to take the first turn/.test(l.text))).toBe(true);
    handlePregameMessage(c1.ws, { sendBack: [], type: "pregame_mulligan" }, session, gameId, P1);
    expect(session.pregame).toBeUndefined();
    expect(session.engine.getState().status).toBe("playing");
    // Undo cannot cross the game boundary: the new engine has no history of game 1.
    expect(session.engine.getReplayHistory().every((e) => e.moveId !== "concede")).toBe(true);
  });

  test("win game 2 + game 3 after losing game 1 → match_over 2–1 with the winner; the bot chooses first for game 3 (it lost game 2); Rematch resets to game 1 / 0–0", async () => {
    const { c1, gameId, session } = newMatch();
    await playOut(session, gameId, c1);
    c1.send({ type: "concede_game" }); // 0–1
    c1.send({ type: "match_continue" });
    await playOut(session, gameId, c1); // game 2 (P1 lost game 1 → P1 chose)
    winByPoints(session, P1);
    c1.send({ type: "resync" }); // any frame path; then the announcement hook runs on the next move — drive it directly:
    c1.send({ moveId: "endTurn", params: { playerId: P1 }, type: "move" }); // rejected (finished) but harmless
    // Announce via the continue path: match_continue validates "finished" itself.
    expect(matchSummary(session)).toMatchObject({ decided: false, gameNumber: 2, score: { [P1]: 1, [P2]: 1 } });
    c1.send({ type: "match_continue" });
    expect(session.gameNumber).toBe(3);
    // Game 3: the bot lost game 2 → it is the chooser and elects to go first once the step is reached.
    expect(session.pregame?.initiative).toMatchObject({ afterGame: 2, chooser: P2, kind: "loser_chooses" });
    // Both seats have now used two battlefields → one free each.
    expect(session.pregame?.battlefieldExcluded?.[P1]).toHaveLength(2);
    await playOut(session, gameId, c1);
    expect(session.log.some((l) => /Goldfish lost game 2 and chooses to go first/.test(l.text))).toBe(true);
    expect(session.log.some((l) => /Chose Goldfish to take the first turn/.test(l.text))).toBe(true); // (the Goldfish then auto-plays its turn)
    winByPoints(session, P1);
    c1.send({ moveId: "concede", params: { playerId: P1 }, type: "move" }); // rejected: game already over
    // Trigger the announcement through the public hook (what ws-game does after every move).
    const { noteGameState } = await import("../match");
    noteGameState(session, gameId);
    const over = c1.last("match_over");
    expect(over?.match).toMatchObject({ decided: true, gameNumber: 3, score: { [P1]: 2, [P2]: 1 }, winner: P1 });
    expect(session.log.some((l) => /Tester wins the match 2–1/.test(l.text))).toBe(true);
    c1.send({ type: "match_continue" });
    expect(c1.last()?.errorCode).toBe("MATCH_OVER");
    // Rematch: a brand-new match in the same session.
    c1.send({ type: "match_rematch" });
    expect(session.gameNumber).toBe(1);
    expect(matchSummary(session)).toMatchObject({ decided: false, games: [], gameNumber: 1, score: { [P1]: 0, [P2]: 0 } });
    expect(session.pregame?.phase).toBe("battlefield_select");
    expect(session.pregame?.battlefieldExcluded).toBeUndefined();
    expect(session.pregame?.initiative).toMatchObject({ kind: "roll" });
  });

  test("concede_match mid-game → match_over immediately (game conceded too); between games (during game 2's pregame) → match_over, pregame dropped", async () => {
    const a = newMatch();
    await playOut(a.session, a.gameId, a.c1);
    a.c1.send({ type: "concede_match" });
    expect(a.session.engine.getState().status).toBe("finished");
    expect(a.c1.last("match_over")?.match).toMatchObject({ concededBy: P1, decided: true, score: { [P1]: 0, [P2]: 1 }, winner: P2 });
    expect(a.session.log.some((l) => /Tester conceded the match/.test(l.text))).toBe(true);
    a.c1.send({ type: "concede_game" });
    expect(a.c1.last()?.errorCode).toBe("MATCH_OVER");

    const b = newMatch();
    await playOut(b.session, b.gameId, b.c1);
    b.c1.send({ type: "concede_game" });
    b.c1.send({ type: "match_continue" });
    expect(b.session.pregame?.phase).toBe("battlefield_select");
    b.c1.send({ type: "concede_game" });
    expect(b.c1.last()?.errorCode).toBe("GAME_NOT_STARTED");
    b.c1.send({ type: "concede_match" });
    expect(b.session.pregame).toBeUndefined();
    const over = b.c1.last("match_over");
    expect(over?.match).toMatchObject({ concededBy: P1, decided: true, gameNumber: 2, winner: P2 });
    expect(b.c1.last("sync")?.pregame).toBeNull();
  });
});

describe("Bo1 and two-human matches", () => {
  test("Bo1: the legacy `concede` move ends the match (match_over, winsNeeded 1); Rematch rebuilds game 1", async () => {
    const { c1, gameId, session } = newMatch({ gameMode: "duel" });
    expect(session.pregame?.phase).toBe("mulligan");
    await playOut(session, gameId, c1);
    c1.send({ moveId: "concede", params: { playerId: P1 }, type: "move" });
    expect(c1.last("match_over")?.match).toMatchObject({ decided: true, format: "bo1", score: { [P1]: 0, [P2]: 1 }, winner: P2, winsNeeded: 1 });
    const engine1 = session.engine;
    c1.send({ type: "match_rematch" });
    expect(session.engine).not.toBe(engine1);
    expect(session.gameNumber).toBe(1);
    expect(session.pregame?.gameMode).toBe("duel");
  });

  test("two humans: Continue waits for both seats (match_update carries the votes); the human loser gets the first-player choice and hands wait for it", async () => {
    const { c1, c2, gameId, session } = newMatch({ sandbox: false });
    await playOut(session, gameId, c1, c2);
    c2.send({ type: "concede_game" }); // P2 concedes → 1–0
    expect(c1.last("game_over")?.match?.score).toEqual({ [P1]: 1, [P2]: 0 });
    c1.send({ type: "match_continue" });
    expect(session.gameNumber).toBe(1); // still waiting for P2
    expect(c2.last("match_update")?.match?.continueVotes).toEqual([P1]);
    c2.send({ type: "match_continue" });
    expect(session.gameNumber).toBe(2);
    const pg = session.pregame!;
    expect(pg.initiative).toMatchObject({ chooser: P2, kind: "loser_chooses" });
    handlePregameMessage(c1.ws, { battlefieldId: pg.battlefieldOptions[P1]!.find((id) => !(pg.battlefieldExcluded?.[P1] ?? []).includes(id)), type: "pregame_battlefield_select" }, session, gameId, P1);
    handlePregameMessage(c2.ws, { battlefieldId: pg.battlefieldOptions[P2]!.find((id) => !(pg.battlefieldExcluded?.[P2] ?? []).includes(id)), type: "pregame_battlefield_select" }, session, gameId, P2);
    expect(pg.phase).toBe("initiative");
    // No hands before the decision.
    const handCount = () => (session.engine as unknown as { internalState: { zones: { hand?: { cardIds: string[] } } } }).internalState.zones.hand?.cardIds.length ?? 0;
    expect(handCount()).toBe(0);
    handlePregameMessage(c2.ws, { choice: "self", type: "pregame_choose_first" }, session, gameId, P2);
    expect(pg.phase).toBe("mulligan");
    expect(pg.firstPlayer).toBe(P2);
    expect(handCount()).toBe(8);
  });

  test("createGameFromDecks {initiative:'roll'}: battlefields first, THEN the roll (both dice logged, higher roll is the chooser), then mulligan; finalize uses the chosen first player", () => {
    const s = createGameFromDecks(BASE, BASE, "ini-roll", { gameMode: "match", initiative: { kind: "roll" }, sandbox: false });
    expect(s.pregame?.phase).toBe("battlefield_select");
    expect(s.log.some((l) => /rolled a d20/.test(l.text))).toBe(false); // not rolled before battlefields
    selectBattlefield(s, P1, BASE.battlefieldIds[0]);
    selectBattlefield(s, P2, BASE.battlefieldIds[1]);
    expect(s.pregame?.phase).toBe("initiative");
    const ini = s.pregame!.initiative!;
    expect(ini.kind).toBe("roll");
    expect(ini.p1Roll).not.toBe(ini.p2Roll);
    expect(ini.chooser).toBe((ini.p1Roll as number) > (ini.p2Roll as number) ? P1 : P2);
    expect(s.log.some((l) => /wins initiative \(\d+ vs \d+\)/.test(l.text))).toBe(true);
    const { chooseFirstPlayer } = require("../pregame") as typeof import("../pregame");
    const loser = ini.chooser === P1 ? P2 : P1;
    expect(chooseFirstPlayer(s, loser, loser).ok).toBe(false);
    expect(chooseFirstPlayer(s, ini.chooser as string, loser).ok).toBe(true);
    expect(s.pregame?.phase).toBe("mulligan");
    expect(s.pregame?.firstPlayer).toBe(loser);
    s.pregame!.mulliganComplete.add(P1);
    s.pregame!.mulliganComplete.add(P2);
    finalizePregame(s);
    expect(s.engine.getState().status).toBe("playing");
  });
});
