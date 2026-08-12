/**
 * Interaction: conceding at the two moments the engine has no ordinary move to accept —
 * (a) while the OPPONENT holds an open prompt, and (b)/(c) between games, when no game exists.
 *
 *   Bottled Constellation (ven-067-166) Gear · 10 [mind][mind]
 *     "At the start of your Main Phase, you may kill 3 other friendly units and/or gear to score
 *      1 point."                                     ← a base cost whose OBJECTS are picked at FIN
 *   Trinity Force  (sfd-115-221) Equipment · 4 · [Equip] [body] · "When I hold, score 1 point."
 *   Wraith of Echoes (ogn-118-298) Unit · 6 [mind] · 5 [Might]
 *     "The first time a friendly unit dies each turn, draw 1."   ← the death-watcher
 *
 * Rules: 650 (a player may concede at ANY time) · 651 / 651.1 / 651.3 (the conceder is removed;
 * in a duel the other seat Wins) · 652 (removal pipeline) · 196 (the game ends immediately) ·
 * 358.5 (an abandoned choice is abandoned as a WHOLE — nothing half-performed) · 486.6 (a Bo3
 * resets the game state between games: the old engine is gone).
 *
 * Q: (a) P1 is on 7 of 8 and their Bottled Constellation prompt is open, asking which three
 *    friendly permanents to kill. P2 concedes right then. Is the concede legal for a seat that
 *    holds neither priority nor the pending Decision? Are the kills performed, is the point
 *    scored, does Wraith of Echoes trigger, and does P1 finish on 7 or 8?
 *    (b) Between games (game 2's battlefield-select / sideboard window): which of concede_game /
 *    concede_match is legal, and what happens to the pending pregame? (c) same during the mulligan.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { matchSummary } from "../../../../../../apps/riftbound-app/server/match-state";
import {
  createGameFromDecks,
  handlePregameMessage,
  runBotPregame,
} from "../../../../../../apps/riftbound-app/server/pregame";
import { type GameSession, type WsData, gameSessions } from "../../../../../../apps/riftbound-app/server/state";
import { gameWsMessage } from "../../../../../../apps/riftbound-app/server/ws-game";

const BOTTLED_CONSTELLATION = "ven-067-166";
const TRINITY_FORCE = "sfd-115-221";
const WRAITH_OF_ECHOES = "ogn-118-298";

// ---------------------------------------------------------------------------------------------
// (a) mid-prompt concede — engine level, through the agent harness
// ---------------------------------------------------------------------------------------------

/**
 * P1's turn is about to start on 7 of 8 points, with Bottled Constellation in play and four legal
 * cost objects: two vanilla units, the Wraith (which watches for the first friendly death) and a
 * Trinity Force equipped to Alpha.
 */
async function atTheOpenPrompt(): Promise<Game> {
  const game = await scenario()
    .active(P1)
    .points(P1, 7)
    .victoryScore(8)
    .gear(P1, BOTTLED_CONSTELLATION, "bottle")
    .unit(P1, "base", { might: 2, name: "Alpha" }, "u1")
    .unit(P1, "base", { might: 2, name: "Beta" }, "u2")
    .unit(P1, "base", WRAITH_OF_ECHOES, "wraith")
    .hand(P1, TRINITY_FORCE, "trinity")
    .resources(P1, { energy: 6, power: { body: 2 } })
    .build();
  await game.p1.play("trinity");
  await game.p1.choose("equipCard:-", { params: { equipmentId: "trinity", unitId: "u1" } });
  await game.settle();
  await game.advanceTurn(); // → P2's turn
  await game.advanceTurn(); // → P1's Main Phase: the trigger fires
  await game.p1.yes(); // take the offer → now name the three cost objects
  return game;
}

describe("(a) P2 concedes while P1's cost-object prompt is open", () => {
  test("the prompt is a forced 3-of-4 pick for P1 — and concede is STILL legal for P2, who holds neither priority nor the Decision (650)", async () => {
    const game = await atTheOpenPrompt();
    expect(game.decision()).toMatchObject({ kind: "pick", max: 3, min: 3, seat: P1, timing: "FIN" });
    const opts = (game.decision() as { options: readonly { card?: string; key: string }[] }).options;
    expect(opts.map((o) => o.card ?? o.key).sort()).toEqual(["trinity", "u1", "u2", "wraith"]);

    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.legal()).toEqual([]); // P2 has no ordinary move to make…
    expect(game.p2.can("concede")).toBe(true); // …yet 650 is unconditional
  });

  test("conceding ends the game at once (196/651.1): P1 Wins, the half-made choice is abandoned as a whole (358.5) — nothing is killed and NO point is scored", async () => {
    const game = await atTheOpenPrompt();
    const handBefore = game.p1.hand().length;
    await game.p2.concede();

    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(7); // the cost was never paid, so the point was never scored
    expect(game.zoneOf("u1")).toBe("base");
    expect(game.zoneOf("u2")).toBe("base");
    expect(game.zoneOf("wraith")).toBe("base");
    expect(game.zoneOf("trinity")).toBe("base");
    expect(game.state("u1").attachments).toEqual(["trinity"]); // still attached to a living unit
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(handBefore); // Wraith of Echoes never triggered: nothing died
  });

  test("no Decision survives the concede and NEITHER seat is offered a move (651.3 / 196)", async () => {
    const game = await atTheOpenPrompt();
    await game.p2.concede();
    expect(game.decision() ?? null).toBeNull();
    expect(game.p1.legal()).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the end record names the concession and the conceder", async () => {
    const game = await atTheOpenPrompt();
    await game.p2.concede();
    const end = (game.backend.engine as unknown as {
      getGameEndResult?: () => { reason?: string; winner?: string; metadata?: { concededBy?: string } };
    }).getGameEndResult?.();
    expect(end).toMatchObject({ metadata: { concededBy: P2 }, reason: "concede", winner: P1 });
  });
});

// ---------------------------------------------------------------------------------------------
// (b)/(c) between games — the match/session layer (apps/riftbound-app/server/match.ts)
// ---------------------------------------------------------------------------------------------

interface Frame {
  type: string;
  match?: ReturnType<typeof matchSummary>;
  pregame?: Record<string, unknown> | null;
  error?: string;
  errorCode?: string;
}

const BASE_DECK = buildDefaultDeck();
/** P1 registers Bottled Constellation as a sideboard card, so game 2 opens a sideboard window. */
const SIDEBOARD = [BOTTLED_CONSTELLATION];

function client(session: GameSession, gameId: string, playerId: string) {
  const frames: Frame[] = [];
  const ws = {
    close: () => undefined,
    data: { connId: `${playerId}-${gameId}`, gameId, playerId },
    send: (s: string) => {
      frames.push(JSON.parse(s) as Frame);
    },
  } as unknown as ServerWebSocket<WsData>;
  session.clients.set(`${playerId}-${gameId}`, { playerId, ws });
  return {
    frames,
    last: (type?: string) => [...frames].reverse().find((f) => !type || f.type === type),
    send: (msg: Record<string, unknown>) => gameWsMessage(ws, msg),
    ws,
  };
}

const made: string[] = [];
let seq = 0;
afterEach(() => {
  for (const id of made.splice(0)) {
    gameSessions.delete(id);
  }
});

/** A registered Bo3 sandbox session (P2 is the Goldfish bot) with a sideboard registered for P1. */
function newMatch() {
  const gameId = `concede-pregame-${++seq}`;
  const session = createGameFromDecks(
    { ...BASE_DECK, sideboardCardIds: SIDEBOARD },
    buildDefaultDeck("calm", "mind"),
    gameId,
    { firstPlayer: P1, gameMode: "match", names: { [P1]: "Tester", [P2]: "Goldfish" }, sandbox: true },
  );
  gameSessions.set(gameId, session);
  made.push(gameId);
  return { c1: client(session, gameId, P1), gameId, session };
}

/** Drive the current pregame all the way to a playing game. */
async function playOut(session: GameSession, gameId: string, c1: ReturnType<typeof client>) {
  for (let i = 0; i < 12 && session.pregame; i++) {
    const pg = session.pregame;
    await runBotPregame(session, { gameId });
    if (pg.phase === "battlefield_select" && !pg.battlefieldSelections[P1]) {
      const free = (pg.battlefieldOptions[P1] ?? []).find((id) => !(pg.battlefieldExcluded?.[P1] ?? []).includes(id));
      handlePregameMessage(c1.ws, { battlefieldId: free, type: "pregame_battlefield_select" }, session, gameId, P1);
    } else if (pg.phase === "sideboard" && !pg.sideboard?.[P1]?.locked) {
      handlePregameMessage(c1.ws, { type: "sideboard_lock" }, session, gameId, P1);
    } else if (pg.phase === "initiative") {
      const chooser = pg.initiative?.chooser as string;
      if (chooser === P1) {
        handlePregameMessage(c1.ws, { choice: "self", type: "pregame_choose_first" }, session, gameId, P1);
      }
    } else if (pg.phase === "mulligan" && !session.pregame?.mulliganComplete.has(P1)) {
      handlePregameMessage(c1.ws, { sendBack: [], type: "pregame_mulligan" }, session, gameId, P1);
    }
  }
  expect(session.pregame).toBeUndefined();
  expect(session.engine.getState().status).toBe("playing");
}

/** Game 1 conceded, Continue voted: the session is sitting in game 2's pregame at `phase`. */
async function inGame2Pregame(phase: "battlefield_select" | "sideboard" | "mulligan") {
  const m = newMatch();
  await playOut(m.session, m.gameId, m.c1);
  m.c1.send({ type: "concede_game" });
  m.c1.send({ type: "match_continue" });
  expect(m.session.pregame?.phase).toBe("battlefield_select");
  for (let i = 0; i < 12 && m.session.pregame && m.session.pregame.phase !== phase; i++) {
    const pg = m.session.pregame;
    await runBotPregame(m.session, { gameId: m.gameId });
    if (pg.phase === "battlefield_select" && !pg.battlefieldSelections[P1]) {
      const free = (pg.battlefieldOptions[P1] ?? []).find((id) => !(pg.battlefieldExcluded?.[P1] ?? []).includes(id));
      handlePregameMessage(m.c1.ws, { battlefieldId: free, type: "pregame_battlefield_select" }, m.session, m.gameId, P1);
    } else if (pg.phase === "sideboard" && !pg.sideboard?.[P1]?.locked) {
      handlePregameMessage(m.c1.ws, { type: "sideboard_lock" }, m.session, m.gameId, P1);
    } else if (pg.phase === "initiative") {
      const chooser = pg.initiative?.chooser as string;
      if (chooser === P1) {
        handlePregameMessage(m.c1.ws, { choice: "self", type: "pregame_choose_first" }, m.session, m.gameId, P1);
      }
    }
  }
  expect(m.session.pregame?.phase).toBe(phase);
  return m;
}

describe("(b)/(c) conceding between games, when there is no game to concede", () => {
  test("(b) game 2's sideboard window: the swap is open, concede_game is refused (GAME_NOT_STARTED) — 486.6 already threw game 1's engine away", async () => {
    const m = await inGame2Pregame("sideboard");
    const side = m.session.pregame?.sideboard?.[P1] as unknown as { locked: boolean; side: { defId: string }[] };
    expect(side.locked).toBe(false);
    expect(side.side.map((c) => c.defId)).toContain(BOTTLED_CONSTELLATION);

    m.c1.send({ type: "concede_game" });
    expect(m.c1.last()?.errorCode).toBe("GAME_NOT_STARTED");
    expect(m.session.pregame).toBeDefined(); // the refusal changed nothing
  });

  test("(b) concede_match IS accepted there: the pending pregame is DROPPED, the match ends, and it goes out as a full sync frame", async () => {
    const m = await inGame2Pregame("sideboard");
    m.c1.send({ type: "concede_match" });

    expect(m.session.pregame).toBeUndefined(); // no game 2 is ever seated
    const over = m.c1.last("match_over");
    expect(over?.match).toMatchObject({ concededBy: P1, decided: true, gameNumber: 2, winner: P2 });
    // No game is running, so the board goes out as a full `sync` (pregame null), not a state_update.
    expect(m.c1.last("sync")?.pregame).toBeNull();
    expect(m.session.log.some((l) => /Tester conceded the match/.test(l.text))).toBe(true);
    expect(m.session.match?.continueVotes).toEqual([]);
  });

  test("(c) identical during game 2's mulligan: concede_game refused, concede_match ends the match", async () => {
    const m = await inGame2Pregame("mulligan");
    m.c1.send({ type: "concede_game" });
    expect(m.c1.last()?.errorCode).toBe("GAME_NOT_STARTED");

    m.c1.send({ type: "concede_match" });
    expect(m.session.pregame).toBeUndefined();
    expect(m.c1.last("match_over")?.match).toMatchObject({ concededBy: P1, decided: true, winner: P2 });
  });

  test("once the match is conceded every later concession is refused (MATCH_OVER)", async () => {
    const m = await inGame2Pregame("battlefield_select");
    m.c1.send({ type: "concede_match" });
    m.c1.send({ type: "concede_match" });
    expect(m.c1.last()?.errorCode).toBe("MATCH_OVER");
    m.c1.send({ type: "concede_game" });
    expect(m.c1.last()?.errorCode).toBe("MATCH_OVER");
  });
});
