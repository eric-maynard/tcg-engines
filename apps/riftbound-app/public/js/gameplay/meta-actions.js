// meta-actions.js — W10b Sandbox Action Panel
//
// Mounts a sidebar "Actions" panel with buttons that arm the hold-to-arm
// modes (counter, buff, duplicate, label, emote). Each button also lets the
// mouse-only user trigger the same workflow that the C/B/Shift+C/L/E keys
// provide from hotkeys.js.
//
// The Counter button has two sub-buttons (+ / −) that persist a "counter
// sign" in a module-level state. When counter mode is armed and a card is
// clicked (via hotkeys.handleArmedCardClick), the active sign determines
// whether the dispatched move is addCounter(cardId, "plus", +1) or
// addCounter(cardId, "minus", +1).
//
// Sandbox gating:
//   Duplicate and (future) Give Control dispatch engine moves that are
//   sandbox-only. We show the buttons in any game but disable them and
//   display a "Sandbox only" hint outside sandbox mode.
//
// Depends on globals from other gameplay scripts:
//   isSandboxGame, executeMove(), viewingPlayer, findCard(), showToast(),
//   openEmoteWheel(), setArmedMode(), disarmAll()

// ---- Module state -----------------------------------------------------------

/**
 * Sign used by the Counter button's +/− sub-buttons. "plus" routes to the
 * `plus` counter type, "minus" routes to the `minus` counter type. Both
 * ALWAYS dispatch a +1 delta (never a negative delta) per the task spec.
 * Persists between renders so the user's last choice sticks.
 */
let _counterSign = "plus";

/** @returns {"plus"|"minus"} current counter sign for armed counter-mode clicks */
function getCounterSign() {
  return _counterSign;
}

/** Persist the active counter sign and re-render the panel to reflect it. */
function setCounterSign(sign) {
  if (sign !== "plus" && sign !== "minus") return;
  _counterSign = sign;
  renderActionPanel();
}

// ---- Public armed-mode helpers ---------------------------------------------

/**
 * Arm a mode from a click on a panel button. Mirrors the hold-to-arm
 * behavior triggered by the corresponding hotkey: sets armedMode,
 * updates the banner, and opens any companion wheel.
 */
function armModeFromButton(mode) {
  if (typeof setArmedMode !== "function") return;
  setArmedMode(mode);
  if (mode === "emote" && typeof openEmoteWheel === "function") {
    openEmoteWheel();
  }
}

// ---- Engine dispatch helpers (called from hotkeys.handleArmedCardClick) ----

/**
 * Dispatch addCounter for the current counter sign. Always +1 delta;
 * the SIGN lives in the counter TYPE ("plus" vs "minus"), not the delta.
 */
function dispatchCounter(cardId) {
  if (typeof executeMove !== "function") return false;
  const pid = typeof viewingPlayer !== "undefined" ? viewingPlayer : null;
  if (!pid) return false;
  executeMove(
    "addCounter",
    { cardId, counterType: _counterSign, delta: 1 },
    pid
  );
  return true;
}

/**
 * Dispatch a default +1/+0 might buff. Prompt-driven custom buffs are
 * out of scope for W10b and will land in a later iteration.
 */
function dispatchBuff(cardId) {
  if (typeof executeMove !== "function") return false;
  const pid = typeof viewingPlayer !== "undefined" ? viewingPlayer : null;
  if (!pid) return false;
  executeMove("modifyBuff", { cardId, deltaMight: 1, deltaToughness: 0 }, pid);
  return true;
}

/**
 * Dispatch duplicateCard into the viewing player's hand. Sandbox-gated:
 * refuses to dispatch outside a sandbox game and surfaces a toast.
 */
function dispatchDuplicate(cardId) {
  if (typeof isSandboxGame !== "undefined" && !isSandboxGame) {
    if (typeof showToast === "function") {
      showToast("Duplicate is sandbox-only");
    }
    return false;
  }
  if (typeof executeMove !== "function") return false;
  const pid = typeof viewingPlayer !== "undefined" ? viewingPlayer : null;
  if (!pid) return false;
  executeMove(
    "duplicateCard",
    { playerId: pid, cardId, destinationZone: "hand" },
    pid
  );
  return true;
}

// ---- Panel rendering --------------------------------------------------------

/**
 * Mount / re-render the Actions panel into #actions-panel-mount. Safe to
 * call multiple times; rebuilds innerHTML from scratch each call.
 */
function renderActionPanel() {
  const mount = document.getElementById("actions-panel-mount");
  if (!mount) return;

  const sandbox = typeof isSandboxGame !== "undefined" ? Boolean(isSandboxGame) : false;
  const plusClass = _counterSign === "plus"
    ? "meta-actions-panel__subbtn meta-actions-panel__subbtn--active"
    : "meta-actions-panel__subbtn";
  const minusClass = _counterSign === "minus"
    ? "meta-actions-panel__subbtn meta-actions-panel__subbtn--active"
    : "meta-actions-panel__subbtn";

  const dupDisabledAttr = sandbox ? "" : " disabled";
  const dupHint = sandbox
    ? ""
    : '<div class="meta-actions-panel__hint">Sandbox only</div>';

  mount.innerHTML =
    '<div class="meta-actions-panel">' +
      '<div class="meta-actions-panel__title">Actions</div>' +

      // Counter row: main arm button + sign sub-buttons
      '<div class="meta-actions-panel__row">' +
        '<button type="button" class="meta-actions-panel__btn" data-action="arm-counter">' +
          "Add Counters (C)" +
        "</button>" +
        '<div class="meta-actions-panel__subbtns">' +
          '<button type="button" class="' + plusClass + '" data-action="sign-plus" aria-label="Plus counter">+</button>' +
          '<button type="button" class="' + minusClass + '" data-action="sign-minus" aria-label="Minus counter">&minus;</button>' +
        "</div>" +
      "</div>" +

      // Buff
      '<button type="button" class="meta-actions-panel__btn" data-action="arm-buff">' +
        "Apply Buff (B)" +
      "</button>" +

      // Duplicate (sandbox-gated)
      '<button type="button" class="meta-actions-panel__btn" data-action="arm-duplicate"' + dupDisabledAttr + ">" +
        "Duplicate (Shift+C)" +
      "</button>" +
      dupHint +

      // Label (re-uses existing label wheel)
      '<button type="button" class="meta-actions-panel__btn" data-action="arm-label">' +
        "Label Card (L)" +
      "</button>" +

      // Emote (re-uses existing emote wheel)
      '<button type="button" class="meta-actions-panel__btn" data-action="arm-emote">' +
        "Emote (E)" +
      "</button>" +
    "</div>";

  // Bind click handlers each render (listeners die with old nodes).
  const buttons = mount.querySelectorAll("[data-action]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-action");
      switch (action) {
        case "sign-plus":
          setCounterSign("plus");
          return;
        case "sign-minus":
          setCounterSign("minus");
          return;
        case "arm-counter":
          armModeFromButton("counter");
          return;
        case "arm-buff":
          armModeFromButton("buff");
          return;
        case "arm-duplicate": {
          const sb = typeof isSandboxGame !== "undefined" ? Boolean(isSandboxGame) : false;
          if (!sb) {
            if (typeof showToast === "function") {
              showToast("Duplicate is sandbox-only");
            }
            return;
          }
          // Duplicate re-uses the "counter" armed-mode channel? No — it
          // needs its own armed mode so handleArmedCardClick can tell
          // counter vs duplicate apart. We piggy-back on a string the
          // hotkey module recognizes via its Shift+C branch.
          if (typeof setArmedMode === "function") setArmedMode("duplicate");
          return;
        }
        case "arm-label":
          armModeFromButton("label");
          return;
        case "arm-emote":
          armModeFromButton("emote");
          return;
        default:
          return;
      }
    });
  });
}

let _metaActionsInitialized = false;

/**
 * One-shot initializer. Renders the panel and is safe to call from
 * multiple entry points (DOMContentLoaded, render(), etc).
 */
function initMetaActions() {
  if (_metaActionsInitialized) return;
  if (!document.getElementById("actions-panel-mount")) return;
  _metaActionsInitialized = true;
  renderActionPanel();
}

// Self-init on DOMContentLoaded — the mount div lives in gameplay.html so
// it exists at load. The sidebar itself is hidden until the game starts,
// but the panel inside it is already populated when it becomes visible.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMetaActions, { once: true });
} else {
  initMetaActions();
}

// Expose for hotkeys.js and future consumers.
window.getCounterSign = getCounterSign;
window.setCounterSign = setCounterSign;
window.renderActionPanel = renderActionPanel;
window.initMetaActions = initMetaActions;
window.dispatchCounter = dispatchCounter;
window.dispatchBuff = dispatchBuff;
window.dispatchDuplicate = dispatchDuplicate;
