/**
 * Goldfish — passive vs active (`opponent: {kind:"goldfish", mode}` on
 * /api/lobby/create).
 *
 *  - passive (default, today's behaviour): the auto-pass Goldfish driver runs
 *    player-2; the host's socket keeps its seat (`switch_seat` refused) and a
 *    player-2 move sent from it is refused/ignored.
 *  - active ("hot seat"): NO driver — the host plays both seats. The lobby is
 *    `hotSeat`, the roll winner's go-first choice is answered by the host for
 *    either seat, the bot-pregame hook never picks for player-2, the host's game
 *    socket may `switch_seat` and then submit player-2's battlefield pick,
 *    mulligan and moves through the ordinary per-seat handlers, each seat's
 *    view redacts the OTHER seat's hand, and Rewind takes back one action of
 *    whichever seat made it.
 */

import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ServerWebSocket } from "bun";

// Isolated throwaway DB — must be set before the repo modules load.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rb-goldfish-mode-test-"));
process.env.RIFTBOUND_DB_PATH ??= path.join(TMP_DIR, "test.db");

const { closeDb } = await import("../../src/db/schema");
const { buildDefaultDeck } = await import("../decks");
const { createLobby } = await import("../routes-lobby");
const { lobbyWsMessage } = await import("../ws-lobby");
const { gameSessions, lobbies, lobbyView } = await import("../state");
const { parseOpponentSpec } = await import("../ai-opponent");
const { runBotPregame } = await import("../pregame");
const { gameWsMessage, gameWsOpen } = await import("../ws-game");
const { applySessionMove } = await import("../turn");

type WsData = import("../state").WsData;
type GameSession = import("../state").GameSession;

const P1 = "player-1";
const P2 = "player-2";
const BASE = buildDefaultDeck();

afterAll(() => {
  closeDb();
  fs.rmSync(TMP_DIR, { force: true, recursive: true });
});

interface Frame {
  type: string;
  error?: string;
  errorCode?: string;
  seat?: string;
  hotSeat?: boolean;
  moveId?: string;
  moves?: { moveId: string; params: Record<string, unknown>; playerId: string }[];
  pregame?: { phase: string; battlefieldSelected: string | null; battlefieldOptions: { id: string }[]; mulliganComplete: string[]; sandbox: boolean } | null;
  state?: { hotSeat?: boolean; playerNames: Record<string, string>; turn: { activePlayer: string; number: number }; log: { text: string }[]; zones: Record<string, { id: string; owner: string; definitionId: string; name: string }[]> };
  rewind?: { steps: number };
}

function fakeLobbyWs(lobbyId: string, role: "host" | "guest" = "host") {
  const sent: Record<string, unknown>[] = [];
  const ws = {
    close() { /* */ },
    data: { connId: `c-${crypto.randomUUID()}`, gameId: "", lobbyId, lobbyRole: role, playerId: "", userId: null } satisfies WsData,
    send(s: string) { sent.push(JSON.parse(s) as Record<string, unknown>); },
  } as unknown as ServerWebSocket<WsData>;
  return { sent, ws };
}

/** A game socket the way the server creates one on upgrade (`?player=`), opened through gameWsOpen. */
function openGameWs(gameId: string, playerId: string) {
  const frames: Frame[] = [];
  const ws = {
    close() { /* */ },
    data: { connId: `c-${crypto.randomUUID()}`, gameId, playerId } as WsData,
    send(s: string) { frames.push(JSON.parse(s) as Frame); },
  } as unknown as ServerWebSocket<WsData>;
  gameWsOpen(ws);
  const last = (type?: string) => [...frames].reverse().find((f) => !type || f.type === type);
  return { frames, last, ws };
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

function startSolo(opts: { gameMode?: "duel" | "match"; opponent?: Record<string, unknown>; rolls?: number[]; choice?: "self" | "opponent" } = {}) {
  const res = createLobby({ gameMode: opts.gameMode ?? "duel", name: "Tester", opponent: opts.opponent ?? { kind: "goldfish" }, sandbox: true }, null);
  expect(res.status).toBe(200);
  const { lobbyId } = res.body as { lobbyId: string };
  const lobby = lobbies.get(lobbyId)!;
  const host = fakeLobbyWs(lobbyId);
  lobby.host.ws = host.ws;
  lobbyWsMessage(host.ws, { deckId: "default", type: "select_deck" });
  withRolls(opts.rolls ?? [0.99, 0.1], () => lobbyWsMessage(host.ws, { type: "start_game" }));
  if (lobby.coinFlip && !lobby.coinFlip.firstPlayer) {
    lobbyWsMessage(host.ws, { choice: opts.choice ?? "self", type: "choose_first" });
  }
  const session = lobby.gameId ? gameSessions.get(lobby.gameId) : undefined;
  return { gameId: lobby.gameId as string, host, lobby, session: session as GameSession };
}

/** Answer start-of-turn prompts / priority for both seats so the turn player sits in an open Main Phase. */
function settleToMain(session: GameSession): void {
  for (let i = 0; i < 40; i++) {
    if (session.engine.getState().status !== "playing") {return;}
    let acted = false;
    for (const seat of [P1, P2]) {
      const legal = session.engine.enumerateMoves(seat as never, { moveIds: ["resolvePendingChoice", "passChainPriority", "passShowdownFocus"], validOnly: true });
      const pick = legal[0];
      if (pick) {
        expect(applySessionMove(session, seat, pick.moveId, { ...(pick.params as Record<string, unknown>) }).success).toBe(true);
        acted = true;
        break;
      }
    }
    if (!acted) {return;}
  }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("opponent spec: goldfish mode", () => {
  test("absent → passive; 'active' / 'passive' accepted; anything else → 400", () => {
    expect(parseOpponentSpec({ kind: "goldfish" })).toEqual({ ok: true, spec: { kind: "goldfish", mode: "passive" } });
    expect(parseOpponentSpec({ kind: "goldfish", mode: "passive" })).toEqual({ ok: true, spec: { kind: "goldfish", mode: "passive" } });
    expect(parseOpponentSpec({ kind: "goldfish", mode: "active" })).toEqual({ ok: true, spec: { kind: "goldfish", mode: "active" } });
    expect(parseOpponentSpec({ mode: "active" })).toEqual({ ok: true, spec: { kind: "goldfish", mode: "active" } });
    expect(parseOpponentSpec({ kind: "goldfish", mode: "aggressive" })).toMatchObject({ ok: false, status: 400 });
    expect(createLobby({ opponent: { kind: "goldfish", mode: 7 }, sandbox: true }, null).status).toBe(400);
  });
});

describe("Goldfish — active: the host plays both seats", () => {
  test("lobby is hotSeat, seat 2 is named 'Player 2', the session gets NO driver and the bot-pregame hook never picks for player-2 (Bo3)", async () => {
    const { lobby, session } = startSolo({ gameMode: "match", opponent: { kind: "goldfish", mode: "active" } });
    expect(lobby.hotSeat).toBe(true);
    expect(lobbyView(lobby, "host").hotSeat).toBe(true);
    expect(lobby.guest?.name).toBe("Player 2");
    expect(session.hotSeat).toBe(true);
    expect(session.sandbox).toBe(true); // still a practice game (sandbox tools, REST hooks)
    expect(session.opponent).toBeUndefined();
    expect(session.pregame?.sandbox).toBe(false); // no bot answers pregame decisions
    expect(session.pregame?.phase).toBe("battlefield_select");
    await tick();
    await runBotPregame(session);
    expect(session.pregame?.battlefieldSelections).toEqual({});
    expect(session.log.some((e) => /picked a battlefield at random/.test(e.text))).toBe(false);
  });

  test("player-2 wins the roll → the game does NOT auto-start; the HOST answers choose_first for player-2 ('self' = the winner goes first)", () => {
    const p2wins = startSolo({ choice: "self", opponent: { kind: "goldfish", mode: "active" }, rolls: [0.1, 0.99] });
    expect(p2wins.lobby.coinFlip?.winner).toBe(P2);
    expect(p2wins.lobby.status).toBe("started");
    expect(p2wins.lobby.coinFlip?.firstPlayer).toBe(P2);
    const p2defers = startSolo({ choice: "opponent", opponent: { kind: "goldfish", mode: "active" }, rolls: [0.1, 0.99] });
    expect(p2defers.lobby.coinFlip?.firstPlayer).toBe(P1);
    // Passive Goldfish keeps today's rule: the bot that wins elects to go first, no prompt.
    const passive = startSolo({ opponent: { kind: "goldfish" }, rolls: [0.1, 0.99] });
    expect(passive.lobby.coinFlip?.firstPlayer).toBe(P2);
    expect(passive.host.sent.some((m) => m.type === "lobby_update" && (m.lobby as { status: string }).status === "started")).toBe(true);
  });

  test("host socket: switch_seat → player-2's own view; player-2 battlefield pick + both mulligans go through the per-seat handlers; then a player-2 MOVE is accepted and nothing auto-plays player-1", async () => {
    const { gameId, session } = startSolo({ choice: "opponent", gameMode: "match", opponent: { kind: "goldfish", mode: "active" } });
    expect(session.pregame?.firstPlayer).toBe(P2); // host chose: player-2 goes first
    const sock = openGameWs(gameId, P1);
    const hello = sock.last("sync")!;
    expect(hello.hotSeat).toBe(true);
    expect(hello.state?.hotSeat).toBe(true);
    expect(hello.pregame?.phase).toBe("battlefield_select");
    await tick();
    expect(session.pregame?.battlefieldSelections[P2]).toBeUndefined(); // the connect-time kick did nothing

    // Player-1 picks (as itself)…
    gameWsMessage(sock.ws, { battlefieldId: BASE.battlefieldIds[0], type: "pregame_battlefield_select" });
    expect(session.pregame?.battlefieldSelections[P1]).toBe(BASE.battlefieldIds[0] as string);
    await tick();
    expect(session.pregame?.battlefieldSelections[P2]).toBeUndefined(); // …and player-2 is still owed BY THE HUMAN
    expect(session.pregame?.phase).toBe("battlefield_select");

    // switch_seat → the socket now speaks for player-2 and got player-2's pregame payload.
    gameWsMessage(sock.ws, { playerId: P2, requestId: "sw1", type: "switch_seat" });
    const swapped = sock.last("sync")!;
    expect(swapped.seat).toBe(P2);
    expect(sock.ws.data.playerId).toBe(P2);
    expect([...session.clients.values()].map((c) => c.playerId)).toEqual([P2]);
    expect(swapped.pregame?.battlefieldSelected).toBeNull();
    expect(swapped.pregame?.battlefieldOptions.map((o) => o.id)).toEqual(session.pregame?.battlefieldOptions[P2] as string[]);
    gameWsMessage(sock.ws, { battlefieldId: session.pregame?.battlefieldOptions[P2]?.[1], type: "pregame_battlefield_select" });
    expect(session.pregame?.phase).toBe("mulligan");
    expect(session.log.some((e) => /^Player 2 locked in a battlefield/.test(e.text))).toBe(true);

    // Mulligan: player-2's decision does NOT complete player-1's (no bot) — switch back and answer it too.
    gameWsMessage(sock.ws, { sendBack: [], type: "pregame_mulligan" });
    expect(session.pregame?.mulliganComplete.has(P2)).toBe(true);
    expect(session.pregame?.mulliganComplete.has(P1)).toBe(false);
    expect(session.pregame?.phase).toBe("mulligan");
    gameWsMessage(sock.ws, { playerId: P1, type: "switch_seat" });
    expect(sock.last("sync")!.pregame?.mulliganComplete).toEqual([P2]);
    gameWsMessage(sock.ws, { sendBack: [], type: "pregame_mulligan" });
    expect(session.pregame).toBeUndefined();
    expect(session.engine.getState().status).toBe("playing");
    expect(session.engine.getState().turn.activePlayer).toBe(P2); // nothing ended player-2's turn for it

    // Per-seat hidden information: acting as player-1 the human sees ITS hand, not player-2's — and vice versa.
    const asP1 = sock.last("sync")!.state!;
    const p1HandForP1 = asP1.zones.hand!.filter((c) => c.owner === P1);
    const p2HandForP1 = asP1.zones.hand!.filter((c) => c.owner === P2);
    expect(p1HandForP1.length).toBeGreaterThan(0);
    expect(p1HandForP1.every((c) => c.definitionId !== "" && !c.id.startsWith("hidden-"))).toBe(true);
    expect(p2HandForP1.length).toBeGreaterThan(0);
    expect(p2HandForP1.every((c) => c.definitionId === "" && c.id.startsWith("hidden-"))).toBe(true);
    gameWsMessage(sock.ws, { playerId: P2, type: "switch_seat" });
    const asP2 = sock.last("sync")!.state!;
    expect(asP2.zones.hand!.filter((c) => c.owner === P2).every((c) => c.definitionId !== "")).toBe(true);
    expect(asP2.zones.hand!.filter((c) => c.owner === P1).every((c) => c.id.startsWith("hidden-"))).toBe(true);

    // A player-2 MOVE from the (host's) socket: end player-2's turn. Accepted; the turn passes to
    // player-1 and STAYS there — no Goldfish driver ends player-1's turn or passes for anyone.
    settleToMain(session);
    expect(session.engine.getState().turn.activePlayer).toBe(P2);
    const movesP2 = sock.last()!.moves ?? [];
    void movesP2;
    gameWsMessage(sock.ws, { moveId: "endTurn", params: { playerId: P2 }, requestId: "m1", type: "move" });
    const accepted = sock.last()!;
    expect(accepted.type).toBe("move_accepted");
    settleToMain(session);
    const after = session.engine.getState();
    expect(after.turn.activePlayer).toBe(P1);
    expect(session.log.some((e) => /ended their turn|passed priority/.test(e.text) && /Goldfish/.test(e.text))).toBe(false);
    expect(session.engine.getReplayHistory().some((h) => (h.context?.params as { sandboxAuto?: boolean } | undefined)?.sandboxAuto === true)).toBe(false);

    // Rewind in the hot seat: one action per click, whichever seat made it (no Goldfish skip-over).
    gameWsMessage(sock.ws, { playerId: P1, type: "switch_seat" });
    const turnBefore = session.engine.getState().turn.number;
    gameWsMessage(sock.ws, { type: "undo" });
    const rw = sock.last("state_update")!;
    expect(rw.rewind?.steps).toBe(1);
    expect(session.engine.getState().turn.number).toBeLessThanOrEqual(turnBefore);

    // Unknown seat → error, binding unchanged.
    gameWsMessage(sock.ws, { playerId: "player-3", type: "switch_seat" });
    expect(sock.last()!.type).toBe("error");
    expect(sock.ws.data.playerId).toBe(P1);
  });
});

describe("Goldfish — passive (default): unchanged", () => {
  test("driver attached: the Goldfish ends its own turn back to the human; switch_seat is refused; a player-2 move from the host socket is refused/ignored", () => {
    const { gameId, session } = startSolo({ opponent: { kind: "goldfish", mode: "passive" } });
    expect(session.hotSeat).toBeUndefined();
    expect(session.pregame?.sandbox).toBe(true);
    const sock = openGameWs(gameId, P1);
    expect(sock.last("sync")!.hotSeat).toBeUndefined();
    // Human mulligan completes the Goldfish's too (today's behaviour).
    gameWsMessage(sock.ws, { sendBack: [], type: "pregame_mulligan" });
    expect(session.pregame).toBeUndefined();
    settleToMain(session);
    expect(session.engine.getState().turn.activePlayer).toBe(P1);

    // switch_seat: refused, seat unchanged.
    gameWsMessage(sock.ws, { playerId: P2, type: "switch_seat" });
    const refused = sock.last()!;
    expect(refused.type).toBe("error");
    expect(refused.errorCode).toBe("NOT_HOT_SEAT");
    expect(sock.ws.data.playerId).toBe(P1);

    // A player-2 move from the player-1 socket: not applied for player-2 (refused or ignored) — the turn is still player-1's.
    const histLen = session.engine.getReplayHistory().length;
    gameWsMessage(sock.ws, { moveId: "endTurn", params: { playerId: P2 }, requestId: "x", type: "move" });
    const st = session.engine.getState();
    expect(st.turn.activePlayer === P1 || sock.last()!.type === "move_rejected").toBe(true);
    if (sock.last()!.type === "move_rejected") {
      expect(session.engine.getReplayHistory().length).toBe(histLen);
    }

    // The human ends the turn → the Goldfish driver plays player-2's turn straight back.
    gameWsMessage(sock.ws, { moveId: "endTurn", params: { playerId: P1 }, requestId: "e1", type: "move" });
    expect(sock.last("move_accepted")?.moveId).toBe("endTurn");
    settleToMain(session);
    // Either the Goldfish already ended its turn (back to player-1) or it is parked on a human-owed prompt; it never needs a seat switch.
    const active = session.engine.getState().turn.activePlayer;
    expect(session.log.some((e) => /Goldfish (ended their turn|passed priority|resolved a choice|passed focus)/.test(e.text)) || active === P1).toBe(true);
  });
});
