/**
 * In-memory server state: lobby + game session maps, their types, cleanup
 * timers, and small broadcast helpers.
 */

import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "@tcg/riftbound";
import type { RuleEngine } from "@tcg/core";
import type { Server, ServerWebSocket } from "bun";
import type { LogEntry } from "../src/narrator";
import type { OpponentDeckSpec } from "./opponent-deck";

export type Engine = RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>;

/** Context passed to every route handler. */
export interface RouteCtx {
  server: Server;
}

/**
 * A route handler resolves to a Response, or `null` if the route is not its
 * own. (WebSocket upgrade handlers resolve to `undefined` after a successful
 * upgrade, matching what Bun.serve's fetch expects — so callers must test
 * `!== null`, not truthiness.)
 */
export type RouteResult = Promise<Response | null>;
export type RouteHandler = (req: Request, url: URL, ctx: RouteCtx) => RouteResult;

// ========================================
// Lobby System
// ========================================

export interface LobbyPlayer {
  name: string;
  connId: string;
  ws: ServerWebSocket<WsData> | null;
  deckId: string | null; // Selected deck ID or "preset" for auto-generated
  ready: boolean;
}

export interface Lobby {
  id: string;
  code: string; // Short joinable code
  host: LobbyPlayer;
  guest: LobbyPlayer | null;
  status: "waiting" | "ready" | "started";
  gameId: string | null; // Set when game starts
  sandbox: boolean; // Hot-seat mode — host controls both players
  gameMode: "duel" | "match"; // Bo1 duel or Bo3 match
  /** D20 roll result: both rolls, who won, and who they chose to go first */
  coinFlip: { winner: string; firstPlayer: string; p1Roll: number; p2Roll: number } | null;
  createdAt: number;
  /** Solo opponent for sandbox lobbies (Goldfish or a Claude seat). In-memory only; never broadcast. */
  opponent?: OpponentHandle;
  /**
   * Which deck the auto-joined practice seat plays (server/opponent-deck.ts):
   * validated against the host's ownership at create / select time; "mirror"
   * follows the host's own pick. Absent ⇒ starter deck.
   */
  opponentDeck?: OpponentDeckSpec;
}

/** Public description of the solo opponent — safe to ship in snapshots (no key material). */
export interface OpponentInfo {
  kind: "goldfish" | "claude";
  /** Model key (haiku | sonnet | opus) for a Claude seat. */
  model?: string;
  /** Display label ("Goldfish", "Claude Sonnet 5"). */
  label: string;
}

/**
 * The AI seat's driver (server/ai-opponent.ts ClaudeOpponent). Typed
 * structurally here so state.ts stays import-free of the driver; the API key
 * lives in a #private field of the implementation and is never reachable
 * through this handle.
 */
export interface OpponentHandle {
  readonly info: OpponentInfo;
  /** True while an AI step loop is in flight for this game. */
  readonly busy: boolean;
  /** True while waiting on the model (drives the client's "thinking" pill). */
  readonly thinking: boolean;
  act(session: GameSession): Promise<void>;
  toJSON(): OpponentInfo;
}

export const lobbies = new Map<string, Lobby>(); // Keyed by lobby ID
export const lobbyByCode = new Map<string, string>(); // Code → lobby ID

export function generateLobbyCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I/O/0/1 to avoid confusion
  let code = "";
  for (let i = 0; i < 4; i++) {code += chars[Math.floor(Math.random() * chars.length)];}
  // Ensure unique
  if (lobbyByCode.has(code)) {return generateLobbyCode();}
  return code;
}

export function broadcastLobby(lobby: Lobby) {
  const state = {
    lobby: {
      code: lobby.code,
      coinFlip: lobby.coinFlip,
      gameId: lobby.gameId,
      gameMode: lobby.gameMode,
      guest: lobby.guest ? { hasDeck: Boolean(lobby.guest.deckId), name: lobby.guest.name, ready: lobby.guest.ready } : null,
      host: { hasDeck: Boolean(lobby.host.deckId), name: lobby.host.name, ready: lobby.host.ready },
      id: lobby.id,
      ...(lobby.sandbox ? { opponentDeck: { deckId: lobby.opponentDeck?.deckId, deckName: lobby.opponentDeck?.deckName, mode: lobby.opponentDeck?.mode ?? "default" } } : {}),
      sandbox: lobby.sandbox,
      status: lobby.status,
    },
    type: "lobby_update",
  };
  const data = JSON.stringify(state);
  try { lobby.host.ws?.send(data); } catch { /* */ }
  try { lobby.guest?.ws?.send(data); } catch { /* */ }
}

// Clean up stale lobbies every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, lobby] of lobbies) {
    if (now - lobby.createdAt > 30 * 60 * 1000 && lobby.status !== "started") {
      lobbyByCode.delete(lobby.code);
      lobbies.delete(id);
    }
  }
}, 5 * 60 * 1000);

// Clean up game sessions with no connected clients for 10+ minutes
export const sessionLastActivity = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of gameSessions) {
    if (session.clients.size === 0) {
      const lastActive = sessionLastActivity.get(id) ?? now;
      if (now - lastActive > 10 * 60 * 1000) {
        gameSessions.delete(id);
        sessionLastActivity.delete(id);
      }
    } else {
      sessionLastActivity.set(id, now);
    }
  }
}, 60 * 1000);

// ========================================
// Game Engine Sessions
// ========================================

/** One card in a sideboarding list: engine instance id + card definition id. */
export interface SideboardCardRef {
  id: string;
  defId: string;
}

/**
 * Per-seat sideboarding state (server/pregame.ts "Sideboarding"). `main` /
 * `side` are the CURRENT (post-swap) lists; a card's origin is readable from
 * its instance id (`-main-` vs `-side-`). Never sent to the other seat.
 */
export interface SideboardSeatState {
  main: SideboardCardRef[];
  side: SideboardCardRef[];
  locked: boolean;
  /** The deck this seat registered (for the opponent's public reveal + Bo3 carry-over). */
  deck: DeckConfig;
}

export interface PregameState {
  phase: "battlefield_select" | "sideboard" | "mulligan" | "ready";
  gameMode: "duel" | "match";
  firstPlayer: string;
  secondPlayer: string;
  /** Each player's available battlefield definition IDs (from their deck) */
  battlefieldOptions: Record<string, string[]>;
  /** Each player's selected battlefield card ID (once chosen) */
  battlefieldSelections: Record<string, string>;
  /**
   * rule 485.5 — true when the GAME picked each player's battlefield at random
   * (Duel / Bo1, seeded engine RNG): the client shows "Battlefield selected at
   * random: X" instead of a picker. Match (486.5) and the sandbox's Bo3 keep
   * the manual choice.
   */
  battlefieldRandom?: boolean;
  /** Players who have completed their mulligan decision */
  mulliganComplete: Set<string>;
  /** Whether this is a sandbox (hotseat) game */
  sandbox: boolean;
  /**
   * Sideboarding (tournament policy, not Core Rules — see server/pregame.ts):
   * present only when at least one seat registered a non-empty sideboard, in
   * which case the opening hands are drawn when every seat has locked in.
   */
  sideboard?: Record<string, SideboardSeatState>;
}

export interface GameSession {
  engine: Engine;
  players: [string, string];
  /** Display names keyed by player ID */
  playerNames: Record<string, string>;
  log: LogEntry[];
  /** Connected WebSocket clients for this game, keyed by a connection ID */
  clients: Map<string, { ws: ServerWebSocket<WsData>; playerId: string }>;
  /** Monotonic sequence number for ordering messages */
  seq: number;
  /** Pregame state — present until game transitions to "playing" */
  pregame?: PregameState;
  /** Whether this is a sandbox (goldfish) game */
  sandbox: boolean;
  /**
   * Solo opponent driver for sandbox games. Absent / kind "goldfish" → the
   * passive Goldfish policy in turn.ts; kind "claude" → server/ai-opponent.ts.
   */
  opponent?: OpponentHandle;
  /**
   * Each seat's deck as it stands after sideboarding (main/side post-swap),
   * recorded when the sideboard phase completes. A Bo3 follow-up game should
   * be created from these so game 2 starts from the game-1 configuration.
   */
  postSideboardDecks?: Record<string, DeckConfig>;
  /** Each seat's registered deck (as passed to createGameFromDecks) — lets the AI seat describe ITS list. */
  decks?: Record<string, DeckConfig>;
}

/** Data attached to each WebSocket connection */
export interface WsData {
  gameId: string;
  playerId: string;
  connId: string;
  /** If this is a lobby connection rather than a game connection */
  lobbyId?: string;
  lobbyRole?: "host" | "guest";
  /** Authenticated user behind a lobby socket (from the upgrade request's session), for deck ownership checks. */
  userId?: string | null;
}

/** Deck configuration for creating a game */
export interface DeckConfig {
  /** Card definition IDs for the main deck (40 cards) */
  mainDeckCardIds: string[];
  /** Card definition IDs for the rune deck (12 runes) */
  runeDeckCardIds: string[];
  /** Battlefield card definition IDs (2-3) */
  battlefieldIds: string[];
  /** Card definition ID for the Champion Legend (placed in Legend Zone) */
  legendId?: string;
  /** Card definition ID for the Chosen Champion (placed in Champion Zone) */
  championId?: string;
  /**
   * Optional sideboard (up to MAX_SIDEBOARD_SIZE main-deck-type cards). A
   * non-empty sideboard on either seat enables the pregame `sideboard` phase;
   * absent/empty ⇒ the flow is unchanged.
   */
  sideboardCardIds?: string[];
}

export const gameSessions = new Map<string, GameSession>();

/** Broadcast a message to all WebSocket clients in a game session */
export function broadcast(session: GameSession, msg: Record<string, unknown>, exclude?: string) {
  const data = JSON.stringify(msg);
  for (const [connId, client] of session.clients) {
    if (connId !== exclude) {
      try { client.ws.send(data); } catch { /* Client may have disconnected */ }
    }
  }
}

/** Send a message to a specific WebSocket client */
export function sendTo(session: GameSession, connId: string, msg: Record<string, unknown>) {
  const client = session.clients.get(connId);
  if (client) {
    try { client.ws.send(JSON.stringify(msg)); } catch { /* Ignore */ }
  }
}

/** Get zone/card data from engine's internal state */
export function getInternalSnapshot(engine: Engine) {
  // Access private internalState for zone/card rendering
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private field for UI rendering
  const internal = (engine as unknown as Record<string, unknown>).internalState as {
    zones: Record<string, { config: unknown; cardIds: string[] }>;
    cards: Record<string, { definitionId: string; owner: string; controller: string; zone: string; position?: number }>;
    cardMetas: Record<string, RiftboundCardMeta>;
  };
  return internal;
}
