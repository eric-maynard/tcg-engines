// hotkeys.js — Global keyboard handler with Rift Atlas keymap + hold-to-arm modes
//
// This file defines:
//   - The full keymap (PRESS keys and HOLD keys)
//   - The hold-to-arm state machine (C / B / T / L / E / P)
//   - A global keydown/keyup handler that dispatches actions
//   - Helpers the rest of the app calls to check if a card-click should be
//     intercepted by an armed mode (see interactions.js)
//
// NOTE: The Space bar is ALREADY handled by init.js (pass chain priority, or
// fall back to end turn). We intentionally do NOT re-bind Space here to avoid
// double-dispatch. All other keys below are owned by this module.
//
// Depends on globals from other gameplay scripts:
//   availableMoves, gameState, viewingPlayer, executeMove(), findCard(),
//   showToast(), cancelInteraction(), openHelpModal(), closeHelpModal()

// ---- Armed mode state -------------------------------------------------------

/**
 * Current armed mode, or null if no mode is armed.
 * Possible values: "counter" | "buff" | "target" | "label" | "emote" | "ping"
 */
let armedMode = null;

/**
 * Stack of currently-held armed keys (most recent wins).
 * Each entry: { key: "c", mode: "counter" }
 */
const armedKeyStack = [];

/** Map from physical key (lowercased) to armed-mode name. */
const HOLD_KEY_TO_MODE = {
  c: "counter",
  b: "buff",
  t: "target",
  l: "label",
  e: "emote",
  p: "ping",
};

/** Human-readable banner text for each armed mode. */
const ARMED_MODE_LABEL = {
  counter: "Counter mode — click a card to apply a counter",
  buff: "Buff mode — click a unit to apply a might buff",
  target: "Target mode — click a target for the top chain effect",
  label: "Label wheel — click a card to label it",
  emote: "Emote wheel",
  ping: "Ping mode — click a card to ping it for your opponent",
  // W10b: Shift+C arms duplicate mode. Sandbox-gated at dispatch time.
  duplicate: "Duplicate mode — click a card to copy it into your hand",
  // W16: bare Shift hold arms "place on top of deck" for the viewer's hand.
  "top-of-deck": "Top of deck mode — click a hand card to place it on top of your deck",
};

/** @returns {string|null} the current armed mode name (for interactions.js) */
function getArmedMode() {
  return armedMode;
}

/** @returns {boolean} true if an armed mode is currently active */
function isArmed() {
  return armedMode !== null;
}

/**
 * Handle a click on a .card element while an armed mode is active.
 * Returns true if the click was consumed by the armed-mode handler,
 * false if the caller should fall through to the default click behavior.
 */
function handleArmedCardClick(cardId) {
  if (!armedMode) return false;
  const mode = armedMode;

  switch (mode) {
    case "counter":
      // W10b: dispatch addCounter via meta-actions.js with the currently
      // selected sign (+ / −). meta-actions owns the sign so the panel UI
      // and the armed-mode click path stay in sync.
      if (typeof dispatchCounter === "function") {
        dispatchCounter(cardId);
      }
      break;

    case "buff":
      // W10b: default +1/0 might buff. Prompt-driven custom deltas are
      // out of scope for this workstream.
      if (typeof dispatchBuff === "function") {
        dispatchBuff(cardId);
      }
      break;

    case "duplicate":
      // W10b: sandbox-only. meta-actions.dispatchDuplicate gates internally
      // and surfaces a toast outside sandbox games.
      if (typeof dispatchDuplicate === "function") {
        dispatchDuplicate(cardId);
      }
      break;

    case "top-of-deck": {
      // W16: hold Shift + click a hand card → place it on top of the
      // viewer's main deck. Gate on (a) viewer actually owns this card
      // and (b) the card currently lives in the `hand` zone. The server
      // validates too, but this keeps the armed-click path quiet when
      // the user clicks something nonsensical (an opponent card, a
      // battlefield unit, etc.) instead of spamming move rejections.
      const card = typeof findCard === "function" ? findCard(cardId) : null;
      const zone = typeof findCardZone === "function" ? findCardZone(cardId) : null;
      const pid = typeof viewingPlayer !== "undefined" ? viewingPlayer : null;
      if (!card || !pid || card.owner !== pid || zone !== "hand") {
        if (typeof showToast === "function") {
          showToast("Can only place your own hand cards on top");
        }
        break;
      }
      if (typeof executeMove === "function") {
        executeMove(
          "placeCardsOnTopOfDeckInOrder",
          { playerId: pid, cardIds: [cardId] },
          pid
        );
      }
      break;
    }

    case "target":
      // Target mode is gated on a "top-of-chain effect needs a target"
      // signal that doesn't exist until chain-interaction matures. Keep
      // the stub so future work can pick it up without reshaping this
      // switch.
      // eslint-disable-next-line no-console
      console.log(`[hotkeys] TODO: target mode on ${cardId} — awaiting chain interaction work`);
      if (typeof showToast === "function") {
        showToast("Target mode — not yet implemented");
      }
      break;

    case "label":
      openLabelWheel(cardId);
      break;

    case "emote":
      // Emote wheel is cardId-agnostic; opened on keydown. Click is a no-op.
      break;

    case "ping":
      pingCardForOpponent(cardId);
      break;

    default:
      return false;
  }

  // After an armed action fires, dismiss the mode (user released target)
  disarmAll();
  return true;
}

/** Set the active armed mode and refresh the banner / cursor. */
function setArmedMode(mode) {
  armedMode = mode;
  updateArmedBanner();
  document.body.classList.toggle("armed-mode", mode !== null);
  if (mode) {
    document.body.setAttribute("data-armed-mode", mode);
  } else {
    document.body.removeAttribute("data-armed-mode");
  }
}

/** Clear all armed state (used on keyup of last key, Escape, click-through). */
function disarmAll() {
  armedKeyStack.length = 0;
  setArmedMode(null);
  closeEmoteWheel();
  closeLabelWheel();
}

/** Update the fixed banner at the top of the screen. */
function updateArmedBanner() {
  let banner = document.getElementById("armedBanner");
  if (!armedMode) {
    if (banner) banner.classList.remove("visible");
    return;
  }
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "armedBanner";
    banner.className = "armed-banner";
    document.body.appendChild(banner);
  }
  banner.textContent = ARMED_MODE_LABEL[armedMode] || armedMode;
  banner.classList.add("visible");
}

// ---- UI-only placeholder handlers (L / E / P) -------------------------------

function openLabelWheel(cardId) {
  // Minimal placeholder — full radial menu is a future polish pass.
  let wheel = document.getElementById("labelWheel");
  if (!wheel) {
    wheel = document.createElement("div");
    wheel.id = "labelWheel";
    wheel.className = "radial-wheel label-wheel";
    wheel.innerHTML = `
      <div class="radial-wheel-title">Label Card</div>
      <div class="radial-wheel-opts">
        <button class="radial-opt">Target</button>
        <button class="radial-opt">Threat</button>
        <button class="radial-opt">Ignore</button>
      </div>
      <div class="radial-wheel-sub">${cardId}</div>
    `;
    document.body.appendChild(wheel);
  }
  wheel.classList.add("visible");
}

function closeLabelWheel() {
  const wheel = document.getElementById("labelWheel");
  if (wheel) wheel.classList.remove("visible");
}

function openEmoteWheel() {
  let wheel = document.getElementById("emoteWheel");
  if (!wheel) {
    wheel = document.createElement("div");
    wheel.id = "emoteWheel";
    wheel.className = "radial-wheel emote-wheel";
    wheel.innerHTML = `
      <div class="radial-wheel-title">Emotes</div>
      <div class="radial-wheel-opts">
        <button class="radial-opt">GG</button>
        <button class="radial-opt">Nice!</button>
        <button class="radial-opt">Thinking</button>
        <button class="radial-opt">Oops</button>
      </div>
    `;
    document.body.appendChild(wheel);
  }
  wheel.classList.add("visible");
}

function closeEmoteWheel() {
  const wheel = document.getElementById("emoteWheel");
  if (wheel) wheel.classList.remove("visible");
}

function pingCardForOpponent(cardId) {
  // Placeholder — real implementation will fire a network event in a later workstream.
  if (typeof showToast === "function") {
    showToast("Ping sent (placeholder)");
  }
  // eslint-disable-next-line no-console
  console.log(`[hotkeys] ping: ${cardId}`);
}

// ---- PRESS-key handlers -----------------------------------------------------

function hotkeyEndTurn() {
  const endTurnMove = (typeof availableMoves !== "undefined" ? availableMoves : []).find(
    m => m.moveId === "endTurn"
  );
  if (endTurnMove) {
    executeMove(endTurnMove.moveId, endTurnMove.params, endTurnMove.playerId);
  } else if (typeof showToast === "function") {
    showToast("Can't end turn right now");
  }
}

function hotkeyDrawCard() {
  const drawMove = (typeof availableMoves !== "undefined" ? availableMoves : []).find(
    m => m.moveId === "drawCard"
  );
  if (drawMove) {
    executeMove(drawMove.moveId, drawMove.params, drawMove.playerId);
  } else if (typeof showToast === "function") {
    showToast("Can't draw right now");
  }
}

function hotkeyRewind() {
  // W8: R / Backspace fire the same WS undo request as the sidebar Rewind
  // button. The server rejects if there is nothing to rewind; the client
  // clears any armed hotkey mode and in-progress interaction state via
  // clearInteractionStateOnRewind() once the new state frame arrives.
  if (typeof requestUndo === "function") {
    requestUndo();
  }
}

function hotkeyApproveChain() {
  // Approve the top chain effect = pass priority/focus.
  const passMove = (typeof availableMoves !== "undefined" ? availableMoves : []).find(
    m => m.moveId === "passChainPriority" || m.moveId === "passShowdownFocus"
  );
  if (passMove) {
    executeMove(passMove.moveId, passMove.params, passMove.playerId);
  } else if (typeof showToast === "function") {
    showToast("No chain effect to approve");
  }
}

function hotkeyResolveChain() {
  const resolveMove = (typeof availableMoves !== "undefined" ? availableMoves : []).find(
    m => m.moveId === "resolveChain"
  );
  if (resolveMove) {
    executeMove(resolveMove.moveId, resolveMove.params, resolveMove.playerId);
  } else if (typeof showToast === "function") {
    showToast("Nothing on the chain to resolve");
  }
}

function hotkeyEndShowdown() {
  // W9: Q routes to the active battlefield showdown. The helper handles
  // both "conquer" (when both sides have passed) and graceful fallback to
  // a toast when the showdown isn't ready to close yet.
  if (typeof showdownHotkeyConquer === "function") {
    showdownHotkeyConquer();
    return;
  }
  if (typeof showToast === "function") {
    showToast("No active showdown");
  }
}

function hotkeyPassFocus() {
  // W9: W routes focus-passing through the per-battlefield showdown
  // helper so it naturally picks the showdown the viewer actually has
  // focus on (not the ambient `passShowdownFocus` move).
  if (typeof showdownHotkeyPassFocus === "function") {
    showdownHotkeyPassFocus();
    return;
  }
  const passMove = (typeof availableMoves !== "undefined" ? availableMoves : []).find(
    m => m.moveId === "passShowdownFocus"
  );
  if (passMove) {
    executeMove(passMove.moveId, passMove.params, passMove.playerId);
  } else if (typeof showToast === "function") {
    showToast("No active showdown");
  }
}

// ---- Global key listener ----------------------------------------------------

function shouldIgnoreKeyEvent(e) {
  const t = e.target;
  if (!t) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}

function onHotkeyKeydown(e) {
  if (shouldIgnoreKeyEvent(e)) return;

  // Escape: close help modal / dismiss armed mode. (Other Escape handling
  // remains in init.js and cooperates fine.)
  if (e.key === "Escape") {
    if (isHelpModalOpen && isHelpModalOpen()) {
      closeHelpModal();
      return;
    }
    if (armedMode) {
      disarmAll();
      return;
    }
  }

  // `?` (Shift+/) toggles the help modal.
  if (e.key === "?") {
    e.preventDefault();
    toggleHelpModal();
    return;
  }

  // W16: bare Shift hold arms "top-of-deck" mode. Ignored if an armed
  // key already claims the mode (e.g. Shift+C → duplicate); the C
  // keydown branch below pushes its own stack entry and wins most-recent.
  if (e.key === "Shift") {
    if (e.repeat) return;
    if (!armedKeyStack.find(entry => entry.key === "shift")) {
      armedKeyStack.push({ key: "shift", mode: "top-of-deck" });
    }
    // Only set the mode if nothing higher-priority is already armed. The
    // HOLD_KEY_TO_MODE keydown branch later will override via setArmedMode
    // if the user presses C while holding Shift.
    if (!armedMode || armedMode === "top-of-deck") {
      setArmedMode("top-of-deck");
    }
    // Scope preventDefault to the game surface so Shift-click text
    // selection in chat / dev tools / sidebar inputs still works.
    const target = e.target;
    const inGame =
      target && typeof target.closest === "function" && target.closest("#game-scale-wrapper");
    if (inGame) {
      e.preventDefault();
    }
    return;
  }

  // Hold-to-arm keys.
  const lower = e.key.length === 1 ? e.key.toLowerCase() : "";
  if (lower && HOLD_KEY_TO_MODE[lower]) {
    // Ignore auto-repeat — we only care about the initial press.
    if (e.repeat) {
      e.preventDefault();
      return;
    }
    // W10b: Shift+C arms sandbox Duplicate mode instead of Counter mode.
    // We track it under a synthetic key "shift+c" so the keyup on plain
    // "c" still cleans up the duplicate entry from the stack.
    let mode = HOLD_KEY_TO_MODE[lower];
    let stackKey = lower;
    if (lower === "c" && e.shiftKey) {
      mode = "duplicate";
      stackKey = "shift+c";
    }
    // Push onto stack if not already held.
    if (!armedKeyStack.find(entry => entry.key === stackKey)) {
      armedKeyStack.push({ key: stackKey, mode });
    }
    setArmedMode(mode);
    // E opens the emote wheel immediately (doesn't require a card click).
    if (mode === "emote") openEmoteWheel();
    e.preventDefault();
    return;
  }

  // Press keys (ignore if the user is holding a modifier we don't want).
  // We allow Backspace through but block Ctrl/Meta + letter chords so undo etc.
  // keeps working via init.js.
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  switch (e.key) {
    case "d":
    case "D":
      e.preventDefault();
      hotkeyDrawCard();
      return;
    case "r":
    case "R":
      e.preventDefault();
      hotkeyRewind();
      return;
    case "Backspace":
      e.preventDefault();
      hotkeyRewind();
      return;
    case "a":
    case "A":
      e.preventDefault();
      hotkeyApproveChain();
      return;
    case "s":
    case "S":
      e.preventDefault();
      hotkeyResolveChain();
      return;
    case "q":
    case "Q":
      e.preventDefault();
      hotkeyEndShowdown();
      return;
    case "w":
    case "W":
      e.preventDefault();
      hotkeyPassFocus();
      return;
    default:
      return;
  }
}

function onHotkeyKeyup(e) {
  // W16: releasing Shift clears the top-of-deck arm and any lingering
  // "shift+c" duplicate arm that the plain-C keyup branch couldn't see
  // (e.g. user let go of Shift before C).
  if (e.key === "Shift") {
    const shiftIdx = armedKeyStack.findIndex(entry => entry.key === "shift");
    if (shiftIdx !== -1) armedKeyStack.splice(shiftIdx, 1);
    const shiftCIdx = armedKeyStack.findIndex(entry => entry.key === "shift+c");
    if (shiftCIdx !== -1) armedKeyStack.splice(shiftCIdx, 1);
    if (armedKeyStack.length === 0) {
      disarmAll();
    } else {
      const top = armedKeyStack[armedKeyStack.length - 1];
      setArmedMode(top.mode);
      if (top.mode !== "emote") closeEmoteWheel();
      if (top.mode !== "label") closeLabelWheel();
    }
    return;
  }

  const lower = e.key.length === 1 ? e.key.toLowerCase() : "";
  if (!lower || !HOLD_KEY_TO_MODE[lower]) return;

  // W10b: releasing plain "c" also clears a lingering "shift+c" entry so
  // the Duplicate armed mode doesn't stick around after the user lets
  // go of C while shift was the last modifier held.
  const idx = armedKeyStack.findIndex(entry => entry.key === lower);
  if (idx !== -1) armedKeyStack.splice(idx, 1);
  if (lower === "c") {
    const shiftIdx = armedKeyStack.findIndex(entry => entry.key === "shift+c");
    if (shiftIdx !== -1) armedKeyStack.splice(shiftIdx, 1);
  }

  if (armedKeyStack.length === 0) {
    disarmAll();
  } else {
    // Most-recent wins.
    const top = armedKeyStack[armedKeyStack.length - 1];
    setArmedMode(top.mode);
    // Close any wheel that doesn't match the new mode.
    if (top.mode !== "emote") closeEmoteWheel();
    if (top.mode !== "label") closeLabelWheel();
  }
}

/**
 * Safety: if the user alt-tabs away while holding a key, the keyup never
 * reaches us. Clear armed state on blur.
 */
function onHotkeyBlur() {
  disarmAll();
}

/** Wire the global listeners. Called once at startup from interactions.js. */
function initHotkeys() {
  document.addEventListener("keydown", onHotkeyKeydown);
  document.addEventListener("keyup", onHotkeyKeyup);
  window.addEventListener("blur", onHotkeyBlur);
}

// Expose globals for consumers in other non-module scripts.
window.getArmedMode = getArmedMode;
window.isArmed = isArmed;
window.handleArmedCardClick = handleArmedCardClick;
window.initHotkeys = initHotkeys;
// W8: renderer calls disarmAll() to clear armed state on rewind.
window.disarmAll = disarmAll;
