/**
 * Sandbox pregame: the bot seat (Goldfish / Claude) answers every pregame
 * decision it can face server-side — its Bo3 battlefield (rule 486.5; Claude
 * via one bounded model call, else / on timeout a seeded pick), a no-change
 * sideboard lock-in, the mulligan alongside the human's, and "go first" when
 * it wins the initiative roll — so a solo Match never hangs at "Waiting for
 * opponent". Leaving during the pregame abandons the match and frees the lobby.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ServerWebSocket } from "bun";

// Isolated throwaway DB — must be set before the repo modules load.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rb-pregame-bot-test-"));
process.env.RIFTBOUND_DB_PATH ??= path.join(TMP_DIR, "test.db");

const { closeDb } = await import("../../src/db/schema");
const { buildDefaultDeck } = await import("../decks");
const { createLobby } = await import("../routes-lobby");
const { lobbyWsMessage } = await import("../ws-lobby");
const { gameSessions, lobbies, lobbyByCode } = await import("../state");
const { ClaudeOpponent } = await import("../ai-opponent");
const { createGameFromDecks, handlePregameMessage, runBotPregame, selectBattlefield } = await import("../pregame");

type WsData = import("../state").WsData;
type GameSession = import("../state").GameSession;
type ModelRequest = import("../ai-opponent").ModelRequest;
type CallModel = import("../ai-opponent").CallModel;

const P1 = "player-1";
const P2 = "player-2";
const BASE = buildDefaultDeck();

let prevMock: string | undefined;
beforeAll(() => {
  prevMock = process.env.RB_AI_MOCK;
  process.env.RB_AI_MOCK = "1"; // Claude seats without a key (first-legal provider)
});
afterAll(() => {
  if (prevMock === undefined) {delete process.env.RB_AI_MOCK;} else {process.env.RB_AI_MOCK = prevMock;}
  closeDb();
  fs.rmSync(TMP_DIR, { force: true, recursive: true });
});

function fakeLobbyWs(lobbyId: string, role: "host" | "guest" = "host") {
  const sent: Record<string, unknown>[] = [];
  let closed = false;
  const ws = {
    close() { closed = true; },
    data: { connId: `c-${crypto.randomUUID()}`, gameId: "", lobbyId, lobbyRole: role, playerId: "", userId: null } satisfies WsData,
    send(s: string) { sent.push(JSON.parse(s) as Record<string, unknown>); },
  } as unknown as ServerWebSocket<WsData>;
  return { isClosed: () => closed, sent, ws };
}

function fakeGameWs(session: GameSession, playerId: string, gameId = "g") {
  const sent: Record<string, unknown>[] = [];
  let closed = false;
  const connId = `c-${crypto.randomUUID()}`;
  const ws = {
    close() { closed = true; },
    data: { connId, gameId, playerId },
    send(s: string) { sent.push(JSON.parse(s) as Record<string, unknown>); },
  } as unknown as ServerWebSocket<WsData>;
  session.clients.set(connId, { playerId, ws });
  return { isClosed: () => closed, sent, ws };
}

/** Force the next d20 rolls: each value v yields floor(v*20)+1. */
function withRolls<T>(values: number[], fn: () => T): T {
  const real = Math.random;
  let i = 0;
  Math.random = () => (i < values.length ? (values[i++] as number) : real());
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

/** create (sandbox) → select starter → start (rolls forced) → choose_first if the host won ⇒ lobby + session. */
function startSolo(opts: { gameMode?: "duel" | "match"; opponent?: Record<string, unknown>; rolls?: number[] } = {}) {
  const res = createLobby({ gameMode: opts.gameMode ?? "match", name: "Tester", opponent: opts.opponent ?? { kind: "goldfish" }, sandbox: true }, null);
  expect(res.status).toBe(200);
  const { lobbyId } = res.body as { lobbyId: string };
  const lobby = lobbies.get(lobbyId)!;
  const host = fakeLobbyWs(lobbyId);
  lobby.host.ws = host.ws;
  lobbyWsMessage(host.ws, { deckId: "default", type: "select_deck" });
  withRolls(opts.rolls ?? [0.99, 0.1], () => lobbyWsMessage(host.ws, { type: "start_game" }));
  if (lobby.coinFlip && !lobby.coinFlip.firstPlayer) {
    lobbyWsMessage(host.ws, { choice: "self", type: "choose_first" });
  }
  const session = lobby.gameId ? gameSessions.get(lobby.gameId) : undefined;
  return { host, lobby, lobbyId, session: session as GameSession };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("Bo3 vs Goldfish: the bot seat picks its battlefield server-side", () => {
  test("after start_game the Goldfish has already locked one of ITS three battlefields; the human's pick then reaches the mulligan", async () => {
    const { lobby, session } = startSolo({ gameMode: "match" });
    expect(lobby.status).toBe("started");
    expect(session.pregame?.phase).toBe("battlefield_select");
    await tick(); // the kick from startLobbyGame resolves on the microtask queue
    const botPick = session.pregame?.battlefieldSelections[P2];
    expect(BASE.battlefieldIds).toContain(botPick as string);
    expect(session.pregame?.battlefieldSelections[P1]).toBeUndefined();
    expect(session.pregame?.phase).toBe("battlefield_select"); // still waiting for the HUMAN, not the bot
    expect(session.log.some((e) => /picked a battlefield at random/.test(e.text))).toBe(true);

    // Match: the lobby did NOT roll — battlefields come first (rule 113 / 486.5), then the roll (115) in the pregame.
    expect(lobby.coinFlip).toBeNull();
    expect(session.log.some((e) => /rolled a d20/.test(e.text))).toBe(false);
    const me = fakeGameWs(session, P1, lobby.gameId as string);
    // Both battlefields locked → d20 roll (forced: the Goldfish rolls higher) → it elects to go first → mulligan.
    withRolls([0.1, 0.99], () => expect(handlePregameMessage(me.ws, { battlefieldId: BASE.battlefieldIds[1], type: "pregame_battlefield_select" }, session, lobby.gameId as string, P1)).toBe(true));
    expect(session.pregame?.phase).toBe("mulligan");
    expect(session.pregame?.initiative).toMatchObject({ chooser: P2, decided: true, kind: "roll", p1Roll: 3, p2Roll: 20 });
    expect(session.pregame?.firstPlayer).toBe(P2);
    expect(session.log.some((e) => /Goldfish wins initiative \(20 vs 3\)/.test(e.text))).toBe(true);
    expect(session.log.some((e) => /Goldfish won the roll and chooses to go first/.test(e.text))).toBe(true);
    const frame = me.sent.at(-1) as { type: string; pregame: { phase: string; battlefieldSelected: string; firstPlayer: string; initiative: { decided: boolean } } };
    expect(frame.type).toBe("sync");
    expect(frame.pregame.phase).toBe("mulligan");
    expect(frame.pregame.firstPlayer).toBe(P2);
    expect(frame.pregame.initiative.decided).toBe(true);
    expect(frame.pregame.battlefieldSelected).toBe(BASE.battlefieldIds[1] as string);

    // Mulligan: the human's decision completes the bot's too → game on.
    handlePregameMessage(me.ws, { sendBack: [], type: "pregame_mulligan" }, session, lobby.gameId as string, P1);
    expect(session.pregame).toBeUndefined();
    expect(session.engine.getState().status).toBe("playing");
  });

  test("Bo3 order when the HUMAN rolls higher: battlefield_select → initiative (waits for the human's pregame_choose_first; hands not drawn yet) → mulligan", async () => {
    const { lobby, session } = startSolo({ gameMode: "match" });
    await tick();
    const me = fakeGameWs(session, P1, lobby.gameId as string);
    withRolls([0.99, 0.1], () => handlePregameMessage(me.ws, { battlefieldId: BASE.battlefieldIds[0], type: "pregame_battlefield_select" }, session, lobby.gameId as string, P1));
    expect(session.pregame?.phase).toBe("initiative");
    expect(session.pregame?.initiative).toMatchObject({ chooser: P1, decided: false, p1Roll: 20, p2Roll: 3 });
    expect(session.pregame?.handsDrawn).toBe(false);
    const frame = me.sent.at(-1) as { pregame: { phase: string; firstPlayer: string | null; initiative: { chooser: string; p1Roll: number; p2Roll: number } } };
    expect(frame.pregame).toMatchObject({ firstPlayer: null, initiative: { chooser: P1, p1Roll: 20, p2Roll: 3 }, phase: "initiative" });
    // The bot may not answer for the human.
    await runBotPregame(session);
    expect(session.pregame?.phase).toBe("initiative");
    expect(handlePregameMessage(me.ws, { choice: "opponent", type: "pregame_choose_first" }, session, lobby.gameId as string, P1)).toBe(true);
    expect(session.pregame?.phase).toBe("mulligan");
    expect(session.pregame?.firstPlayer).toBe(P2);
    expect(session.pregame?.handsDrawn).toBe(true);
    // A second answer is refused.
    handlePregameMessage(me.ws, { choice: "self", type: "pregame_choose_first" }, session, lobby.gameId as string, P1);
    expect((me.sent.at(-1) as { errorCode?: string }).errorCode).toBe("CHOOSE_FIRST");
    expect(session.pregame?.firstPlayer).toBe(P2);
  });

  test("the seeded pick is deterministic per game seed and is not always the same battlefield across seeds", async () => {
    const picks = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const s = createGameFromDecks(BASE, BASE, `bot-bf-${i}`, { gameMode: "match", sandbox: true });
      await runBotPregame(s);
      picks.add(s.pregame?.battlefieldSelections[P2] as string);
      const again = createGameFromDecks(BASE, BASE, `bot-bf-${i}`, { gameMode: "match", sandbox: true });
      await runBotPregame(again);
      expect(again.pregame?.battlefieldSelections[P2]).toBe(s.pregame?.battlefieldSelections[P2] as string);
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  test("human first, bot second also completes; runBotPregame is idempotent (a second call is a no-op) and non-sandbox games are untouched", async () => {
    const s = createGameFromDecks(BASE, BASE, "bot-order", { gameMode: "match", sandbox: true });
    expect(selectBattlefield(s, P1, BASE.battlefieldIds[0]).ok).toBe(true);
    expect(s.pregame?.phase).toBe("battlefield_select");
    await runBotPregame(s);
    expect(s.pregame?.phase).toBe("mulligan");
    const logLen = s.log.length;
    await runBotPregame(s);
    expect(s.log.length).toBe(logLen);

    const pvp = createGameFromDecks(BASE, BASE, "pvp", { gameMode: "match", sandbox: false });
    await runBotPregame(pvp);
    expect(pvp.pregame?.battlefieldSelections).toEqual({});
  });

  test("with a sideboard on the human's deck: bot battlefield → sideboard phase with the bot already locked; the human's lock reaches the mulligan", async () => {
    const side = ["ogn-005-298", "ogn-008-298"].filter((id) => !BASE.mainDeckCardIds.includes(id));
    const s = createGameFromDecks({ ...BASE, sideboardCardIds: side }, BASE, "bot-sb", { gameMode: "match", gameNumber: 2, sandbox: true });
    await runBotPregame(s);
    expect(selectBattlefield(s, P1, BASE.battlefieldIds[2]).ok).toBe(true);
    expect(s.pregame?.phase).toBe("sideboard");
    expect(s.pregame?.sideboard?.[P2]?.locked).toBe(true);
    const me = fakeGameWs(s, P1);
    expect(handlePregameMessage(me.ws, { type: "sideboard_lock" }, s, "g", P1)).toBe(true);
    expect(s.pregame?.phase).toBe("mulligan");
  });
});

describe("Bo3 vs Claude (mocked model): asked once with its three battlefields + both legends; timeout → seeded fallback", () => {
  test("the model's index is honoured and narrated; the prompt lists the three battlefields and both legends", async () => {
    const s = createGameFromDecks(BASE, buildDefaultDeck("calm", "mind"), "claude-bf", { gameMode: "match", sandbox: true });
    const calls: ModelRequest[] = [];
    const callModel: CallModel = async (req) => {
      calls.push(req);
      return { input: { index: 2, rationale: "suits my tempo plan" }, name: "choose" };
    };
    s.opponent = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { backoffMs: 0, callModel, lookupTools: [], pacingMs: 0 });
    s.playerNames = { ...s.playerNames, [P2]: "Claude Haiku 4.5" };
    await runBotPregame(s);
    expect(calls).toHaveLength(1);
    const user = calls[0]!.messages[0]!.content as string;
    expect(user).toContain("486.5");
    for (const id of s.decks![P2]!.battlefieldIds) {
      expect(user).toContain(id.length > 0 ? (await import("../cards")).registry.get(id)!.name : "");
    }
    expect(user).toContain("Your legend:");
    expect(user).toContain("Opponent's legend:");
    expect(calls[0]!.meta.menu).toHaveLength(3);
    expect(calls[0]!.tool_choice).toEqual({ name: "choose", type: "tool" });
    expect(s.pregame?.battlefieldSelections[P2]).toBe(s.decks![P2]!.battlefieldIds[2] as string);
    expect(s.log.some((e) => /chose its battlefield: .* — 'suits my tempo plan'/.test(e.text))).toBe(true);
    // Human picks → mulligan.
    expect(selectBattlefield(s, P1, BASE.battlefieldIds[0]).ok).toBe(true);
    expect(s.pregame?.phase).toBe("mulligan");
  });

  test("model never answers → after pregameTimeoutMs the seat falls back to a seeded pick (noted in the log) and the game still reaches the mulligan", async () => {
    const s = createGameFromDecks(BASE, BASE, "claude-timeout", { gameMode: "match", sandbox: true });
    let aborted = false;
    const callModel: CallModel = (_req, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => { aborted = true; reject(Object.assign(new Error("aborted"), { name: "AbortError" })); });
    });
    s.opponent = new ClaudeOpponent("sonnet", "sk-ant-api03-testkeytestkey", { backoffMs: 0, callModel, lookupTools: [], pacingMs: 0, pregameTimeoutMs: 150 });
    const t0 = Date.now();
    await runBotPregame(s);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(aborted).toBe(true);
    expect(BASE.battlefieldIds).toContain(s.pregame?.battlefieldSelections[P2] as string);
    expect(s.log.some((e) => /model timed out — battlefield picked at random/.test(e.text))).toBe(true);
    expect((s.opponent as InstanceType<typeof ClaudeOpponent>).thinking).toBe(false);
    expect(selectBattlefield(s, P1, BASE.battlefieldIds[0]).ok).toBe(true);
    expect(s.pregame?.phase).toBe("mulligan");
  });

  test("an out-of-range index from the model is treated as a failure → seeded fallback", async () => {
    const s = createGameFromDecks(BASE, BASE, "claude-bad", { gameMode: "match", sandbox: true });
    const callModel: CallModel = async () => ({ input: { index: 7, rationale: "?" }, name: "choose" });
    s.opponent = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { callModel, lookupTools: [] });
    await runBotPregame(s);
    expect(BASE.battlefieldIds).toContain(s.pregame?.battlefieldSelections[P2] as string);
    expect(s.log.some((e) => /invalid choice from the model/.test(e.text))).toBe(true);
  });

  test("through the lobby (RB_AI_MOCK first-legal provider): a vs-Claude Bo3 start leaves the Claude seat with a battlefield already chosen", async () => {
    const { session } = startSolo({ gameMode: "match", opponent: { kind: "claude", model: "haiku" } });
    expect(session.opponent?.info.kind).toBe("claude");
    for (let i = 0; i < 20 && !session.pregame?.battlefieldSelections[P2]; i++) {await tick();}
    expect(session.pregame?.battlefieldSelections[P2]).toBe(session.decks![P2]!.battlefieldIds[0] as string); // mock = index 0
  });
});

describe("initiative roll vs a bot: no rigging; a bot that wins elects to go first", () => {
  test("host rolls higher → lobby waits for the host's choose_first (as before)", () => {
    const res = createLobby({ gameMode: "duel", name: "T", sandbox: true }, null);
    const lobby = lobbies.get((res.body as { lobbyId: string }).lobbyId)!;
    const host = fakeLobbyWs(lobby.id);
    lobby.host.ws = host.ws;
    lobbyWsMessage(host.ws, { deckId: "default", type: "select_deck" });
    withRolls([0.99, 0.1], () => lobbyWsMessage(host.ws, { type: "start_game" }));
    expect(lobby.coinFlip).toMatchObject({ firstPlayer: "", p1Roll: 20, p2Roll: 3, winner: P1 });
    expect(lobby.status).toBe("waiting");
    lobbyWsMessage(host.ws, { choice: "opponent", type: "choose_first" });
    expect(lobby.status).toBe("started");
    expect(gameSessions.get(lobby.gameId as string)?.pregame?.firstPlayer).toBe(P2);
  });

  test("bot rolls higher → it chooses to go first and the game starts immediately (no choose_first needed); the log says so", () => {
    const res = createLobby({ gameMode: "duel", name: "T", sandbox: true }, null);
    const lobby = lobbies.get((res.body as { lobbyId: string }).lobbyId)!;
    const host = fakeLobbyWs(lobby.id);
    lobby.host.ws = host.ws;
    lobbyWsMessage(host.ws, { deckId: "default", type: "select_deck" });
    withRolls([0.1, 0.99], () => lobbyWsMessage(host.ws, { type: "start_game" }));
    expect(lobby.coinFlip).toMatchObject({ firstPlayer: P2, p1Roll: 3, p2Roll: 20, winner: P2 });
    expect(lobby.status).toBe("started");
    const session = gameSessions.get(lobby.gameId as string)!;
    expect(session.pregame?.firstPlayer).toBe(P2);
    expect(session.log.some((e) => /wins initiative \(20 vs 3\)/.test(e.text))).toBe(true);
    const last = host.sent.at(-1) as { lobby: { status: string; coinFlip: { firstPlayer: string; winner: string } } };
    expect(last.lobby.status).toBe("started");
    expect(last.lobby.coinFlip).toMatchObject({ firstPlayer: P2, winner: P2 });
    // A late choose_first from the host is ignored.
    lobbyWsMessage(host.ws, { choice: "self", type: "choose_first" });
    expect(session.pregame?.firstPlayer).toBe(P2);
  });
});

describe("Leave match during the pregame", () => {
  test("leave_game while choosing battlefields: every client gets game_ended, sockets close, the session is dropped and the lobby (code) is freed", async () => {
    const { lobby, lobbyId, session } = startSolo({ gameMode: "match" });
    const gameId = lobby.gameId as string;
    const code = lobby.code;
    expect(gameSessions.has(gameId)).toBe(true);
    expect(lobbyByCode.get(code)).toBe(lobbyId);
    const me = fakeGameWs(session, P1, gameId);
    expect(handlePregameMessage(me.ws, { type: "leave_game" }, session, gameId, P1)).toBe(true);
    expect(me.sent.some((m) => m.type === "game_ended" && m.reason === "host_left" && m.pregame === true)).toBe(true);
    expect(me.isClosed()).toBe(true);
    expect(gameSessions.has(gameId)).toBe(false);
    expect(lobbies.has(lobbyId)).toBe(false);
    expect(lobbyByCode.has(code)).toBe(false);
    expect(session.pregame).toBeUndefined();
    // A bot decision that resolves after the human left is dropped silently.
    await runBotPregame(session);
  });

  test("leave_lobby from the host before the game exists (roll screen) deletes the lobby; from a guest it reopens the seat and voids the roll", () => {
    const res = createLobby({ gameMode: "duel", name: "Host" }, null);
    const lobby = lobbies.get((res.body as { lobbyId: string }).lobbyId)!;
    const host = fakeLobbyWs(lobby.id, "host");
    const guest = fakeLobbyWs(lobby.id, "guest");
    lobby.host.ws = host.ws;
    lobby.guest = { connId: "g", deckId: "default", name: "Guest", ready: true, ws: guest.ws };
    lobbyWsMessage(host.ws, { deckId: "default", type: "select_deck" });
    withRolls([0.99, 0.1], () => lobbyWsMessage(host.ws, { type: "start_game" }));
    expect(lobby.coinFlip).not.toBeNull();
    lobbyWsMessage(guest.ws, { type: "leave_lobby" });
    expect(lobby.guest).toBeNull();
    expect(lobby.coinFlip).toBeNull();
    expect(guest.isClosed()).toBe(true);
    expect(lobbies.has(lobby.id)).toBe(true);
    lobbyWsMessage(host.ws, { type: "leave_lobby" });
    expect(lobbies.has(lobby.id)).toBe(false);
    expect(lobbyByCode.has(lobby.code)).toBe(false);
  });
});
