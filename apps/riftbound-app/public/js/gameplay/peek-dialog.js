// peek-dialog.js — W12 Enriched top-deck peek dialog
//
// Replaces the simple right-click peek with a rich dialog that mirrors
// Rift Atlas's reference behaviour: bulk actions (Look at 1 More, Recycle
// All, Reveal to Opponent) plus per-card actions (Play, Recycle, On Top,
// To hand).
//
// ----- Engine peek-state contract --------------------------------------
//
// The engine's `peekTopN` move is a pure no-op on game state — its sole
// purpose is to emit a rewindable match-log entry. The UI reads the top
// N card objects directly from `gameState.zones.mainDeck`, filtered to
// the viewing player, and relies on `@tcg/core` zone order (index 0 =
// top of deck). Each subsequent "Look at 1 More" dispatches a fresh
// `peekTopN` with count+1 and re-reads the slice.
//
// ----- Close-button commit semantics -----------------------------------
//
// On Close with a non-empty "On Top" ordering list, we dispatch
// `placeCardsOnTopOfDeckInOrder` (preserving click order — first clicked
// ends up deepest, last clicked ends up on top) AND `recycleMany` for
// every peeked card NOT in the stack. This matches Rift Atlas's
// documented destructive-drag-out behaviour without introducing a drag
// interaction (tracked as a follow-up).
//
// Depends on globals from other gameplay scripts:
//   executeMove(moveId, params, playerId)  — game-flow.js
//   viewingPlayer, gameState               — state.js
//   availableMoves                         — state.js (for Play legality)
//   esc(), addLogEntry()                   — renderer.js / state.js

// ---- Module state -----------------------------------------------------------

/**
 * Ordered list of card IDs the user has marked "On Top" in the current
 * dialog session. First click = first in the list. When the dialog is
 * committed, the array is passed to `placeCardsOnTopOfDeckInOrder`
 * exactly as-is, so the first-clicked card ends up deeper in the deck
 * and the last-clicked card ends up on top.
 */
let _peekStackOrder = [];

/**
 * Count of cards currently being peeked. Starts at 1, grows when the
 * user clicks "Look at 1 More".
 */
let _peekCount = 0;

/**
 * Snapshot of the card IDs we are currently showing, captured from the
 * top of the main deck when the dialog (re)renders. Used as the "rest"
 * set when committing the close — any peeked card NOT in
 * `_peekStackOrder` is recycled.
 */
let _peekCardIds = [];

/**
 * Tracks whether the dialog is currently open — used to ignore stray
 * escape/outside-click handlers when the dialog is already closed.
 */
let _peekOpen = false;

// ---- Dialog lifecycle -------------------------------------------------------

/**
 * Open the peek dialog showing the top `count` cards of the viewing
 * player's main deck. Dispatches `peekTopN` so the action is auditable
 * in the replay log, then reads the top cards from `gameState.zones`
 * directly (the engine move is informational only).
 */
function openPeekDialog(count = 1) {
  if (typeof gameState !== "object" || !gameState || !gameState.zones) {
    return;
  }
  const pid = typeof viewingPlayer !== "undefined" ? viewingPlayer : null;
  if (!pid) {
    return;
  }

  _peekCount = Math.max(1, Math.floor(count));
  _peekStackOrder = [];
  _peekOpen = true;

  // Log the peek so it's rewindable and visible to both players.
  if (typeof executeMove === "function") {
    executeMove("peekTopN", { playerId: pid, count: _peekCount }, pid);
  }

  rerenderPeekDialog();
}

/**
 * Re-render the dialog against current game state. Called on open, on
 * "Look at 1 More", and after any per-card dispatch that may have
 * mutated the main deck.
 */
function rerenderPeekDialog() {
  if (!_peekOpen) return;
  const cards = _readTopOfDeck(_peekCount);
  _peekCardIds = cards.map((c) => c.id);

  // Prune any On-Top entries that are no longer in the peeked set
  // (e.g., because the card was sent to hand or recycled mid-session).
  _peekStackOrder = _peekStackOrder.filter((id) => _peekCardIds.includes(id));

  renderPeekDialog(cards);
}

/**
 * Close the dialog. If the user has marked any cards "On Top", commit
 * that ordering via `placeCardsOnTopOfDeckInOrder` and recycle the
 * rest via `recycleMany`. With no On-Top actions, close is a pure
 * no-op (the peek itself was already logged).
 */
function closePeekDialog() {
  if (!_peekOpen) return;
  _peekOpen = false;

  const pid = typeof viewingPlayer !== "undefined" ? viewingPlayer : null;
  if (pid && typeof executeMove === "function") {
    const stack = _peekStackOrder.slice();
    if (stack.length > 0) {
      executeMove(
        "placeCardsOnTopOfDeckInOrder",
        { playerId: pid, cardIds: stack },
        pid
      );
      const rest = _peekCardIds.filter((id) => !stack.includes(id));
      if (rest.length > 0) {
        executeMove("recycleMany", { playerId: pid, cardIds: rest }, pid);
      }
    }
  }

  _peekStackOrder = [];
  _peekCardIds = [];
  _peekCount = 0;

  const root = document.getElementById("peekDialog");
  if (root) {
    root.classList.remove("visible");
    root.innerHTML = "";
  }
}

// ---- Data helpers -----------------------------------------------------------

/**
 * Read the top `count` cards of the viewing player's main deck from
 * the current game state snapshot. Index 0 in the zone array is the
 * top of the deck (see `operations-impl.ts` — `position: "top"` uses
 * `unshift`).
 */
function _readTopOfDeck(count) {
  const zones = (gameState && gameState.zones) || {};
  const all = Array.isArray(zones.mainDeck) ? zones.mainDeck : [];
  const pid = typeof viewingPlayer !== "undefined" ? viewingPlayer : null;
  const owned = all.filter((c) => c && c.owner === pid);
  return owned.slice(0, Math.max(0, count));
}

/**
 * Look up the matching `playUnit` / `playSpell` / `playGear` move in
 * `availableMoves` for this card ID. Returns the matching move or
 * `null` if no legal play move exists for the card (e.g., because the
 * card is still in the deck and costs aren't paid).
 */
function _findPlayMove(cardId) {
  const list = typeof availableMoves !== "undefined" ? availableMoves : [];
  if (!Array.isArray(list)) return null;
  const hit = list.find(
    (m) =>
      (m.moveId === "playUnit" ||
        m.moveId === "playSpell" ||
        m.moveId === "playGear") &&
      m.params && m.params.cardId === cardId
  );
  return hit || null;
}

// ---- Per-card actions -------------------------------------------------------

function _onPeekPlay(cardId) {
  const mv = _findPlayMove(cardId);
  if (!mv) return;
  const pid = mv.playerId || (typeof viewingPlayer !== "undefined" ? viewingPlayer : null);
  if (!pid) return;
  if (typeof executeMove !== "function") return;
  // Playing the card removes it from the deck; close silently so we
  // don't try to recycle/stack the card we just played.
  _peekOpen = false;
  _peekStackOrder = [];
  _peekCardIds = [];
  _peekCount = 0;
  const root = document.getElementById("peekDialog");
  if (root) {
    root.classList.remove("visible");
    root.innerHTML = "";
  }
  executeMove(mv.moveId, mv.params, pid);
}

function _onPeekRecycleOne(cardId) {
  const pid = typeof viewingPlayer !== "undefined" ? viewingPlayer : null;
  if (!pid || typeof executeMove !== "function") return;
  // Use the single-card move so the log reads naturally.
  executeMove("recycleCard", { cardId }, pid);
  // Shrink the peek window by one (we just removed a card).
  _peekCount = Math.max(1, _peekCount - 1);
  // The server will resync the zone; rerender on the next state tick.
  setTimeout(rerenderPeekDialog, 0);
}

function _onPeekSendToHand(cardId) {
  const pid = typeof viewingPlayer !== "undefined" ? viewingPlayer : null;
  if (!pid || typeof executeMove !== "function") return;
  executeMove("sendToHand", { cardId }, pid);
  _peekCount = Math.max(1, _peekCount - 1);
  setTimeout(rerenderPeekDialog, 0);
}

function _onPeekToggleOnTop(cardId) {
  const idx = _peekStackOrder.indexOf(cardId);
  if (idx >= 0) {
    _peekStackOrder.splice(idx, 1);
  } else {
    _peekStackOrder.push(cardId);
  }
  rerenderPeekDialog();
}

// ---- Bulk actions -----------------------------------------------------------

function _onPeekLookMore() {
  _peekCount += 1;
  const pid = typeof viewingPlayer !== "undefined" ? viewingPlayer : null;
  if (pid && typeof executeMove === "function") {
    executeMove("peekTopN", { playerId: pid, count: _peekCount }, pid);
  }
  rerenderPeekDialog();
}

function _onPeekRecycleAll() {
  const pid = typeof viewingPlayer !== "undefined" ? viewingPlayer : null;
  if (!pid || typeof executeMove !== "function") return;
  const ids = _peekCardIds.slice();
  if (ids.length === 0) {
    _peekOpen = false;
    const root = document.getElementById("peekDialog");
    if (root) {
      root.classList.remove("visible");
      root.innerHTML = "";
    }
    return;
  }
  // Clear local state so the subsequent close doesn't double-recycle.
  _peekOpen = false;
  _peekStackOrder = [];
  _peekCardIds = [];
  _peekCount = 0;
  const root = document.getElementById("peekDialog");
  if (root) {
    root.classList.remove("visible");
    root.innerHTML = "";
  }
  executeMove("recycleMany", { playerId: pid, cardIds: ids }, pid);
}

function _onPeekRevealToOpponent() {
  const pid = typeof viewingPlayer !== "undefined" ? viewingPlayer : null;
  if (!pid || typeof executeMove !== "function") return;
  executeMove(
    "revealTopToOpponent",
    { playerId: pid, count: _peekCount },
    pid
  );
}

// ---- Rendering --------------------------------------------------------------

/**
 * Build the dialog DOM for the given peeked cards. Mounts into
 * `#peekDialog` (created inside `#game-scale-wrapper` on first use so
 * it inherits the board's scale transform).
 */
function renderPeekDialog(cards) {
  let root = document.getElementById("peekDialog");
  if (!root) {
    const wrapper = document.getElementById("game-scale-wrapper") || document.body;
    root = document.createElement("div");
    root.id = "peekDialog";
    root.className = "peek-dialog-overlay";
    wrapper.appendChild(root);
  }

  const escFn = typeof esc === "function" ? esc : (s) => String(s ?? "");

  const cardTiles = cards
    .map((c) => {
      const defId = (c.definitionId || "").replace(/^player-[12]-/, "");
      const imgSrc = defId ? `/card-image/${escFn(defId)}` : "";
      const stackPos = _peekStackOrder.indexOf(c.id);
      const onTopBadge =
        stackPos >= 0
          ? `<span class="peek-dialog__badge">On Top #${stackPos + 1}</span>`
          : "";
      const playMove = _findPlayMove(c.id);
      const playDisabled = playMove ? "" : " disabled";

      return (
        '<div class="peek-dialog__tile">' +
        `<div class="peek-dialog__imgwrap">${imgSrc ? `<img src="${imgSrc}" alt="${escFn(c.name || "")}">` : ""}${onTopBadge}</div>` +
        `<div class="peek-dialog__name">${escFn(c.name || c.id || "")}</div>` +
        '<div class="peek-dialog__cardbtns">' +
        `<button type="button" class="peek-dialog__btn peek-dialog__btn--play" data-peek-action="play" data-card-id="${escFn(c.id)}"${playDisabled}>Play</button>` +
        `<button type="button" class="peek-dialog__btn" data-peek-action="recycle" data-card-id="${escFn(c.id)}">Recycle</button>` +
        `<button type="button" class="peek-dialog__btn${stackPos >= 0 ? " peek-dialog__btn--active" : ""}" data-peek-action="ontop" data-card-id="${escFn(c.id)}">On Top</button>` +
        `<button type="button" class="peek-dialog__btn" data-peek-action="tohand" data-card-id="${escFn(c.id)}">To hand</button>` +
        "</div>" +
        "</div>"
      );
    })
    .join("");

  const emptyNote =
    cards.length === 0
      ? '<div class="peek-dialog__empty">Deck is empty.</div>'
      : "";

  root.innerHTML =
    '<div class="peek-dialog__backdrop" data-peek-action="close"></div>' +
    '<div class="peek-dialog__panel" role="dialog" aria-label="Top Deck Cards">' +
    '<div class="peek-dialog__header">' +
    '<div class="peek-dialog__title">Top Deck Cards</div>' +
    '<div class="peek-dialog__bulk">' +
    '<button type="button" class="peek-dialog__btn peek-dialog__btn--bulk" data-peek-action="more">Look at 1 More</button>' +
    '<button type="button" class="peek-dialog__btn peek-dialog__btn--bulk" data-peek-action="recycleAll">Recycle All</button>' +
    '<button type="button" class="peek-dialog__btn peek-dialog__btn--bulk" data-peek-action="reveal">Reveal to Opponent</button>' +
    '<button type="button" class="peek-dialog__btn peek-dialog__btn--close" data-peek-action="close">Close</button>' +
    "</div>" +
    "</div>" +
    `<div class="peek-dialog__tiles">${cardTiles}${emptyNote}</div>` +
    "</div>";

  root.classList.add("visible");

  // Bind listeners on each render (replaceChildren wiped previous nodes).
  root.querySelectorAll("[data-peek-action]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const action = el.getAttribute("data-peek-action");
      const cardId = el.getAttribute("data-card-id") || "";
      switch (action) {
        case "play":
          if (!el.hasAttribute("disabled")) _onPeekPlay(cardId);
          return;
        case "recycle":
          _onPeekRecycleOne(cardId);
          return;
        case "ontop":
          _onPeekToggleOnTop(cardId);
          return;
        case "tohand":
          _onPeekSendToHand(cardId);
          return;
        case "more":
          _onPeekLookMore();
          return;
        case "recycleAll":
          _onPeekRecycleAll();
          return;
        case "reveal":
          _onPeekRevealToOpponent();
          return;
        case "close":
          closePeekDialog();
          return;
        default:
          return;
      }
    });
  });
}

// Expose for renderer.js and tests.
window.openPeekDialog = openPeekDialog;
window.closePeekDialog = closePeekDialog;
window.renderPeekDialog = renderPeekDialog;
