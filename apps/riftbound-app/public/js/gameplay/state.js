// state.js — Global variable declarations, interaction state, and helper functions

let currentUsername = null;

const P1 = "player-1";
const P2 = "player-2";

let gameId = null;
let gameState = null;
let previousGameState = null; // Track previous state for combat result detection
let viewingPlayer = "player-1";

// Expose state on window for visual-invariants test scripts. Read-only by
// convention; production code should use the module-local `gameState`.
Object.defineProperty(window, "__rbGameState", {
  get() { return gameState; },
  configurable: true,
});
Object.defineProperty(window, "__rbViewingPlayer", {
  get() { return viewingPlayer; },
  configurable: true,
});
let selectedCard = null; // kept for backward compat with zoom/preview
let availableMoves = [];
let lastSeq = -1;
let requestCounter = 0;

/** Player display names keyed by player ID */
let playerNames = { "player-1": "Player 1", "player-2": "Player 2" };

/** Persist game session to sessionStorage so refresh reconnects */
function saveSession() {
  if (gameId) {
    sessionStorage.setItem("rb_game", JSON.stringify({
      gameId, viewingPlayer, lobbyRole: typeof lobbyRole !== "undefined" ? lobbyRole : null,
      isSandbox: typeof isSandboxGame !== "undefined" ? isSandboxGame : false,
      playerNames,
    }));
  } else {
    sessionStorage.removeItem("rb_game");
  }
}

function clearSession() {
  sessionStorage.removeItem("rb_game");
}

/** Get display name for a player ID */
function pName(pid) { return playerNames[pid] ?? pid; }

/** Get initials from a name (split on space, underscore, or dot) */
function initials(name) {
  return name.split(/[\s_.]+/).map(w => w[0] || "").join("").toUpperCase().slice(0, 3) || name[0]?.toUpperCase() || "?";
}

// Interaction state machine
let interaction = {
  mode: "idle",          // "idle" | "cardSelected" | "awaitTarget" | "costPayment"
  sourceCardId: null,
  sourceZone: null,      // "hand" | "base" | "runePool" | "battlefield-X"
  action: null,          // "playCard" | "moveUnit" | "runeAction" | "costPayment" | null
  validTargets: [],      // array of zone IDs that accept a drop/click
  matchingMoves: [],     // moves matching the current selection
  pendingCardId: null,   // card waiting to be played (costPayment mode)
  pendingCardCost: 0,    // energy cost of pending card
};

// Previous resource snapshot for delta detection
let prevResources = null;

function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

/** Reset interaction state without triggering a re-render */
function resetInteractionSilent() {
  interaction = {
    mode: "idle",
    sourceCardId: null,
    sourceZone: null,
    action: null,
    validTargets: [],
    matchingMoves: [],
    pendingCardId: null,
    pendingCardCost: 0,
  };
  selectedCard = null;
  const actionBar = document.getElementById("actionBar");
  if (actionBar) actionBar.classList.add("hidden");
  clearRuneTappableHighlights();
}

// REST API (used for game creation only)
async function api(path, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  return res.json();
}

// Lobby state variables
let lobbyId = null;
let lobbyCode = null;
let lobbyRole = null; // "host" | "guest"
let lobbyWs = null;
let isSandboxGame = false;

// Coin flip state
let _coinFlipOnDone = null;
let _coinFlipShown = false; // Guard against re-triggering
let _coinRollInterval = null;

// Mulligan state
let mulliganSelected = new Set();

// Pregame state
let pregameState = null;

// Opponent disconnect tracking
let opponentDisconnected = false;
