/**
 * Riftbound App Server
 *
 * Bun HTTP server that provides:
 * - Static file serving for the UI
 * - REST API for deck builder and game engine
 * - Card image proxy (serves downloaded images)
 * - User auth + saved decks (SQLite)
 */

import { getAllCards, getCardRegistry } from "@tcg/riftbound-cards";
import type { Card } from "@tcg/riftbound-types/cards";
import { DeckBuilder, getGlobalCardRegistry, riftboundDefinition } from "@tcg/riftbound";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "@tcg/riftbound";
import { RuleEngine } from "@tcg/core";
import type { PlayerId } from "@tcg/core";
import * as fs from "node:fs";
import * as path from "node:path";
import { authenticateUser, createUser, getUserById } from "./src/db/user-repo";
import { createDeck, deleteDeck, getDeck, listDecks, listPublicDecks, updateDeck } from "./src/db/deck-repo";
import type { DeckCardEntry, FullDeck, GameVersion } from "./src/db/deck-repo";
import { GameLogger } from "./src/game-logger";

/** Sets that belong to each game version. Preview is a superset of standard. */
const STANDARD_SETS = new Set(["OGN", "OGS", "SFD"]);
const PREVIEW_SETS = new Set(["OGN", "OGS", "SFD", "UNL"]);

const PORT = 3000;
const STATIC_DIR = path.join(import.meta.dir, "public");
const IMAGES_DIR = path.join(import.meta.dir, "../../downloads/card-images");
const SANDBOX_ENABLED = process.env.SANDBOX_ENABLED === "true";
const SETS_DIR = path.join(import.meta.dir, "../../packages/riftbound-cards/src/data/sets");

// Initialize structured game logger
const gameLogger = new GameLogger(import.meta.dir);

// Legend name → champion tag mapping (LoL title → champion name)
const LEGEND_TAG_MAP: Record<string, string> = {
  "Bashful Bloom": "Lillia",
  "Battle Mistress": "Illaoi",
  "Blade Dancer": "Irelia",
  "Blind Monk": "Lee Sin",
  "Bloodharbor Ripper": "Pyke",
  "Bounty Hunter": "Vayne",
  "Chem-Baroness": "Renata",
  "Dark Child": "Annie",
  "Dark Child - Starter": "Annie",
  "Daughter of the Void": "Kai'Sa",
  "Deceiver": "Leblanc",
  "Emperor of the Sands": "Azir",
  "Fire Below the Mountain": "Ornn",
  "Gloomist": "Vex",
  "Glorious Executioner": "Draven",
  "Grand Duelist": "Fiora",
  "Grandmaster at Arms": "Jax",
  "Green Father": "Ivern",
  "Hand of Noxus": "Darius",
  "Herald of the Arcane": "Viktor",
  "Keeper of the Hammer": "Poppy",
  "Lady of Luminosity": "Lux",
  "Lady of Luminosity - Starter": "Lux",
  "Loose Cannon": "Jinx",
  "Mechanized Menace": "Rumble",
  "Might of Demacia": "Garen",
  "Might of Demacia - Starter": "Garen",
  "Nine-Tailed Fox": "Ahri",
  "Piltover Enforcer": "Vi",
  "Pridestalker": "Rengar",
  "Prodigal Explorer": "Ezreal",
  "Purifier": "Lucian",
  "Radiant Dawn": "Leona",
  "Relentless Storm": "Volibear",
  "Scorn of the Moon": "Diana",
  "Swift Scout": "Teemo",
  "The Boss": "Sett",
  "Unforgiven": "Yasuo",
  "Virtuoso": "Jhin",
  "Void Burrower": "Rek'Sai",
  "Voidreaver": "Kha'Zix",
  "Wuju Bladesman": "Yi",
  "Wuju Bladesman - Starter": "Yi",
  "Wuju Master": "Yi",
};

// Load cards once at startup
console.log("Loading cards...");
const allCards = getAllCards();
const registry = getCardRegistry();

// Patch legends with championTag at runtime
let legendsPatched = 0;
for (const card of allCards) {
  if (card.cardType === "legend") {
    const tag = LEGEND_TAG_MAP[card.name];
    if (tag && !("championTag" in card && (card as Record<string, unknown>).championTag)) {
      (card as Record<string, unknown>).championTag = tag;
      legendsPatched++;
    }
  }
}
console.log(`Loaded ${allCards.length} cards (${legendsPatched} legends patched with champion tags)`);

// Load set JSONs (with image URLs and parsed abilities)
function loadSetJson(setId: string): unknown {
  const filepath = path.join(SETS_DIR, `${setId.toLowerCase()}.json`);
  if (!fs.existsSync(filepath)) {return null;}
  return JSON.parse(fs.readFileSync(filepath, "utf8"));
}

// Active deck builder sessions (in-memory, keyed by session ID)
const sessions = new Map<string, DeckBuilder>();

function getOrCreateSession(sessionId: string): DeckBuilder {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new DeckBuilder(allCards));
  }
  return sessions.get(sessionId)!;
}

// ========================================
// Lobby System
// ========================================

interface LobbyPlayer {
  name: string;
  connId: string;
  ws: ServerWebSocket<WsData> | null;
  deckId: string | null; // Selected deck ID or "preset" for auto-generated
  ready: boolean;
}

interface Lobby {
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
}

const lobbies = new Map<string, Lobby>(); // Keyed by lobby ID
const lobbyByCode = new Map<string, string>(); // Code → lobby ID

function generateLobbyCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I/O/0/1 to avoid confusion
  let code = "";
  for (let i = 0; i < 4; i++) {code += chars[Math.floor(Math.random() * chars.length)];}
  // Ensure unique
  if (lobbyByCode.has(code)) {return generateLobbyCode();}
  return code;
}

function broadcastLobby(lobby: Lobby) {
  const state = {
    lobby: {
      code: lobby.code,
      coinFlip: lobby.coinFlip,
      gameId: lobby.gameId,
      gameMode: lobby.gameMode,
      guest: lobby.guest ? { name: lobby.guest.name, ready: lobby.guest.ready, hasDeck: !!lobby.guest.deckId } : null,
      host: { name: lobby.host.name, ready: lobby.host.ready, hasDeck: !!lobby.host.deckId },
      id: lobby.id,
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
const sessionLastActivity = new Map<string, number>();
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

interface PregameState {
  phase: "battlefield_select" | "mulligan" | "ready";
  gameMode: "duel" | "match";
  firstPlayer: string;
  secondPlayer: string;
  /** Each player's available battlefield definition IDs (from their deck) */
  battlefieldOptions: Record<string, string[]>;
  /** Each player's selected battlefield card ID (once chosen) */
  battlefieldSelections: Record<string, string>;
  /** Players who have completed their mulligan decision */
  mulliganComplete: Set<string>;
  /** Whether this is a sandbox (hotseat) game */
  sandbox: boolean;
}

interface GameSession {
  engine: RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>;
  players: [string, string];
  /** Display names keyed by player ID */
  playerNames: Record<string, string>;
  log: string[];
  /** Connected WebSocket clients for this game, keyed by a connection ID */
  clients: Map<string, { ws: ServerWebSocket<WsData>; playerId: string }>;
  /** Monotonic sequence number for ordering messages */
  seq: number;
  /** Pregame state — present until game transitions to "playing" */
  pregame?: PregameState;
  /** Whether this is a sandbox (goldfish) game */
  sandbox: boolean;
}

/** Data attached to each WebSocket connection */
interface WsData {
  gameId: string;
  playerId: string;
  connId: string;
  /** If this is a lobby connection rather than a game connection */
  lobbyId?: string;
  lobbyRole?: "host" | "guest";
}

const gameSessions = new Map<string, GameSession>();

/** Broadcast a message to all WebSocket clients in a game session */
function broadcast(session: GameSession, msg: Record<string, unknown>, exclude?: string) {
  const data = JSON.stringify(msg);
  for (const [connId, client] of session.clients) {
    if (connId !== exclude) {
      try { client.ws.send(data); } catch { /* Client may have disconnected */ }
    }
  }
}

/** Send a message to a specific WebSocket client */
function sendTo(session: GameSession, connId: string, msg: Record<string, unknown>) {
  const client = session.clients.get(connId);
  if (client) {
    try { client.ws.send(JSON.stringify(msg)); } catch { /* Ignore */ }
  }
}

/** Get zone/card data from engine's internal state */
function getInternalSnapshot(engine: RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>) {
  // Access private internalState for zone/card rendering
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private field for UI rendering
  const internal = (engine as unknown as Record<string, unknown>).internalState as {
    zones: Record<string, { config: unknown; cardIds: string[] }>;
    cards: Record<string, { definitionId: string; owner: string; controller: string; zone: string; position?: number }>;
    cardMetas: Record<string, RiftboundCardMeta>;
  };
  return internal;
}

/**
 * Build available moves for a player using the engine's move enumeration system.
 *
 * Each move definition in the riftbound engine has enumerator and condition functions
 * that generate and validate all legal parameter combinations.
 */
function buildAvailableMoves(session: GameSession, playerId: string) {
  return session.engine
    .enumerateMoves(playerId as PlayerId, { validOnly: true })
    .map((m) => ({ moveId: m.moveId, params: m.params as Record<string, unknown>, playerId: m.playerId as string }));
}

/** Format a move into a human-readable log entry */
function formatMoveLog(moveId: string, playerId: string, params: Record<string, unknown>): string {
  const player = playerId === "player-1" ? "P1" : "P2";

  // Resolve card name from params
  const resolveCard = (id: unknown): string => {
    if (typeof id !== "string") {return String(id ?? "");}
    const defId = id.replace(/^player-[12]-(?:main|rune)-\d+-/, "");
    const def = registry.get(defId);
    return def?.name ?? defId;
  };

  switch (moveId) {
    case "playUnit": { return `${player} played ${resolveCard(params.cardId)} to ${params.location ?? "base"}`;
    }
    case "playSpell": { return `${player} cast ${resolveCard(params.cardId)}`;
    }
    case "playGear": { return `${player} equipped ${resolveCard(params.cardId)}`;
    }
    case "standardMove": {
      const unitNames = Array.isArray(params.unitIds)
        ? params.unitIds.map(resolveCard).join(", ")
        : "units";
      return `${player} moved ${unitNames} to ${params.destination ?? "?"}`;
    }
    case "exhaustRune": { return `${player} tapped ${resolveCard(params.runeId)}`;
    }
    case "recycleRune": { return `${player} recycled ${resolveCard(params.runeId)} for ${params.domain ?? "power"}`;
    }
    case "contestBattlefield": { return `${player} contested ${params.battlefieldId}`;
    }
    case "conquerBattlefield": { return `${player} conquered ${params.battlefieldId}`;
    }
    case "assignAttacker": { return `${player} assigned ${resolveCard(params.unitId)} as attacker`;
    }
    case "assignDefender": { return `${player} assigned ${resolveCard(params.unitId)} as defender`;
    }
    case "resolveCombat": { return `Combat resolved at ${params.battlefieldId}`;
    }
    case "scorePoint": { return `${player} scored a point (${params.method})`;
    }
    case "endTurn": { return `${player} ended their turn`;
    }
    case "channelRunes": { return `${player} channeled ${params.count ?? 2} runes`;
    }
    case "drawCard": { return `${player} drew a card`;
    }
    case "addResources": { return `${player} gained ${params.energy ?? 0} energy`;
    }
    case "rollForFirst": { return `${player} rolled for initiative`;
    }
    case "chooseFirstPlayer": { return `${player} chose ${params.firstPlayerId === "player-1" ? "P1" : "P2"} to go first`;
    }
    case "transitionToPlay": { return "Game started!";
    }
    case "concede": { return `${player} conceded`;
    }
    case "passChainPriority": { return `${player} passed priority`;
    }
    case "passShowdownFocus": { return `${player} passed focus`;
    }
    case "resolveChain": { return `Chain resolved`;
    }
    case "startShowdown": { return `Showdown started at ${params.battlefieldId}`;
    }
    case "endShowdown": { return `Showdown ended`;
    }
    case "killUnit": { return `${resolveCard(params.cardId)} was destroyed`;
    }
    case "discardCard": { return `${player} discarded ${resolveCard(params.cardId)}`;
    }
    case "recallUnit": { return `${player} recalled ${resolveCard(params.unitId)}`;
    }
    case "hideCard": { return `${player} hid a card at ${params.battlefieldId}`;
    }
    case "revealHidden": { return `${player} revealed ${resolveCard(params.cardId)}`;
    }
    default: { return `${player}: ${moveId}`;
    }
  }
}

/** Build the game history log from engine replay history + session log */
function buildHistoryLog(session: GameSession): string[] {
  const entries: string[] = [...session.log]; // Keep manual entries (setup messages)
  try {
    const history = session.engine.getReplayHistory();
    for (const entry of history) {
      const params = entry.context?.params as Record<string, unknown> ?? {};
      const playerId = entry.context?.playerId as string ?? "";
      entries.push(formatMoveLog(entry.moveId, playerId, params));
    }
  } catch { /* History not available */ }
  return entries.slice(-80);
}

/** Build a renderable game snapshot for the UI */
function buildGameSnapshot(session: GameSession, viewingPlayer?: string) {
  const { engine } = session;
  const state = engine.getState();
  const internal = getInternalSnapshot(engine);

  // Build zone contents with card details
  const zones: Record<string, {
    id: string;
    definitionId: string;
    owner: string;
    controller: string;
    name: string;
    cardType: string;
    energyCost?: number;
    might?: number;
    domain?: unknown;
    rulesText?: string;
    meta: RiftboundCardMeta;
  }[]> = {};

  for (const [zoneId, zone] of Object.entries(internal.zones)) {
    zones[zoneId] = zone.cardIds.map((cardId) => {
      const cardInstance = internal.cards[cardId];
      const meta = internal.cardMetas[cardId];
      const def = cardInstance ? registry.get(cardInstance.definitionId) : undefined;

      // Read exhausted state from the counter system's __flags (where setFlag stores it)
      // Rather than the initial meta.exhausted field which may be stale
      const counterState = meta as unknown as { __flags?: Record<string, boolean> } | undefined;
      const exhaustedFromFlags = counterState?.__flags?.exhausted ?? false;

      const baseMeta = meta ?? { buffed: false, combatRole: null, damage: 0, exhausted: false, hidden: false, stunned: false };

      return {
        cardType: def?.cardType ?? "unknown",
        controller: cardInstance?.controller ?? "",
        definitionId: cardInstance?.definitionId ?? "",
        domain: def?.domain,
        energyCost: def?.energyCost,
        id: cardId,
        meta: { ...baseMeta, exhausted: exhaustedFromFlags },
        might: def && "might" in def ? (def as Record<string, unknown>).might as number : undefined,
        name: def?.name ?? cardId,
        owner: cardInstance?.owner ?? "",
        rulesText: def?.rulesText,
      };
    });
  }

  return {
    battlefields: state.battlefields,
    canUndo: session.engine.getReplayHistory().length > 0,
    gameId: state.gameId,
    interaction: {
      ...state.interaction,
      // Compute active showdown from stack for client compatibility
      showdown: state.interaction?.showdownStack?.length
        ? state.interaction.showdownStack[state.interaction.showdownStack.length - 1]
        : null,
    },
    log: buildHistoryLog(session),
    playerNames: session.playerNames,
    players: state.players,
    runePools: state.runePools,
    setup: state.setup,
    status: state.status,
    turn: state.turn,
    victoryScore: state.victoryScore,
    zones,
  };
}

/** Register a card in the engine's internal state so zone ops can track ownership */
function registerCard(
  internal: { cards: Record<string, { definitionId: string; owner: string; controller: string; zone: string; position?: number }>;
              cardMetas: Record<string, RiftboundCardMeta> },
  cardId: string,
  definitionId: string,
  owner: string,
  zone: string,
) {
  internal.cards[cardId] = { controller: owner, definitionId, owner, position: undefined, zone };
  internal.cardMetas[cardId] = { buffed: false, combatRole: null, damage: 0, exhausted: false, hidden: false, stunned: false };
}

/** Deck configuration for creating a game */
interface DeckConfig {
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
}

/** Build a default starter deck from the card pool — uses Fury/Chaos domain (Annie starter) */
function buildDefaultDeck(domain1 = "fury", domain2 = "chaos"): DeckConfig {
  const matchesDomain = (c: { domain?: string | string[] }) =>
    c.domain && (Array.isArray(c.domain)
      ? c.domain.some((d: string) => d === domain1 || d === domain2)
      : c.domain === domain1 || c.domain === domain2);

  const units = allCards.filter((c) => c.cardType === "unit"
    && !("isChampion" in c && c.isChampion)
    && matchesDomain(c),
  );
  const spells = allCards.filter((c) => c.cardType === "spell" && matchesDomain(c));
  const gears = allCards.filter((c) => (c.cardType === "gear" || c.cardType === "equipment") && matchesDomain(c));

  // Build 40-card main deck — mix of units, spells, and gear
  const sortedUnits = [...units].toSorted((a, b) => (a.energyCost ?? 99) - (b.energyCost ?? 99));
  const sortedSpells = [...spells].toSorted((a, b) => (a.energyCost ?? 99) - (b.energyCost ?? 99));
  const sortedGears = [...gears].toSorted((a, b) => (a.energyCost ?? 99) - (b.energyCost ?? 99));
  const mainDeckCardIds: string[] = [];

  // Add up to 2 copies of each card (copy limit per Riftbound rules)
  const addCards = (pool: typeof units, limit: number) => {
    let added = 0;
    for (const card of pool) {
      if (added >= limit || mainDeckCardIds.length >= 40) {break;}
      const copies = mainDeckCardIds.filter((id) => id === card.id).length;
      if (copies < 2) {
        mainDeckCardIds.push(card.id);
        added++;
      }
    }
  };

  // Reserve slots: 28 units, 8 spells, 4 gear
  addCards(sortedUnits, 28);
  addCards(sortedSpells, 8);
  addCards(sortedGears, 4);

  // Fill remaining slots with any card type
  if (mainDeckCardIds.length < 40) {
    for (const card of [...sortedUnits, ...sortedSpells, ...sortedGears]) {
      if (mainDeckCardIds.length >= 40) {break;}
      const copies = mainDeckCardIds.filter((id) => id === card.id).length;
      if (copies < 2) {mainDeckCardIds.push(card.id);}
    }
  }

  // 12-card rune deck — mix of domain runes
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const rune1 = allCards.find((c) => c.name === `${capitalize(domain1)} Rune`);
  const rune2 = allCards.find((c) => c.name === `${capitalize(domain2)} Rune`);
  const runeDeckCardIds: string[] = [];
  for (let i = 0; i < 12; i++) {
    const rune = i < 6 ? rune1 : rune2;
    if (rune) {runeDeckCardIds.push(rune.id);}
  }

  // 3 battlefields
  const bfs = allCards.filter((c) => c.cardType === "battlefield");
  const battlefieldIds = bfs.slice(0, 3).map((bf) => bf.id);

  // Select a legend and matching champion from the chosen domains
  let legendId: string | undefined;
  let championId: string | undefined;

  const legend = allCards.find((c) => c.cardType === "legend" && matchesDomain(c));
  if (legend) {
    legendId = legend.id;
    const tag = (legend as Record<string, unknown>).championTag as string | undefined;
    if (tag) {
      const champion = allCards.find((c) =>
        c.cardType === "unit"
        && "isChampion" in c && c.isChampion
        && "tags" in c && Array.isArray((c as Record<string, unknown>).tags)
        && ((c as Record<string, unknown>).tags as string[]).includes(tag),
      );
      if (champion) {
        championId = champion.id;
        // Exclude champion from the main deck (it goes to Champion Zone)
        const champIdx = mainDeckCardIds.indexOf(championId);
        if (champIdx !== -1) {
          mainDeckCardIds.splice(champIdx, 1);
        }
      }
    }
  }

  return { battlefieldIds, championId, legendId, mainDeckCardIds, runeDeckCardIds };
}

/** Convert a saved deck from the database into a DeckConfig for the game engine */
function savedDeckToDeckConfig(deck: FullDeck): DeckConfig | null {
  const mainDeckCardIds: string[] = [];
  const runeDeckCardIds: string[] = [];
  const battlefieldIds: string[] = [];

  for (const entry of deck.cards) {
    const target =
      entry.zone === "rune" ? runeDeckCardIds :
      (entry.zone === "battlefield" ? battlefieldIds :
      mainDeckCardIds);

    for (let i = 0; i < entry.quantity; i++) {
      target.push(entry.cardId);
    }
  }

  // Validate minimum requirements
  if (mainDeckCardIds.length === 0) {
    console.warn(`Saved deck "${deck.name}" (${deck.id}) has no main deck cards`);
    return null;
  }
  if (runeDeckCardIds.length === 0) {
    console.warn(`Saved deck "${deck.name}" (${deck.id}) has no rune deck cards`);
    return null;
  }

  // Extract legend and champion from mainDeckCardIds by card type
  // (saved decks store them in the "main" zone since the DB schema doesn't have legend/champion zones)
  let legendId: string | undefined;
  let championId: string | undefined;

  for (let i = mainDeckCardIds.length - 1; i >= 0; i--) {
    const defId = mainDeckCardIds[i];
    const def = registry.get(defId);
    if (!def) {continue;}

    if (def.cardType === "legend" && !legendId) {
      legendId = defId;
      mainDeckCardIds.splice(i, 1);
    } else if ("isChampion" in def && def.isChampion && !championId) {
      championId = defId;
      mainDeckCardIds.splice(i, 1);
    }
  }

  return { battlefieldIds, championId, legendId, mainDeckCardIds, runeDeckCardIds };
}

/** Load a deck config by ID, falling back to default deck on error */
function loadDeckConfig(deckId: string): DeckConfig {
  if (deckId === "default") {
    return buildDefaultDeck();
  }

  try {
    const savedDeck = getDeck(deckId);
    if (!savedDeck) {
      console.warn(`Saved deck ${deckId} not found, using default deck`);
      return buildDefaultDeck();
    }

    const config = savedDeckToDeckConfig(savedDeck);
    if (!config) {
      console.warn(`Saved deck ${deckId} is invalid, using default deck`);
      return buildDefaultDeck();
    }

    return config;
  } catch (error) {
    console.warn(`Failed to load saved deck ${deckId}, using default deck:`, error);
    return buildDefaultDeck();
  }
}

/** Create a game from two deck configurations */
function createGameFromDecks(
  deck1: DeckConfig,
  deck2: DeckConfig,
  seed?: string,
  options?: { gameMode?: "duel" | "match"; firstPlayer?: string; sandbox?: boolean; names?: Record<string, string> },
): GameSession {
  const P1 = "player-1";
  const P2 = "player-2";

  const engine = new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [
      { id: P1, name: "Player 1" },
      { id: P2, name: "Player 2" },
    ],
    { seed: seed ?? crypto.randomUUID() },
  );

  const cardReg = getGlobalCardRegistry();
  const internal = getInternalSnapshot(engine);
  const log: string[] = [];

  const decks: [string, DeckConfig][] = [[P1, deck1], [P2, deck2]];
  for (const [pid, deck] of decks) {
    // Register and initialize main deck
    const mainDeckIds: string[] = [];
    for (let i = 0; i < deck.mainDeckCardIds.length; i++) {
      const defId = deck.mainDeckCardIds[i];
      const cardId = `${pid}-main-${i}-${defId}`;
      const def = registry.get(defId);
      mainDeckIds.push(cardId);
      registerCard(internal, cardId, defId, pid, "mainDeck");
      if (def) {
        cardReg.register(cardId, {
          cardType: def.cardType,
          domain: def.domain as string | string[] | undefined,
          energyCost: def.energyCost,
          id: cardId,
          might: "might" in def ? (def as Record<string, unknown>).might as number : undefined,
          name: def.name,
        });
      }
    }
    engine.executeMove("initializeMainDeck", {
      params: { cardIds: mainDeckIds, playerId: pid },
      playerId: pid as PlayerId,
    });

    // Register and initialize rune deck
    const runeDeckIds: string[] = [];
    for (let i = 0; i < deck.runeDeckCardIds.length; i++) {
      const defId = deck.runeDeckCardIds[i];
      const cardId = `${pid}-rune-${i}-${defId}`;
      const def = registry.get(defId);
      runeDeckIds.push(cardId);
      registerCard(internal, cardId, defId, pid, "runeDeck");
      if (def) {
        cardReg.register(cardId, {
          cardType: "rune",
          domain: def.domain as string | string[] | undefined,
          energyCost: 0,
          id: cardId,
          name: def.name,
        });
      }
    }
    engine.executeMove("initializeRuneDeck", {
      params: { playerId: pid, runeIds: runeDeckIds },
      playerId: pid as PlayerId,
    });

    // Place Champion Legend in Legend Zone (Rule 111)
    if (deck.legendId) {
      const defId = deck.legendId;
      const cardId = `${pid}-legend-${defId}`;
      const def = registry.get(defId);
      registerCard(internal, cardId, defId, pid, "legendZone");
      if (def) {
        cardReg.register(cardId, {
          cardType: def.cardType,
          domain: def.domain as string | string[] | undefined,
          energyCost: undefined,
          id: cardId,
          name: def.name,
        });
      }
      engine.executeMove("placeLegend", {
        params: { legendId: cardId },
        playerId: pid as PlayerId,
      });
    }

    // Place Chosen Champion in Champion Zone (Rule 112)
    if (deck.championId) {
      const defId = deck.championId;
      const cardId = `${pid}-champion-${defId}`;
      const def = registry.get(defId);
      registerCard(internal, cardId, defId, pid, "championZone");
      if (def) {
        cardReg.register(cardId, {
          cardType: def.cardType,
          domain: def.domain as string | string[] | undefined,
          energyCost: def.energyCost,
          id: cardId,
          might: "might" in def ? (def as Record<string, unknown>).might as number : undefined,
          name: def.name,
        });
      }
      engine.executeMove("placeChampion", {
        params: { championId: cardId },
        playerId: pid as PlayerId,
      });
    }

    // Shuffle before drawing (Rule 114)
    engine.executeMove("shuffleDecks", {
      params: { playerId: pid },
      playerId: pid as PlayerId,
    });

    // Draw initial hand of 4 (Rule 116)
    engine.executeMove("drawInitialHand", {
      params: { playerId: pid },
      playerId: pid as PlayerId,
    });

    log.push(`${pid === P1 ? "Player 1" : "Player 2"} deck loaded`);
  }

  const gameMode = options?.gameMode ?? "duel";
  const firstPlayer = options?.firstPlayer ?? P1;
  const secondPlayer = firstPlayer === P1 ? P2 : P1;
  const isSandbox = options?.sandbox ?? false;

  // In Duel mode, auto-select 1 random battlefield per player and place them now.
  // In Match mode, defer to pregame battlefield selection.
  if (gameMode === "duel") {
    // Fallback: if a deck has no battlefields, pick from the full card pool
    const allBattlefields = allCards.filter((c) => c.cardType === "battlefield").map((c) => c.id);
    const p1Bfs = deck1.battlefieldIds.length > 0 ? deck1.battlefieldIds : allBattlefields;
    const p2Bfs = deck2.battlefieldIds.length > 0 ? deck2.battlefieldIds : allBattlefields;
    const p1Pick = p1Bfs[Math.floor(Math.random() * p1Bfs.length)];
    const p2Pick = p2Bfs[Math.floor(Math.random() * p2Bfs.length)];
    const bfIds: string[] = [];
    if (p1Pick) {
      const cardId = `${P1}-bf-${p1Pick}`;
      registerCard(internal, cardId, p1Pick, P1, "battlefieldRow");
      bfIds.push(cardId);
    }
    if (p2Pick) {
      const cardId = `${P2}-bf-${p2Pick}`;
      registerCard(internal, cardId, p2Pick, P2, "battlefieldRow");
      bfIds.push(cardId);
    }
    engine.executeMove("placeBattlefields", {
      params: { battlefieldIds: bfIds },
      playerId: P1 as PlayerId,
    });

    // Create per-battlefield zones (dynamic zones for unit placement)
    for (const bfCardId of bfIds) {
      internal.zones[`battlefield-${bfCardId}`] = { cardIds: [], config: { faceDown: false, id: `battlefield-${bfCardId}`, name: `Battlefield ${bfCardId}`, ordered: false, visibility: "public" } };
    }
  }

  const pregame: PregameState = {
    battlefieldOptions: {
      [P1]: deck1.battlefieldIds,
      [P2]: deck2.battlefieldIds,
    },
    battlefieldSelections: gameMode === "duel" ? {
      [P1]: deck1.battlefieldIds[Math.floor(Math.random() * deck1.battlefieldIds.length)] ?? "",
      [P2]: deck2.battlefieldIds[Math.floor(Math.random() * deck2.battlefieldIds.length)] ?? "",
    } : {},
    firstPlayer,
    gameMode,
    mulliganComplete: new Set(),
    phase: gameMode === "match" ? "battlefield_select" : "mulligan",
    sandbox: isSandbox,
    secondPlayer,
  };

  log.push(`${firstPlayer === P1 ? "Player 1" : "Player 2"} goes first`);

  const names = options?.names ?? { [P1]: "Player 1", [P2]: "Player 2" };
  return { clients: new Map(), engine, log, playerNames: names, players: [P1, P2], pregame, sandbox: isSandbox, seq: 0 };
}

/**
 * Finalize the pregame phase: place battlefields, transition to playing, channel runes.
 * Called when both players have completed mulligan.
 */
function finalizePregame(session: GameSession): void {
  const {pregame} = session;
  if (!pregame) {return;}

  const { engine } = session;
  const internal = getInternalSnapshot(engine);
  const [P1, P2] = session.players;

  // For Match mode (Bo3), place battlefields now (Duel already placed them in createGameFromDecks)
  if (pregame.gameMode === "match") {
    const bfIds: string[] = [];
    for (const [pid, defId] of Object.entries(pregame.battlefieldSelections)) {
      const cardId = `${pid}-bf-${defId}`;
      registerCard(internal, cardId, defId, pid, "battlefieldRow");
      bfIds.push(cardId);
    }
    engine.executeMove("placeBattlefields", {
      params: { battlefieldIds: bfIds },
      playerId: P1 as PlayerId,
    });

    // Create per-battlefield zones (dynamic zones for unit placement)
    for (const bfCardId of bfIds) {
      internal.zones[`battlefield-${bfCardId}`] = { cardIds: [], config: { faceDown: false, id: `battlefield-${bfCardId}`, name: `Battlefield ${bfCardId}`, ordered: false, visibility: "public" } };
    }
  }

  // Transition to playing
  engine.applyPatches([
    { op: "replace", path: ["status"], value: "playing" },
    { op: "replace", path: ["turn", "activePlayer"], value: pregame.firstPlayer },
    { op: "replace", path: ["turn", "phase"], value: "main" },
    { op: "replace", path: ["turn", "number"], value: 1 },
  ]);

  // Channel 2 runes for the first player (Rule 515.3: channel phase)
  engine.executeMove("channelRunes", {
    params: { count: 2, playerId: pregame.firstPlayer },
    playerId: pregame.firstPlayer as PlayerId,
  });

  // Draw 1 card for the first player (Rule 515.4.b: draw phase)
  engine.executeMove("drawCard", {
    params: { count: 1, playerId: pregame.firstPlayer },
    playerId: pregame.firstPlayer as PlayerId,
  });

  session.log.push("Game started");
  delete session.pregame;
  session.seq++;
}

/**
 * Broadcast a pregame update to all connected clients.
 */
function broadcastPregameUpdate(session: GameSession): void {
  const snapshot = buildGameSnapshot(session);
  for (const [, client] of session.clients) {
    const pregameData = buildPregamePayload(session, client.playerId);
    const moves = buildAvailableMoves(session, client.playerId);
    try {
      client.ws.send(JSON.stringify({
        moves,
        pregame: pregameData,
        seq: session.seq,
        state: snapshot,
        type: "sync",
      }));
    } catch { /* Disconnected */ }
  }
}

/**
 * Build pregame payload for a specific player.
 */
function buildPregamePayload(session: GameSession, playerId: string): Record<string, unknown> | null {
  const {pregame} = session;
  if (!pregame) {return null;}

  // Look up battlefield names for the selection UI
  const bfOptions = pregame.battlefieldOptions[playerId] ?? [];
  const bfDetails = bfOptions.map((defId) => {
    const def = registry.get(defId);
    return { id: defId, name: def?.name ?? defId, rulesText: def?.rulesText ?? "" };
  });

  return {
    battlefieldOptions: bfDetails,
    battlefieldSelected: pregame.battlefieldSelections[playerId] ?? null,
    firstPlayer: pregame.firstPlayer,
    gameMode: pregame.gameMode,
    mulliganComplete: [...pregame.mulliganComplete],
    phase: pregame.phase,
    sandbox: pregame.sandbox,
    waitingFor: session.players.filter((p) => !pregame.mulliganComplete.has(p)),
  };
}

/**
 * Determine the next player in a two-player game.
 */
function getNextPlayer(session: GameSession, currentPlayerId: string): string {
  const [p1, p2] = session.players;
  return currentPlayerId === p1 ? p2 : p1;
}

/**
 * Prepare the flow manager for a player rotation BEFORE executing the endTurn move.
 *
 * The endTurn move calls flow.endPhase(), which triggers the full phase chain
 * inside executeMove: main → ending → (turn ends) → awaken → beginning →
 * channel → draw → main. The flow's onBegin callbacks (channel runes, draw
 * cards, ready units) use context.getCurrentPlayer(), so we must set the next
 * player on the flow manager BEFORE the move executes. Otherwise those callbacks
 * would operate on the wrong player.
 */
function preparePlayerRotation(session: GameSession, currentPlayerId: string): string {
  const nextPlayer = getNextPlayer(session, currentPlayerId);
  const flowManager = session.engine.getFlowManager();
  flowManager?.setCurrentPlayer(nextPlayer as PlayerId);
  return nextPlayer;
}

/**
 * Finalize the end-turn after the endTurn move has executed.
 *
 * Performs end-of-turn cleanup and start-of-turn setup:
 * 1. Rule 517.2.c: Empty rune pools for all players
 * 2. Increment turn number
 * 3. Verify flow state landed correctly (safety net)
 * 4. Rule 515.1: Ready all cards for the new active player (Awaken)
 * 5. Rule 515.3: Channel 2 runes for the new active player
 * 6. Rule 515.4.b: Draw 1 card for the new active player
 */
function finalizeEndTurn(session: GameSession, nextPlayer: string): void {
  const state = session.engine.getState();

  // Auto-resolve all contested battlefields before turn passes (rules 620-628)
  const stateForCombat = session.engine.getState();
  for (const [bfId, bf] of Object.entries(stateForCombat.battlefields || {})) {
    if (bf.contested) {
      session.engine.executeMove("resolveFullCombat", {
        params: { battlefieldId: bfId },
        playerId: stateForCombat.turn.activePlayer as PlayerId,
      });
    }
  }

  // Rule 517.2.c: Empty rune pools for all players at end of previous turn
  for (const pid of session.players) {
    session.engine.executeMove("emptyRunePool", {
      params: { playerId: pid },
      playerId: pid as PlayerId,
    });
  }

  // Increment the turn number
  const currentTurnNumber = session.engine.getState().turn.number ?? 1;
  session.engine.applyPatches([
    { op: "replace", path: ["turn", "number"], value: currentTurnNumber + 1 },
  ]);

  // Safety net: ensure the state landed on the expected player/phase.
  // The flow system should handle phase cycling (channel, draw, main) automatically.
  const stateAfterCleanup = session.engine.getState();
  if (stateAfterCleanup.turn.activePlayer !== nextPlayer || stateAfterCleanup.turn.phase !== "main") {
    console.warn(
      `Flow state mismatch after endTurn: expected activePlayer=${nextPlayer} phase=main, ` +
      `got activePlayer=${stateAfterCleanup.turn.activePlayer} phase=${stateAfterCleanup.turn.phase}. ` +
      "Patching state as safety net.",
    );
    session.engine.applyPatches([
      { op: "replace", path: ["turn", "activePlayer"], value: nextPlayer },
      { op: "replace", path: ["turn", "phase"], value: "main" },
    ]);
  }

  // Rule 515.1: Awaken phase — ready all cards for the new active player
  session.engine.executeMove("readyAll", {
    params: { playerId: nextPlayer },
    playerId: nextPlayer as PlayerId,
  });

  // Clear turn-scoped tracking for the new player before Hold scoring
  session.engine.applyPatches([
    { op: "replace", path: ["conqueredThisTurn", nextPlayer], value: [] },
    { op: "replace", path: ["scoredThisTurn", nextPlayer], value: [] },
  ]);

  // Rule 515.2 / Rule 630.2: Beginning phase — Hold scoring
  // A player scores 1 VP for each battlefield they control at the start of their turn
  const stateForHold = session.engine.getState();
  for (const [bfId, bf] of Object.entries(stateForHold.battlefields || {})) {
    if (bf.controller === nextPlayer) {
      session.engine.executeMove("scorePoint", {
        params: { battlefieldId: bfId, method: "hold", playerId: nextPlayer },
        playerId: nextPlayer as PlayerId,
      });
    }
  }

  // Rule 515.3 / Rule 644.7: Channel phase — channel runes for the new active player
  // The second player channels 3 runes on their first turn instead of 2
  const stateForChannel = session.engine.getState();
  const internalForChannel = getInternalSnapshot(session.engine);
  const runeZone = internalForChannel.zones["runeDeck"];
  const runeDeckSize = runeZone?.cardIds?.filter((id: string) => id.startsWith(nextPlayer))?.length ?? 0;
  // Full rune deck = 12 means this player hasn't channeled yet (first turn)
  const isFirstTurnForPlayer = runeDeckSize === 12;
  const channelCount = isFirstTurnForPlayer && stateForChannel.turn.number === 2 ? 3 : 2;
  session.engine.executeMove("channelRunes", {
    params: { count: channelCount, playerId: nextPlayer },
    playerId: nextPlayer as PlayerId,
  });

  // Rule 515.4.b: Draw phase — draw 1 card for the new active player
  session.engine.executeMove("drawCard", {
    params: { count: 1, playerId: nextPlayer },
    playerId: nextPlayer as PlayerId,
  });

  session.log.push(`Turn passed to ${session.playerNames[nextPlayer] ?? nextPlayer}`);
}

/**
 * Auto-play for the Goldfish in sandbox mode.
 *
 * Handles chain priority, showdown focus, and full turn end.
 * Loops until the Goldfish has no more automatic actions to take.
 */
function sandboxAutoPlay(session: GameSession, goldfish: string): void {
  const MAX_ITERATIONS = 20; // Safety valve to prevent infinite loops
  let acted = true;
  let iterations = 0;

  while (acted && iterations < MAX_ITERATIONS) {
    acted = false;
    iterations++;
    const state = session.engine.getState();
    if (state.status !== "playing") {break;}

    // Auto-pass chain priority if Goldfish has it
    if (state.interaction?.chain?.active && state.interaction.chain.activePlayer === goldfish) {
      const result = session.engine.executeMove("passChainPriority", {
        params: { playerId: goldfish },
        playerId: goldfish as PlayerId,
      });
      if (result.success) {
        session.log.push(`${session.playerNames[goldfish] ?? goldfish}: passed priority`);
        acted = true;
        continue;
      }
    }

    // Auto-pass showdown focus if Goldfish has it
    const goldMoves = session.engine.enumerateMoves(goldfish as PlayerId, { validOnly: true });
    const passFocus = goldMoves.find((m) => m.moveId === "passShowdownFocus");
    if (passFocus) {
      session.engine.executeMove("passShowdownFocus", {
        params: passFocus.params as Record<string, unknown>,
        playerId: goldfish as PlayerId,
      });
      session.log.push(`${session.playerNames[goldfish] ?? goldfish}: passed focus`);
      acted = true;
      continue;
    }

    // Auto end turn if it's the Goldfish's turn
    if (state.turn.activePlayer === goldfish) {
      const nextForGoldfish = preparePlayerRotation(session, goldfish);
      const endResult = session.engine.executeMove("endTurn", {
        params: { playerId: goldfish },
        playerId: goldfish as PlayerId,
      });
      if (endResult.success) {
        finalizeEndTurn(session, nextForGoldfish);
        session.log.push(`${session.playerNames[goldfish] ?? goldfish}: ended their turn`);
        acted = true;
        continue;
      }
    }
  }

  // If the goldfish took any actions, broadcast updated state
  if (iterations > 0) {
    session.seq++;
    const goldSnapshot = buildGameSnapshot(session);
    for (const [, client] of session.clients) {
      const clientMoves = buildAvailableMoves(session, client.playerId);
      try {
        client.ws.send(JSON.stringify({
          moveId: "sandboxAutoPlay",
          moves: clientMoves,
          playerId: goldfish,
          seq: session.seq,
          state: goldSnapshot,
          type: "state_update",
        }));
      } catch { /* Disconnected */ }
    }
  }
}

/**
 * After unit movement, check if opposing units share a battlefield
 * and auto-resolve combat (contest + resolveFullCombat).
 */
function autoResolveCombat(session: GameSession, movingPlayerId: string): void {
  const state = session.engine.getState();

  for (const [bfId, bf] of Object.entries(state.battlefields || {})) {
    if (bf.contested) {
      continue; // Already contested, will be resolved at end of turn or separately
    }

    // Check if both players have units at this battlefield
    const bfZoneId = `battlefield-${bfId}`;
    const zones = state.zones ?? {};
    const unitsAtBf = (zones as Record<string, { owner: string }[]>)[bfZoneId] ?? [];
    const owners = new Set(unitsAtBf.map((c: { owner: string }) => c.owner));

    if (owners.size >= 2) {
      // Contest the battlefield
      session.engine.executeMove("contestBattlefield", {
        params: { battlefieldId: bfId, playerId: movingPlayerId },
        playerId: movingPlayerId as PlayerId,
      });

      // Immediately resolve combat
      session.engine.executeMove("resolveFullCombat", {
        params: { battlefieldId: bfId },
        playerId: movingPlayerId as PlayerId,
      });
    }
  }
}

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

// Simple token-based auth (maps token → userId)
const authTokens = new Map<string, string>();

function generateToken(userId: string): string {
  const token = crypto.randomUUID();
  authTokens.set(token, userId);
  return token;
}

function getUserIdFromRequest(req: Request): string | null {
  // Check Authorization header first
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const userId = authTokens.get(token);
    if (userId) {return userId;}
  }
  // Fall back to cookie
  const cookies = req.headers.get("Cookie") ?? "";
  const match = cookies.match(/rb_token=([^;]+)/);
  if (match) {
    const token = decodeURIComponent(match[1]);
    return authTokens.get(token) ?? null;
  }
  return null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    status,
  });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const {pathname} = url;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    // ========================================
    // API Routes
    // ========================================

    // GET /api/cards — all cards (with optional filters)
    if (pathname === "/api/cards") {
      const type = url.searchParams.get("type");
      const set = url.searchParams.get("set");
      const domain = url.searchParams.get("domain");
      const search = url.searchParams.get("search");
      const gameVersion = url.searchParams.get("game_version");

      let cards = allCards;
      if (gameVersion === "standard") {
        cards = cards.filter((c) => STANDARD_SETS.has(c.setId ?? ""));
      } else if (gameVersion === "preview") {
        cards = cards.filter((c) => PREVIEW_SETS.has(c.setId ?? ""));
      }
      if (type) {cards = cards.filter((c) => c.cardType === type);}
      if (set) {cards = cards.filter((c) => (c.setId ?? "") === set);}
      if (domain) {
        cards = cards.filter((c) => {
          const d = c.domain;
          if (!d) {return false;}
          if (typeof d === "string") {return d === domain;}
          return d.includes(domain as typeof d[number]);
        });
      }
      if (search) {
        const s = search.toLowerCase();
        cards = cards.filter(
          (c) => c.name.toLowerCase().includes(s) || (c.rulesText ?? "").toLowerCase().includes(s),
        );
      }

      // Return lightweight card list (no abilities blob)
      const result = cards.map((c) => ({
        cardType: c.cardType,
        domain: c.domain,
        energyCost: c.energyCost,
        id: c.id,
        isChampion: "isChampion" in c ? c.isChampion : undefined,
        might: "might" in c ? c.might : undefined,
        name: c.name,
        rarity: c.rarity,
        rulesText: c.rulesText,
        setId: c.setId,
        tags: c.tags,
      }));

      return json(result);
    }

    // GET /api/cards/:id — single card with full detail
    if (pathname.startsWith("/api/cards/") && pathname.split("/").length === 4) {
      const cardId = pathname.split("/")[3];
      const card = registry.get(cardId);
      if (!card) {return json({ error: "Card not found" }, 404);}
      return json(card);
    }

    // GET /api/config — client feature flags
    if (pathname === "/api/config") {
      return json({ sandboxEnabled: SANDBOX_ENABLED });
    }

    // GET /api/sets — available sets
    if (pathname === "/api/sets") {
      return json([
        { count: 298, id: "OGN", name: "Origins" },
        { count: 222, id: "SFD", name: "Spiritforged" },
        { count: 225, id: "UNL", name: "Unleashed" },
      ]);
    }

    // GET /api/sets/:id — full set data with images and abilities
    if (pathname.startsWith("/api/sets/") && pathname.split("/").length === 4) {
      const setId = pathname.split("/")[3].toUpperCase();
      const data = loadSetJson(setId);
      if (!data) {return json({ error: "Set not found" }, 404);}
      return json(data);
    }

    // GET /api/legends — all legend cards
    if (pathname === "/api/legends") {
      const legends = allCards.filter((c) => c.cardType === "legend");
      return json(legends);
    }

    // GET /api/deck/prebuilt — get prebuilt deck configurations
    if (pathname === "/api/deck/prebuilt" && req.method === "GET") {
      const prebuilts = [
        { deck: buildDefaultDeck("fury", "chaos"), domains: ["fury", "chaos"], name: "Fury / Chaos Aggro" },
        { deck: buildDefaultDeck("calm", "mind"), domains: ["calm", "mind"], name: "Calm / Mind Control" },
        { deck: buildDefaultDeck("body", "order"), domains: ["body", "order"], name: "Body / Order Fortress" },
      ];
      return json(prebuilts);
    }

    // POST /api/deck/create — create a new deck builder session
    if (pathname === "/api/deck/create" && req.method === "POST") {
      const sessionId = crypto.randomUUID();
      getOrCreateSession(sessionId);
      return json({ sessionId });
    }

    // POST /api/deck/:session/legend — set legend
    if (pathname.match(/^\/api\/deck\/[^/]+\/legend$/) && req.method === "POST") {
      const sessionId = pathname.split("/")[3];
      const body = (await req.json()) as { legendId: string };
      const builder = getOrCreateSession(sessionId);

      const legend = allCards.find((c) => c.id === body.legendId && c.cardType === "legend");
      if (!legend || legend.cardType !== "legend") {return json({ error: "Legend not found" }, 404);}

      builder.setLegend(legend as import("@tcg/riftbound-types/cards").LegendCard);
      return json({
        champions: builder.getLegalChampions(),
        domainIdentity: builder.getDomainIdentity(),
        state: builder.getState(),
        stats: builder.getStats(),
      });
    }

    // POST /api/deck/:session/champion — set champion
    if (pathname.match(/^\/api\/deck\/[^/]+\/champion$/) && req.method === "POST") {
      const sessionId = pathname.split("/")[3];
      const body = (await req.json()) as { championId: string };
      const builder = getOrCreateSession(sessionId);

      const champ = allCards.find((c) => c.id === body.championId);
      if (!champ || champ.cardType !== "unit") {return json({ error: "Champion not found" }, 404);}

      const result = builder.setChampion(champ as import("@tcg/riftbound-types/cards").UnitCard);
      return json({ result, state: builder.getState(), stats: builder.getStats() });
    }

    // POST /api/deck/:session/add — add card to main deck
    if (pathname.match(/^\/api\/deck\/[^/]+\/add$/) && req.method === "POST") {
      const sessionId = pathname.split("/")[3];
      const body = (await req.json()) as { cardId: string };
      const builder = getOrCreateSession(sessionId);

      const card = registry.get(body.cardId);
      if (!card) {return json({ error: "Card not found" }, 404);}

      const result = builder.addToMainDeck(card);
      return json({ result, state: builder.getState(), stats: builder.getStats() });
    }

    // POST /api/deck/:session/remove — remove card from main deck
    if (pathname.match(/^\/api\/deck\/[^/]+\/remove$/) && req.method === "POST") {
      const sessionId = pathname.split("/")[3];
      const body = (await req.json()) as { cardId: string };
      const builder = getOrCreateSession(sessionId);

      builder.removeFromMainDeckById(body.cardId);
      return json({ state: builder.getState(), stats: builder.getStats() });
    }

    // GET /api/deck/:session/available — get available cards for main deck
    if (pathname.match(/^\/api\/deck\/[^/]+\/available$/)) {
      const sessionId = pathname.split("/")[3];
      const builder = getOrCreateSession(sessionId);

      const type = url.searchParams.get("type") ?? undefined;
      const search = url.searchParams.get("search") ?? undefined;
      const energy = url.searchParams.get("energy");
      const setFilter = url.searchParams.get("set");
      const domain = url.searchParams.get("domain");
      const gv = url.searchParams.get("game_version");

      let available = builder.getAvailableMainDeckCards({
        cardType: type,
        energy: energy ? Number(energy) : undefined,
        nameSearch: search,
      });

      if (gv === "standard") {
        available = available.filter((c) => STANDARD_SETS.has(c.setId ?? ""));
      } else if (gv === "preview") {
        available = available.filter((c) => PREVIEW_SETS.has(c.setId ?? ""));
      }
      if (setFilter) {
        available = available.filter((c) => (c.setId ?? "") === setFilter);
      }
      if (domain) {
        available = available.filter((c) => {
          const d = c.domain;
          if (!d) {return false;}
          if (typeof d === "string") {return d === domain;}
          return Array.isArray(d) && d.includes(domain as (typeof d)[number]);
        });
      }

      const result = available.map((c) => ({
        cardNumber: c.cardNumber,
        cardType: c.cardType,
        domain: c.domain,
        energyCost: c.energyCost,
        id: c.id,
        might: "might" in c ? c.might : undefined,
        name: c.name,
        rarity: c.rarity,
        rulesText: c.rulesText,
        setId: c.setId,
        tags: c.tags,
      }));

      return json(result);
    }

    // GET /api/deck/:session/state — get current deck state
    if (pathname.match(/^\/api\/deck\/[^/]+\/state$/)) {
      const sessionId = pathname.split("/")[3];
      const builder = getOrCreateSession(sessionId);
      return json({ state: builder.getState(), stats: builder.getStats(), validation: builder.validate() });
    }

    // POST /api/deck/:session/runes/autofill — auto-fill rune deck
    if (pathname.match(/^\/api\/deck\/[^/]+\/runes\/autofill$/) && req.method === "POST") {
      const sessionId = pathname.split("/")[3];
      const builder = getOrCreateSession(sessionId);
      builder.autoFillRuneDeck();
      return json({ state: builder.getState(), stats: builder.getStats() });
    }

    // POST /api/deck/:session/battlefield — add battlefield
    if (pathname.match(/^\/api\/deck\/[^/]+\/battlefield$/) && req.method === "POST") {
      const sessionId = pathname.split("/")[3];
      const body = (await req.json()) as { battlefieldId: string };
      const builder = getOrCreateSession(sessionId);

      const bf = allCards.find((c) => c.id === body.battlefieldId && c.cardType === "battlefield");
      if (!bf) {return json({ error: "Battlefield not found" }, 404);}

      const result = builder.addBattlefield(bf as import("@tcg/riftbound-types/cards").BattlefieldCard);
      return json({ result, state: builder.getState(), stats: builder.getStats() });
    }

    // GET /api/deck/:session/battlefields — available battlefields
    if (pathname.match(/^\/api\/deck\/[^/]+\/battlefields$/)) {
      const sessionId = pathname.split("/")[3];
      const builder = getOrCreateSession(sessionId);
      return json(builder.getAvailableBattlefields());
    }

    // GET /api/deck/:session/export — export deck as text
    if (pathname.match(/^\/api\/deck\/[^/]+\/export$/)) {
      const sessionId = pathname.split("/")[3];
      const builder = getOrCreateSession(sessionId);
      const state = builder.getState();

      function groupCards(cards: typeof allCards): string {
        const counts = new Map<string, number>();
        for (const c of cards) {
          counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
        }
        return [...counts.entries()].map(([name, count]) => `${count} ${name}`).join("\n");
      }

      const sections: string[] = [];

      if (state.legend) {
        const legendDisplay = state.legend.championTag
          ? `${state.legend.championTag}, ${state.legend.name}`
          : state.legend.name;
        sections.push(`Legend:\n1 ${legendDisplay}`);
      }
      if (state.chosenChampion) {
        sections.push(`Champion:\n1 ${state.chosenChampion.name}`);
      }
      if (state.mainDeck.length > 0) {
        sections.push(`MainDeck:\n${groupCards(state.mainDeck)}`);
      }
      if (state.battlefields.length > 0) {
        sections.push(`Battlefields:\n${groupCards(state.battlefields)}`);
      }
      if (state.runeDeck.length > 0) {
        sections.push(`Runes:\n${groupCards(state.runeDeck)}`);
      }

      return new Response(sections.join("\n\n") + "\n", {
        headers: { "Content-Type": "text/plain" },
      });
    }

    // POST /api/deck/:session/import — import deck from text
    if (pathname.match(/^\/api\/deck\/[^/]+\/import$/) && req.method === "POST") {
      const sessionId = pathname.split("/")[3];
      const builder = getOrCreateSession(sessionId);
      const body = (await req.json()) as { text: string };
      const text = body.text ?? "";

      // Parse sections
      const sections: Record<string, { count: number; name: string }[]> = {};
      let currentSection: string | null = null;

      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) {continue;}

        const sectionMatch = trimmed.match(/^(Legend|Champion|MainDeck|Battlefields|Runes|Sideboard):$/);
        if (sectionMatch) {
          currentSection = sectionMatch[1];
          sections[currentSection] = [];
          continue;
        }

        if (currentSection) {
          const cardMatch = trimmed.match(/^(\d+)\s+(.+)$/);
          if (cardMatch) {
            sections[currentSection].push({ count: Number(cardMatch[1]), name: cardMatch[2].trim() });
          }
        }
      }

      // Helper: find card by name (case-insensitive)
      function findCard(name: string) {
        return allCards.find((c) => c.name.toLowerCase() === name.toLowerCase());
      }

      // Helper: find legend by "ChampionTag, LegendName" or just name
      function findLegend(name: string) {
        // Try exact match first
        const exact = allCards.find((c) => c.cardType === "legend" && c.name.toLowerCase() === name.toLowerCase());
        if (exact) {return exact;}
        // Try "Tag, Name" format (e.g., "Sivir, Battle Mistress")
        const commaIdx = name.indexOf(",");
        if (commaIdx > 0) {
          const legendName = name.slice(commaIdx + 1).trim().toLowerCase();
          const found = allCards.find((c) => c.cardType === "legend" && c.name.toLowerCase() === legendName);
          if (found) {return found;}
        }
        // Try partial match on legend name
        const lower = name.toLowerCase();
        return allCards.find((c) => c.cardType === "legend" && lower.includes(c.name.toLowerCase()));
      }

      const errors: string[] = [];

      // Clear and rebuild
      builder.clear();

      // Set legend
      if (sections.Legend?.[0]) {
        const legend = findLegend(sections.Legend[0].name);
        if (legend && legend.cardType === "legend") {
          builder.setLegend(legend as import("@tcg/riftbound-types/cards").LegendCard);
        } else {
          errors.push(`Legend not found: ${sections.Legend[0].name}`);
        }
      }

      // Set champion
      if (sections.Champion?.[0]) {
        const champ = findCard(sections.Champion[0].name);
        if (champ && champ.cardType === "unit") {
          const result = builder.setChampion(champ as import("@tcg/riftbound-types/cards").UnitCard);
          if (!result.success) {errors.push(`Champion error: ${result.error.message}`);}
        } else {
          errors.push(`Champion not found: ${sections.Champion[0].name}`);
        }
      }

      // Add main deck cards
      for (const entry of sections.MainDeck ?? []) {
        const card = findCard(entry.name);
        if (!card) {
          errors.push(`Card not found: ${entry.name}`);
          continue;
        }
        for (let i = 0; i < entry.count; i++) {
          const result = builder.addToMainDeck(card);
          if (!result.success) {
            errors.push(`${entry.name}: ${result.error.message}`);
            break;
          }
        }
      }

      // Add battlefields
      for (const entry of sections.Battlefields ?? []) {
        const bf = findCard(entry.name);
        if (!bf || bf.cardType !== "battlefield") {
          errors.push(`Battlefield not found: ${entry.name}`);
          continue;
        }
        for (let i = 0; i < entry.count; i++) {
          builder.addBattlefield(bf as import("@tcg/riftbound-types/cards").BattlefieldCard);
        }
      }

      // Add runes
      for (const entry of sections.Runes ?? []) {
        const rune = findCard(entry.name);
        if (!rune || rune.cardType !== "rune") {
          errors.push(`Rune not found: ${entry.name}`);
          continue;
        }
        for (let i = 0; i < entry.count; i++) {
          builder.addToRuneDeck(rune as import("@tcg/riftbound-types/cards").RuneCard);
        }
      }

      return json({
        errors,
        state: builder.getState(),
        stats: builder.getStats(),
        validation: builder.validate(),
      });
    }

    // ========================================
    // Lobby Routes
    // ========================================

    // POST /api/lobby/create — host creates a lobby
    if (pathname === "/api/lobby/create" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { name?: string; sandbox?: boolean };

      if (body.sandbox && !SANDBOX_ENABLED) {
        return json({ error: "Sandbox mode is disabled" }, 403);
      }

      const isSandbox = body.sandbox === true && SANDBOX_ENABLED;
      const lobbyId = crypto.randomUUID();
      const code = generateLobbyCode();
      const lobby: Lobby = {
        code,
        coinFlip: null,
        createdAt: Date.now(),
        gameId: null,
        gameMode: (body as Record<string, unknown>).gameMode === "match" ? "match" : "duel",
        guest: isSandbox
          ? { connId: "", deckId: "default", name: "Goldfish", ready: true, ws: null }
          : null,
        host: { connId: "", deckId: null, name: body.name || "Player 1", ready: false, ws: null },
        id: lobbyId,
        sandbox: isSandbox,
        status: "waiting",
      };
      lobbies.set(lobbyId, lobby);
      lobbyByCode.set(code, lobbyId);
      return json({ code, lobbyId });
    }

    // POST /api/lobby/join — guest joins a lobby by code
    if (pathname === "/api/lobby/join" && req.method === "POST") {
      const body = (await req.json()) as { code: string; name?: string };
      const code = (body.code || "").toUpperCase().trim();
      const lobbyId = lobbyByCode.get(code);
      if (!lobbyId) {return json({ error: "Lobby not found" }, 404);}
      const lobby = lobbies.get(lobbyId);
      if (!lobby) {return json({ error: "Lobby not found" }, 404);}
      if (lobby.guest) {return json({ error: "Lobby is full" }, 400);}
      if (lobby.status !== "waiting") {return json({ error: "Lobby already started" }, 400);}

      lobby.guest = { connId: "", deckId: null, name: body.name || "Player 2", ready: false, ws: null };
      broadcastLobby(lobby);
      return json({ code, lobbyId });
    }

    // GET /api/lobby/:id — get lobby state
    if (pathname.match(/^\/api\/lobby\/[^/]+$/) && req.method === "GET") {
      const lobbyId = pathname.split("/")[3];
      const lobby = lobbies.get(lobbyId);
      if (!lobby) {return json({ error: "Lobby not found" }, 404);}
      return json({
        code: lobby.code,
        gameId: lobby.gameId,
        guest: lobby.guest ? { hasDeck: !!lobby.guest.deckId, name: lobby.guest.name, ready: lobby.guest.ready } : null,
        host: { hasDeck: !!lobby.host.deckId, name: lobby.host.name, ready: lobby.host.ready },
        id: lobby.id,
        status: lobby.status,
      });
    }

    // ========================================
    // Game Engine Routes
    // ========================================

    // POST /api/game/create — create a game from deck configs
    if (pathname === "/api/game/create" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as {
        seed?: string;
        deck1?: DeckConfig;
        deck2?: DeckConfig;
        sandbox?: boolean;
      };

      if (body.sandbox && !SANDBOX_ENABLED) {
        return json({ error: "Sandbox mode is disabled" }, 403);
      }

      const deck1 = body.deck1 ?? buildDefaultDeck();
      const deck2 = body.deck2 ?? buildDefaultDeck();
      const gameId = crypto.randomUUID();
      const session = createGameFromDecks(deck1, deck2, body.seed, { gameMode: "duel" });
      gameSessions.set(gameId, session);
      gameLogger.logGameCreated(gameId, session.players, "duel", body.seed ?? "random", {
        sandbox: body.sandbox ?? false,
        source: "api",
      });
      return json({ gameId, state: buildGameSnapshot(session) });
    }

    // GET /api/game/:id/state — get full game state snapshot
    if (pathname.match(/^\/api\/game\/[^/]+\/state$/) && req.method === "GET") {
      const gameId = pathname.split("/")[3];
      const session = gameSessions.get(gameId);
      if (!session) {return json({ error: "Game not found" }, 404);}
      return json(buildGameSnapshot(session));
    }

    // GET /api/game/:id/moves — enumerate available moves for a player
    if (pathname.match(/^\/api\/game\/[^/]+\/moves$/) && req.method === "GET") {
      const gameId = pathname.split("/")[3];
      const playerId = url.searchParams.get("player") ?? "player-1";
      const session = gameSessions.get(gameId);
      if (!session) {return json({ error: "Game not found" }, 404);}

      const moves = buildAvailableMoves(session, playerId);
      return json(moves);
    }

    // POST /api/game/:id/move — execute a move
    if (pathname.match(/^\/api\/game\/[^/]+\/move$/) && req.method === "POST") {
      const gameId = pathname.split("/")[3];
      const session = gameSessions.get(gameId);
      if (!session) {return json({ error: "Game not found" }, 404);}

      const body = (await req.json()) as { moveId: string; playerId: string; params: Record<string, unknown> };

      // Capture previous phase for phase change detection
      const prevPhase = session.engine.getState().turn.phase;

      // For endTurn, set the next player on the flow manager BEFORE executing
      // So the flow's phase callbacks (channel, draw, ready) target the right player.
      const isEndTurn = body.moveId === "endTurn";
      const nextPlayer = isEndTurn ? preparePlayerRotation(session, body.playerId) : undefined;

      const result = session.engine.executeMove(body.moveId, {
        params: body.params,
        playerId: body.playerId as PlayerId,
      });

      if (result.success) {
        session.log.push(`${body.playerId}: ${body.moveId}`);
        gameLogger.logMove(gameId, body.moveId, body.playerId, body.params, { success: true });

        // After unit movement, auto-detect and resolve contested battlefields
        if (body.moveId === "standardMove" || body.moveId === "gankingMove") {
          autoResolveCombat(session, body.playerId);
        }

        // Detect game completion
        const stateAfterMove = session.engine.getState();
        if (stateAfterMove.status === "finished" && prevPhase !== "finished") {
          const startTime = gameLogger.getGameStartTime(gameId);
          const durationMs = startTime ? Date.now() - startTime : 0;
          gameLogger.logStateChange(gameId, "playing", "finished");
          gameLogger.logGameCompleted(
            gameId,
            stateAfterMove.turn.activePlayer ?? null,
            stateAfterMove.victoryScore ?? {},
            session.engine.getReplayHistory().length,
            durationMs,
          );
        }

        if (isEndTurn && nextPlayer) {
          finalizeEndTurn(session, nextPlayer);
        }

        // Broadcast to connected WebSocket clients so they stay in sync
        session.seq++;
        const snapshot = buildGameSnapshot(session);
        const newPhase = session.engine.getState().turn.phase;
        const phaseChange = prevPhase !== newPhase
          ? { from: prevPhase, to: newPhase }
          : undefined;

        for (const [, client] of session.clients) {
          const clientMoves = buildAvailableMoves(session, client.playerId);
          try {
            client.ws.send(JSON.stringify({
              moveId: body.moveId,
              moves: clientMoves,
              phaseChange,
              playerId: body.playerId,
              seq: session.seq,
              state: snapshot,
              type: "state_update",
            }));
          } catch { /* Disconnected */ }
        }

        return json({ phaseChange, state: snapshot, success: true });
      }

      // If endTurn failed, restore the current player on the flow manager
      if (isEndTurn) {
        session.engine.getFlowManager()?.setCurrentPlayer(body.playerId as PlayerId);
      }
      const moveError = (result as { error: string }).error;
      const moveErrorCode = (result as { errorCode: string }).errorCode;
      gameLogger.logMoveRejected(gameId, body.moveId, body.playerId, body.params, moveError ?? "unknown");
      return json({ error: moveError, errorCode: moveErrorCode, success: false }, 400);
    }

    // GET /api/game/:id/history — get game history
    if (pathname.match(/^\/api\/game\/[^/]+\/history$/) && req.method === "GET") {
      const gameId = pathname.split("/")[3];
      const session = gameSessions.get(gameId);
      if (!session) {return json({ error: "Game not found" }, 404);}
      return json({ log: buildHistoryLog(session) });
    }

    // POST /api/game/:id/undo — undo last move
    if (pathname.match(/^\/api\/game\/[^/]+\/undo$/) && req.method === "POST") {
      const gameId = pathname.split("/")[3];
      const session = gameSessions.get(gameId);
      if (!session) {return json({ error: "Game not found" }, 404);}

      const state = session.engine.getState();
      if (state.status !== "playing") {
        return json({ error: "Can only undo during active gameplay" }, 400);
      }

      const success = session.engine.undo();
      if (!success) {return json({ error: "Nothing to undo" }, 400);}

      session.log.push("Move undone");
      return json({ state: buildGameSnapshot(session), success: true });
    }

    // POST /api/game/:id/redo — redo undone move
    if (pathname.match(/^\/api\/game\/[^/]+\/redo$/) && req.method === "POST") {
      const gameId = pathname.split("/")[3];
      const session = gameSessions.get(gameId);
      if (!session) {return json({ error: "Game not found" }, 404);}

      const success = session.engine.redo();
      if (!success) {return json({ error: "Nothing to redo" }, 400);}

      session.log.push("Move redone");
      return json({ state: buildGameSnapshot(session), success: true });
    }

    // ========================================
    // WebSocket Upgrade
    // ========================================

    // GET /ws/lobby/:id?role=host|guest — upgrade to lobby WebSocket
    if (pathname.match(/^\/ws\/lobby\/[^/]+$/) && req.headers.get("upgrade") === "websocket") {
      const lobbyId = pathname.split("/")[3];
      const role = url.searchParams.get("role") as "host" | "guest" ?? "host";
      const lobby = lobbies.get(lobbyId);
      if (!lobby) {return json({ error: "Lobby not found" }, 404);}

      const connId = crypto.randomUUID();
      const upgraded = server.upgrade<WsData>(req, {
        data: { connId, gameId: "", lobbyId, lobbyRole: role, playerId: "" },
      });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      return undefined as unknown as Response;
    }

    // GET /ws/game/:id?player=X — upgrade to game WebSocket
    if (pathname.match(/^\/ws\/game\/[^/]+$/) && req.headers.get("upgrade") === "websocket") {
      const gameId = pathname.split("/")[3];
      const playerId = url.searchParams.get("player") ?? "player-1";
      const session = gameSessions.get(gameId);
      if (!session) {return json({ error: "Game not found" }, 404);}

      const connId = crypto.randomUUID();
      const upgraded = server.upgrade<WsData>(req, {
        data: { connId, gameId, playerId },
      });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      return undefined as unknown as Response;
    }

    // ========================================
    // Card Image Proxy
    // ========================================

    // GET /images/:set/:filename — serve local card images
    if (pathname.startsWith("/images/")) {
      const parts = pathname.split("/").slice(2);
      const imagePath = path.join(IMAGES_DIR, ...parts);

      if (fs.existsSync(imagePath)) {
        const file = Bun.file(imagePath);
        return new Response(file, {
          headers: { "Cache-Control": "public, max-age=86400", "Content-Type": "image/png" },
        });
      }
      return new Response("Image not found", { status: 404 });
    }

    // GET /card-image/:cardId — serve card image by ID (looks up local file)
    if (pathname.startsWith("/card-image/")) {
      const cardId = pathname.split("/")[2];
      // Find the image file for this card ID
      for (const setDir of ["ogn", "ogs", "sfd", "unl"]) {
        const dir = path.join(IMAGES_DIR, setDir);
        if (!fs.existsSync(dir)) {continue;}
        const files = fs.readdirSync(dir);
        const match = files.find((f) => f.includes(cardId));
        if (match) {
          const file = Bun.file(path.join(dir, match));
          return new Response(file, {
            headers: { "Cache-Control": "public, max-age=86400", "Content-Type": "image/png" },
          });
        }
      }
      return new Response("Image not found", { status: 404 });
    }

    // ========================================
    // Auth Routes
    // ========================================

    // POST /api/auth/register
    if (pathname === "/api/auth/register" && req.method === "POST") {
      const body = (await req.json()) as { username: string; password: string; displayName?: string };
      if (!body.username || !body.password) {
        return json({ error: "Username and password required" }, 400);
      }
      try {
        const displayName = body.displayName ? body.displayName.slice(0, 32) : undefined;
        const user = createUser(body.username, body.password, displayName);
        const token = generateToken(user.id);
        return new Response(JSON.stringify({ token, user }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `rb_token=${token}; Path=/; Max-Age=${30 * 86_400}; SameSite=Lax`,
            ...corsHeaders,
          },
          status: 201,
        });
      } catch {
        return json({ error: "Username already taken" }, 409);
      }
    }

    // POST /api/auth/login
    if (pathname === "/api/auth/login" && req.method === "POST") {
      const body = (await req.json()) as { username: string; password: string };
      const user = authenticateUser(body.username, body.password);
      if (!user) {return json({ error: "Invalid credentials" }, 401);}
      const token = generateToken(user.id);
      return new Response(JSON.stringify({ token, user }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `rb_token=${token}; Path=/; Max-Age=${30 * 86_400}; SameSite=Lax`,
          ...corsHeaders,
        },
        status: 200,
      });
    }

    // GET /api/auth/me
    if (pathname === "/api/auth/me") {
      const userId = getUserIdFromRequest(req);
      if (!userId) {return json({ error: "Not authenticated" }, 401);}
      const user = getUserById(userId);
      if (!user) {return json({ error: "User not found" }, 404);}
      return json({ user });
    }

    // GET /api/auth/dev-credentials — auto-login for local dev
    if (pathname === "/api/auth/dev-credentials" && req.method === "GET") {
      const username = process.env.DEFAULT_USERNAME;
      const password = process.env.DEFAULT_PASSWORD;
      if (username && password) {
        return json({ password, username });
      }
      return json({ error: "No dev credentials configured" }, 404);
    }

    // ========================================
    // Saved Deck Routes
    // ========================================

    // POST /api/saved-decks — create a saved deck
    if (pathname === "/api/saved-decks" && req.method === "POST") {
      const userId = getUserIdFromRequest(req);
      if (!userId) {return json({ error: "Not authenticated" }, 401);}

      const body = (await req.json()) as {
        name: string;
        description?: string;
        format?: string;
        gameVersion?: GameVersion;
        legendId: string;
        championId: string;
        isPublic?: boolean;
        cards: DeckCardEntry[];
      };

      if (!body.name || !body.legendId || !body.championId) {
        return json({ error: "Name, legendId, and championId required" }, 400);
      }

      const deck = createDeck({ userId, ...body });
      return json(deck, 201);
    }

    // GET /api/saved-decks — list user's decks
    if (pathname === "/api/saved-decks" && req.method === "GET") {
      const userId = getUserIdFromRequest(req);
      if (!userId) {return json({ error: "Not authenticated" }, 401);}
      return json(listDecks(userId));
    }

    // GET /api/saved-decks/public — list public decks
    if (pathname === "/api/saved-decks/public") {
      return json(listPublicDecks());
    }

    // GET /api/saved-decks/:id — get a single deck
    if (pathname.match(/^\/api\/saved-decks\/[^/]+$/) && req.method === "GET") {
      const deckId = pathname.split("/")[3];
      const deck = getDeck(deckId);
      if (!deck) {return json({ error: "Deck not found" }, 404);}
      return json(deck);
    }

    // PUT /api/saved-decks/:id — update a deck
    if (pathname.match(/^\/api\/saved-decks\/[^/]+$/) && req.method === "PUT") {
      const userId = getUserIdFromRequest(req);
      if (!userId) {return json({ error: "Not authenticated" }, 401);}

      const deckId = pathname.split("/")[3];
      const body = (await req.json()) as {
        name?: string;
        description?: string;
        format?: string;
        gameVersion?: GameVersion;
        legendId?: string;
        championId?: string;
        isPublic?: boolean;
        cards?: DeckCardEntry[];
      };

      const deck = updateDeck(deckId, userId, body);
      if (!deck) {return json({ error: "Deck not found or not owned by you" }, 404);}
      return json(deck);
    }

    // DELETE /api/saved-decks/:id — delete a deck
    if (pathname.match(/^\/api\/saved-decks\/[^/]+$/) && req.method === "DELETE") {
      const userId = getUserIdFromRequest(req);
      if (!userId) {return json({ error: "Not authenticated" }, 401);}

      const deckId = pathname.split("/")[3];
      const deleted = deleteDeck(deckId, userId);
      if (!deleted) {return json({ error: "Deck not found or not owned by you" }, 404);}
      return json({ success: true });
    }

    // ========================================
    // Game Log Routes
    // ========================================

    // GET /api/logs/:gameId — retrieve full move log for a game
    if (pathname.match(/^\/api\/logs\/[^/]+$/) && req.method === "GET") {
      const logGameId = pathname.split("/")[3];
      const entries = gameLogger.getGameLog(logGameId);
      if (entries.length === 0) {
        return json({ error: "No logs found for this game" }, 404);
      }
      return json({ count: entries.length, entries, gameId: logGameId });
    }

    // POST /api/archive-logs — archive game logs older than N days
    if (pathname === "/api/archive-logs" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { olderThanDays?: number };
      const days = body.olderThanDays ?? 7;
      if (days < 1) {
        return json({ error: "olderThanDays must be at least 1" }, 400);
      }
      const archived = gameLogger.archiveOldLogs(days);
      return json({ archived, message: `Archived ${archived} log file(s) older than ${days} day(s)` });
    }

    // ========================================
    // Static Files
    // ========================================

    // Serve login page
    if (pathname === "/login" || pathname === "/login.html") {
      const loginPath = path.join(STATIC_DIR, "login.html");
      if (fs.existsSync(loginPath)) {
        return new Response(Bun.file(loginPath), {
          headers: { "Content-Type": "text/html" },
        });
      }
    }

    // Serve decks page
    if (pathname === "/decks" || pathname === "/decks.html") {
      const decksPath = path.join(STATIC_DIR, "decks.html");
      if (fs.existsSync(decksPath)) {
        return new Response(Bun.file(decksPath), {
          headers: { "Content-Type": "text/html" },
        });
      }
    }

    // Redirect root to decks page
    if (pathname === "/") {
      return Response.redirect("/decks", 302);
    }

    // Serve index.html for builder
    if (pathname === "/builder" || pathname === "/index.html") {
      const indexPath = path.join(STATIC_DIR, "index.html");
      if (fs.existsSync(indexPath)) {
        return new Response(Bun.file(indexPath), {
          headers: { "Content-Type": "text/html" },
        });
      }
    }

    // DEV ONLY: auto-create goldfish game for testing (requires SANDBOX_ENABLED=true)
    if (pathname === "/play/test" && SANDBOX_ENABLED) {
      const deck = buildDefaultDeck();
      const session = createGameFromDecks(deck, deck, undefined, {
        firstPlayer: "player-1", gameMode: "duel", names: { "player-1": "Tester", "player-2": "Goldfish" },
        sandbox: true,
      });
      // Auto-complete mulligan
      session.pregame?.mulliganComplete.add("player-1");
      session.pregame?.mulliganComplete.add("player-2");
      finalizePregame(session);

      const testGameId = crypto.randomUUID();
      gameSessions.set(testGameId, session);
      gameLogger.logGameCreated(testGameId, session.players, "duel", "random", {
        sandbox: true,
        source: "test",
      });

      const gamePath = path.join(STATIC_DIR, "gameplay.html");
      let html = fs.readFileSync(gamePath, "utf8");
      const inject = `<script>sessionStorage.setItem("rb_game",${JSON.stringify(JSON.stringify({
        gameId: testGameId, isSandbox: true, lobbyRole: "host",
        playerNames: { "player-1": "Tester", "player-2": "Goldfish" }, viewingPlayer: "player-1",
      }))});</script>`;
      html = html.replace("</head>", inject + "</head>");
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    // Serve gameplay.html
    if (pathname === "/play" || pathname === "/gameplay" || pathname === "/gameplay.html") {
      const gamePath = path.join(STATIC_DIR, "gameplay.html");
      if (fs.existsSync(gamePath)) {
        return new Response(Bun.file(gamePath), {
          headers: { "Content-Type": "text/html" },
        });
      }
    }

    // Serve other static files
    const staticPath = path.join(STATIC_DIR, pathname);
    if (fs.existsSync(staticPath) && !fs.statSync(staticPath).isDirectory()) {
      return new Response(Bun.file(staticPath));
    }

    return new Response("Not Found", { status: 404 });
  },

  // ========================================
  // WebSocket Handlers
  // ========================================
  websocket: {
    close(ws: ServerWebSocket<WsData>, code: number, reason: string) {
      // ---- Lobby disconnect ----
      if (ws.data.lobbyId) {
        const lobby = lobbies.get(ws.data.lobbyId);
        if (lobby) {
          if (ws.data.lobbyRole === "host") {lobby.host.ws = null;}
          if (ws.data.lobbyRole === "guest" && lobby.guest) {lobby.guest.ws = null;}
          console.log(`Lobby WS: ${ws.data.lobbyRole} disconnected from ${lobby.code}`);
        }
        return;
      }

      // ---- Game disconnect ----
      const { gameId, playerId, connId } = ws.data;
      const session = gameSessions.get(gameId);
      if (!session) {return;}

      session.clients.delete(connId);
      console.log(`WS disconnected: ${connId} (${playerId}) code=${code} reason=${reason} (${session.clients.size} clients left)`);
      gameLogger.logPlayerDisconnected(gameId, playerId, connId, reason || `code=${code}`);

      broadcast(session, {
        clientCount: session.clients.size,
        playerId,
        type: "player_disconnected",
      });
    },

    message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
      } catch {
        ws.send(JSON.stringify({ error: "Invalid JSON", type: "error" }));
        return;
      }

      // ---- Lobby messages ----
      if (ws.data.lobbyId) {
        const lobby = lobbies.get(ws.data.lobbyId);
        if (!lobby) {return;}
        const role = ws.data.lobbyRole;
        const player = role === "host" ? lobby.host : lobby.guest;

        if (msg.type === "select_deck" && player) {
          player.deckId = msg.deckId as string;
          player.ready = Boolean(msg.deckId);
          broadcastLobby(lobby);
        }

        if (msg.type === "set_mode") {
          lobby.gameMode = msg.mode === "match" ? "match" : "duel";
          broadcastLobby(lobby);
        }

        if (msg.type === "start_game" && role === "host" && lobby.guest && lobby.host.ready && lobby.guest.ready) {
          // D20 roll to determine who CHOOSES first player (rule 115)
          let p1Roll = 0;
          let p2Roll = 0;
          if (lobby.sandbox) {
            // In goldfish mode, rig so the host always wins (goldfish can't choose)
            p1Roll = 21;
            p2Roll = Math.floor(Math.random() * 20) + 1;
          } else {
            // Reroll on tie
            do {
              p1Roll = Math.floor(Math.random() * 20) + 1;
              p2Roll = Math.floor(Math.random() * 20) + 1;
            } while (p1Roll === p2Roll);
          }
          const flipWinner = p1Roll > p2Roll ? "player-1" : "player-2";
          lobby.coinFlip = { firstPlayer: "", p1Roll, p2Roll, winner: flipWinner };
          broadcastLobby(lobby);
        }

        // Flip winner chooses who goes first (rule 115)
        if (msg.type === "choose_first") {
          console.log("[Lobby] choose_first received:", { choice: msg.choice, coinFlip: lobby.coinFlip, role });
          if (!lobby.coinFlip || lobby.coinFlip.firstPlayer) {
            console.log("[Lobby] choose_first rejected: no coinFlip or already chosen");
            return;
          }
          const winnerRole = lobby.coinFlip.winner === "player-1" ? "host" : "guest";
          console.log("[Lobby] winnerRole:", winnerRole, "senderRole:", role);
          if (role !== winnerRole) { console.log("[Lobby] choose_first rejected: not winner"); return; }

          const chosen = msg.choice === "opponent"
            ? (role === "host" ? "player-2" : "player-1")
            : (role === "host" ? "player-1" : "player-2");
          lobby.coinFlip = { ...lobby.coinFlip, firstPlayer: chosen };

          // NOW start the game with the chosen first player
          const deck1 = loadDeckConfig(lobby.host.deckId);
          const deck2 = loadDeckConfig(lobby.guest.deckId);

          const gameId = crypto.randomUUID();
          const session = createGameFromDecks(deck1, deck2, undefined, {
            firstPlayer: chosen,
            gameMode: lobby.gameMode,
            names: {
              "player-1": lobby.host.name,
              "player-2": lobby.guest?.name ?? "Player 2",
            },
            sandbox: lobby.sandbox,
          });
          gameSessions.set(gameId, session);
          gameLogger.logGameCreated(gameId, session.players, lobby.gameMode, "random", {
            firstPlayer: chosen,
            flipWinner: lobby.coinFlip.winner,
            guestDeckId: lobby.guest?.deckId,
            hostDeckId: lobby.host.deckId,
            lobbyCode: lobby.code,
            sandbox: lobby.sandbox,
            source: "lobby",
          });
          lobby.gameId = gameId;
          lobby.status = "started";
          broadcastLobby(lobby);
        }

        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
        return;
      }

      // ---- Game messages ----
      const { gameId, playerId, connId } = ws.data;
      const session = gameSessions.get(gameId);
      if (!session) {return;}

      // ---- Pregame message handlers ----
      if (session.pregame) {
        if (msg.type === "pregame_battlefield_select" && session.pregame.phase === "battlefield_select") {
          const bfId = msg.battlefieldId as string;
          const options = session.pregame.battlefieldOptions[playerId] ?? [];
          if (!options.includes(bfId)) {
            ws.send(JSON.stringify({ error: "Invalid battlefield choice", type: "error" }));
          } else {
            session.pregame.battlefieldSelections[playerId] = bfId;
            // Check if both players have selected
            const allSelected = session.players.every((p) => session.pregame!.battlefieldSelections[p]);
            if (allSelected) {
              session.pregame.phase = "mulligan";
            }
            session.seq++;
            broadcastPregameUpdate(session);
          }
        }

        if (msg.type === "pregame_mulligan") {
          if (session.pregame.phase !== "mulligan") {return;}
          if (session.pregame.mulliganComplete.has(playerId)) {return;} // Already decided

          const sendBack = (msg.sendBack as string[]) ?? [];
          if (sendBack.length > 0 && sendBack.length <= 2) {
            session.engine.executeMove("mulligan", {
              params: { playerId, keepCards: sendBack },
              playerId: playerId as PlayerId,
            });
            session.log.push(`${session.playerNames[playerId] ?? playerId} mulliganed ${sendBack.length} card${sendBack.length > 1 ? "s" : ""}`);
          } else {
            session.log.push(`${session.playerNames[playerId] ?? playerId} kept hand`);
          }

          session.pregame.mulliganComplete.add(playerId);

          // In sandbox mode, auto-complete the other player's mulligan (keep)
          if (session.pregame.sandbox) {
            const other = session.players.find((p) => p !== playerId);
            if (other && !session.pregame.mulliganComplete.has(other)) {
              session.pregame.mulliganComplete.add(other);
              session.log.push(`${session.playerNames[other] ?? other} kept hand`);
            }
          }

          // Check if all players have completed mulligan
          const allDone = session.players.every((p) => session.pregame!.mulliganComplete.has(p));
          if (allDone) {
            try {
              finalizePregame(session);
              gameLogger.logStateChange(gameId, "pregame", "playing");
            } catch (error) {
              console.error("[finalizePregame] CRASHED:", error);
              gameLogger.logError(gameId, error, { context: "finalizePregame" });
              // Fallback: just force playing state
              session.engine.applyPatches([
                { op: "replace", path: ["status"], value: "playing" },
                { op: "replace", path: ["turn", "phase"], value: "main" },
                { op: "replace", path: ["turn", "number"], value: 1 },
              ]);
              delete session.pregame;
              session.seq++;
            }
            // Broadcast final game state (no more pregame)
            for (const [, client] of session.clients) {
              const snapshot = buildGameSnapshot(session);
              const clientMoves = buildAvailableMoves(session, client.playerId);
              try {
                client.ws.send(JSON.stringify({
                  moves: clientMoves,
                  pregame: null,
                  seq: session.seq,
                  state: snapshot,
                  type: "sync",
                }));
              } catch { /* Disconnected */ }
            }
          } else {
            session.seq++;
            broadcastPregameUpdate(session);
          }
        }

        // Don't process normal game moves during pregame
        if (msg.type === "move" || msg.type === "resync") {
          if (msg.type === "resync") {
            const snapshot = buildGameSnapshot(session);
            const moves = buildAvailableMoves(session, playerId);
            ws.send(JSON.stringify({
              moves,
              pregame: buildPregamePayload(session, playerId),
              seq: session.seq,
              state: snapshot,
              type: "sync",
            }));
          }
          return;
        }
      }

      if (msg.type === "move") {
        const { moveId, params, requestId } = msg;
        if (!moveId || !params) {
          ws.send(JSON.stringify({ error: "Missing moveId or params", requestId, type: "error" }));
          return;
        }

        // Capture previous phase for phase change detection
        const prevPhase = session.engine.getState().turn.phase;

        // For endTurn, set the next player on the flow manager BEFORE executing
        // So the flow's phase callbacks (channel, draw, ready) target the right player.
        const isEndTurn = moveId === "endTurn";
        const nextPlayer = isEndTurn ? preparePlayerRotation(session, playerId) : undefined;

        const result = session.engine.executeMove(moveId, {
          params,
          playerId: playerId as PlayerId,
        });

        if (!result.success) {
          // If endTurn failed, restore the current player on the flow manager
          if (isEndTurn) {
            session.engine.getFlowManager()?.setCurrentPlayer(playerId as PlayerId);
          }
          const wsError = (result as { error: string }).error;
          const wsErrorCode = (result as { errorCode: string }).errorCode;
          gameLogger.logMoveRejected(gameId, moveId as string, playerId, params as Record<string, unknown>, wsError ?? "unknown");
          ws.send(JSON.stringify({
            error: wsError,
            errorCode: wsErrorCode,
            requestId,
            type: "move_rejected",
          }));
          return;
        }

        session.log.push(`${playerId}: ${moveId}`);
        gameLogger.logMove(gameId, moveId as string, playerId, params as Record<string, unknown>, { success: true });

        // After unit movement, auto-detect and resolve contested battlefields
        if (moveId === "standardMove" || moveId === "gankingMove") {
          autoResolveCombat(session, playerId);
        }

        // Detect game completion
        const stateAfterWsMove = session.engine.getState();
        if (stateAfterWsMove.status === "finished") {
          const startTime = gameLogger.getGameStartTime(gameId);
          const durationMs = startTime ? Date.now() - startTime : 0;
          gameLogger.logStateChange(gameId, "playing", "finished");
          gameLogger.logGameCompleted(
            gameId,
            stateAfterWsMove.turn.activePlayer ?? null,
            stateAfterWsMove.victoryScore ?? {},
            session.engine.getReplayHistory().length,
            durationMs,
          );
        }

        // Finalize turn cycling (same logic as REST endpoint)
        if (isEndTurn && nextPlayer) {
          finalizeEndTurn(session, nextPlayer);
        }

        session.seq++;
        const snapshot = buildGameSnapshot(session);

        // Detect phase change for WebSocket messages
        const newPhase = session.engine.getState().turn.phase;
        const phaseChange = prevPhase !== newPhase
          ? { from: prevPhase, to: newPhase }
          : undefined;

        // Send confirmation to the acting player with their updated moves
        const actorMoves = buildAvailableMoves(session, playerId);

        ws.send(JSON.stringify({
          moveId,
          moves: actorMoves,
          phaseChange,
          playerId,
          requestId,
          seq: session.seq,
          state: snapshot,
          type: "move_accepted",
        }));

        // Broadcast to other clients with their own available moves
        for (const [cid, client] of session.clients) {
          if (cid === connId) {continue;}
          const clientMoves = buildAvailableMoves(session, client.playerId);
          try {
            client.ws.send(JSON.stringify({
              moveId,
              moves: clientMoves,
              phaseChange,
              playerId,
              seq: session.seq,
              state: snapshot,
              type: "state_update",
            }));
          } catch { /* Disconnected */ }
        }

        // Sandbox auto-play: handle chain priority, showdown focus, and turn for Goldfish
        if (session.sandbox) {
          const humanPlayer = playerId;
          const goldfish = session.players.find((p) => p !== humanPlayer);
          if (goldfish) {
            sandboxAutoPlay(session, goldfish);
          }
        }
      }

      if (msg.type === "resync") {
        // Client explicitly requests full state (e.g., after detecting gap in seq)
        const snapshot = buildGameSnapshot(session);
        const moves = buildAvailableMoves(session, playerId);

        ws.send(JSON.stringify({
          moves,
          seq: session.seq,
          state: snapshot,
          type: "sync",
        }));
      }

      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }

      if (msg.type === "game_ping") {
        const pingMsg = {
          message: (msg as Record<string, unknown>).message,
          playerId,
          target: (msg as Record<string, unknown>).target,
          targetType: (msg as Record<string, unknown>).targetType,
          type: "game_ping",
        };
        broadcast(session, pingMsg);
      }

      if (msg.type === "undo") {
        const undoState = session.engine.getState();
        if (undoState.status !== "playing") {
          ws.send(JSON.stringify({ error: "Can only undo during active gameplay", type: "error" }));
          return;
        }
        const success = session.engine.undo();
        if (!success) {
          ws.send(JSON.stringify({ error: "Nothing to undo", type: "error" }));
          return;
        }
        session.log.push("Move undone");
        session.seq++;
        const snapshot = buildGameSnapshot(session);
        // Broadcast updated state to all clients
        for (const [, client] of session.clients) {
          const clientMoves = buildAvailableMoves(session, client.playerId);
          try {
            client.ws.send(JSON.stringify({
              moveId: "undo",
              moves: clientMoves,
              playerId,
              seq: session.seq,
              state: snapshot,
              type: "state_update",
            }));
          } catch { /* Disconnected */ }
        }
      }

      if (msg.type === "redo") {
        const success = session.engine.redo();
        if (!success) {
          ws.send(JSON.stringify({ error: "Nothing to redo", type: "error" }));
          return;
        }
        session.log.push("Move redone");
        session.seq++;
        const snapshot = buildGameSnapshot(session);
        for (const [, client] of session.clients) {
          const clientMoves = buildAvailableMoves(session, client.playerId);
          try {
            client.ws.send(JSON.stringify({
              moveId: "redo",
              moves: clientMoves,
              playerId,
              seq: session.seq,
              state: snapshot,
              type: "state_update",
            }));
          } catch { /* Disconnected */ }
        }
      }

      if (msg.type === "leave_game") {
        const isHost = playerId === session.players[0];
        session.log.push(`${session.playerNames[playerId] ?? playerId} left the game`);
        gameLogger.logPlayerDisconnected(gameId, playerId, connId, "voluntary_leave");

        if (isHost) {
          // Host leaving ends the game — notify all clients and clean up
          gameLogger.logStateChange(gameId, "playing", "ended_host_left");
          broadcast(session, { reason: "host_left", type: "game_ended" });
          // Close all client connections
          for (const [cid, client] of session.clients) {
            try { client.ws.close(1000, "Host left"); } catch { /* */ }
          }
          session.clients.clear();
          gameSessions.delete(gameId);
        } else {
          // Guest leaving — they can rejoin later. Just notify other clients.
          broadcast(session, {
            clientCount: session.clients.size - 1,
            playerId,
            type: "player_disconnected",
            voluntary: true,
          }, connId);
          // Close this client's connection
          ws.close(1000, "Player left");
        }
      }
    },

    open(ws: ServerWebSocket<WsData>) {
      const { connId, lobbyId, lobbyRole } = ws.data;

      // ---- Lobby connection ----
      if (lobbyId) {
        const lobby = lobbies.get(lobbyId);
        if (!lobby) { ws.close(4004, "Lobby not found"); return; }

        if (lobbyRole === "host") {
          lobby.host.connId = connId;
          lobby.host.ws = ws;
        } else if (lobbyRole === "guest" && lobby.guest) {
          lobby.guest.connId = connId;
          lobby.guest.ws = ws;
        }
        console.log(`Lobby WS: ${lobbyRole} connected to ${lobby.code}`);
        broadcastLobby(lobby);
        return;
      }

      // ---- Game connection ----
      const { gameId, playerId } = ws.data;
      const session = gameSessions.get(gameId);
      if (!session) {
        ws.close(4004, "Game not found");
        return;
      }

      session.clients.set(connId, { playerId, ws });
      console.log(`WS connected: ${connId} as ${playerId} in game ${gameId} (${session.clients.size} clients)`);
      gameLogger.logPlayerConnected(gameId, playerId, connId);

      // Send full state snapshot on connect (enables reconnection resync)
      const snapshot = buildGameSnapshot(session);
      const moves = buildAvailableMoves(session, playerId);

      ws.send(JSON.stringify({
        moves,
        pregame: buildPregamePayload(session, playerId),
        seq: session.seq,
        state: snapshot,
        type: "sync",
      }));

      // Notify other clients
      broadcast(session, {
        clientCount: session.clients.size,
        playerId,
        type: "player_connected",
      }, connId);
    },
  },
});

console.log(`\nRiftbound App running at http://localhost:${PORT}`);
console.log(`  UI:  http://localhost:${PORT}/`);
console.log(`  Play: http://localhost:${PORT}/play`);
console.log(`  WS:  ws://localhost:${PORT}/ws/game/:id?player=X`);
console.log(`  API: http://localhost:${PORT}/api/cards`);
