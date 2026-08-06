// render/hand.js — Per-card Hide toggle for the viewer's hand (W13).
// Classic script: everything is global. Split out of renderer.js.

// ============================================
// W13: Per-card Hide toggle in hand
// ============================================
// Client-only privacy toggle. Players sometimes want to hide a specific card
// in their own hand (e.g. when streaming). This is purely UI — the engine
// still treats the card normally, and the hidden state persists in
// localStorage so it survives page reloads.

const HIDDEN_HAND_STORAGE_KEY = "rba-hidden-hand-cards";

/** Lazily-loaded Set<string> of card IDs the viewer has hidden. */
let _hiddenHandCards = null;

function _loadHiddenHandCards() {
  if (_hiddenHandCards) return _hiddenHandCards;
  _hiddenHandCards = new Set();
  try {
    const raw = localStorage.getItem(HIDDEN_HAND_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const id of parsed) if (typeof id === "string") _hiddenHandCards.add(id);
      }
    }
  } catch (err) {
    console.warn("[renderer] failed to load hidden-hand-cards from localStorage", err);
  }
  return _hiddenHandCards;
}

function _saveHiddenHandCards() {
  if (!_hiddenHandCards) return;
  try {
    localStorage.setItem(
      HIDDEN_HAND_STORAGE_KEY,
      JSON.stringify(Array.from(_hiddenHandCards)),
    );
  } catch (err) {
    console.warn("[renderer] failed to persist hidden-hand-cards", err);
  }
}

function isHandCardHidden(cardId) {
  return _loadHiddenHandCards().has(cardId);
}

/** Toggle the hidden state of a card in hand and re-render. */
function toggleHideHandCard(cardId) {
  const set = _loadHiddenHandCards();
  if (set.has(cardId)) {
    set.delete(cardId);
  } else {
    set.add(cardId);
  }
  _saveHiddenHandCards();
  if (typeof render === "function") render();
}
window.toggleHideHandCard = toggleHideHandCard;
