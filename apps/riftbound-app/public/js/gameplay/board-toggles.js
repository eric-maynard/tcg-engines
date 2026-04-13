/*
 * W10c — Board toggles panel
 *
 * Client-only sidebar panel that exposes three board-wide switches mirroring
 * Rift Atlas's reference behavior. These settings persist in localStorage and
 * are read by future workstreams that wire them into actual client behavior.
 * This file is intentionally self-contained: no engine moves, no server
 * round-trips, no renderer coupling beyond a one-shot mount call.
 */

const BOARD_TOGGLES_KEY = "rba-board-toggles";

const BOARD_TOGGLE_DEFAULTS = Object.freeze({
  stopAtBeginning: false,
  autoScoreFromHold: true,
  xpCounter: false,
});

// Order matters for rendering. Keep stable so reading this list produces the
// same DOM shape across reloads.
const BOARD_TOGGLE_DEFS = [
  {
    name: "stopAtBeginning",
    label: "Stop At Beginning Phase",
    subline: "Pause client auto-advance at the start of each turn.",
  },
  {
    name: "autoScoreFromHold",
    label: "Auto Score From Hold",
    subline: "Automatically score at end of turn while holding a battlefield.",
  },
  {
    name: "xpCounter",
    label: "XP Counter",
    subline: "Show an XP counter for leveled formats.",
  },
];

function _readBoardToggles() {
  try {
    const raw = localStorage.getItem(BOARD_TOGGLES_KEY);
    if (!raw) return { ...BOARD_TOGGLE_DEFAULTS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...BOARD_TOGGLE_DEFAULTS };
    }
    return {
      stopAtBeginning: typeof parsed.stopAtBeginning === "boolean"
        ? parsed.stopAtBeginning
        : BOARD_TOGGLE_DEFAULTS.stopAtBeginning,
      autoScoreFromHold: typeof parsed.autoScoreFromHold === "boolean"
        ? parsed.autoScoreFromHold
        : BOARD_TOGGLE_DEFAULTS.autoScoreFromHold,
      xpCounter: typeof parsed.xpCounter === "boolean"
        ? parsed.xpCounter
        : BOARD_TOGGLE_DEFAULTS.xpCounter,
    };
  } catch (_err) {
    return { ...BOARD_TOGGLE_DEFAULTS };
  }
}

function _writeBoardToggles(state) {
  try {
    localStorage.setItem(BOARD_TOGGLES_KEY, JSON.stringify(state));
  } catch (_err) {
    // localStorage may be unavailable (private mode, quota, etc.). Swallow:
    // the panel still works in-memory for the current session.
  }
}

/**
 * Returns the current board toggle state, falling back to defaults for any
 * missing or malformed entries in localStorage.
 */
function getBoardToggles() {
  return _readBoardToggles();
}

/**
 * Flips or sets a single toggle and re-renders the panel so the pill UI
 * reflects the new value immediately.
 */
function setBoardToggle(name, value) {
  if (!Object.prototype.hasOwnProperty.call(BOARD_TOGGLE_DEFAULTS, name)) {
    return;
  }
  const current = _readBoardToggles();
  current[name] = Boolean(value);
  _writeBoardToggles(current);
  renderBoardTogglesPanel();
}

/**
 * Renders the toggles panel into #board-toggles-panel. Safe to call multiple
 * times; rebuilds innerHTML from scratch each call.
 */
function renderBoardTogglesPanel() {
  const mount = document.getElementById("board-toggles-panel");
  if (!mount) return;

  const state = _readBoardToggles();

  const rows = BOARD_TOGGLE_DEFS.map((def) => {
    const on = Boolean(state[def.name]);
    const pillClass = on
      ? "board-toggles-panel__pill board-toggles-panel__pill--on"
      : "board-toggles-panel__pill";
    const pillText = on ? "On" : "Off";
    // Using data-* attributes keeps the click handler generic and avoids
    // inline onclick string escaping headaches.
    return (
      '<div class="board-toggles-panel__row">' +
        '<div class="board-toggles-panel__text">' +
          '<div class="board-toggles-panel__label">' + def.label + "</div>" +
          '<div class="board-toggles-panel__subline">' + def.subline + "</div>" +
        "</div>" +
        '<button type="button" class="' + pillClass + '" data-toggle-name="' + def.name + '" aria-pressed="' + on + '">' + pillText + "</button>" +
      "</div>"
    );
  }).join("");

  mount.innerHTML =
    '<div class="board-toggles-panel__title">Toggles</div>' + rows;

  // Bind click handlers each render. Because we rebuild innerHTML, old
  // listeners are discarded with the old nodes.
  const pills = mount.querySelectorAll("[data-toggle-name]");
  pills.forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-toggle-name");
      if (!name) return;
      const latest = _readBoardToggles();
      setBoardToggle(name, !latest[name]);
    });
  });
}

let _boardTogglesInitialized = false;

/**
 * One-shot initializer called from the renderer on first render. Subsequent
 * calls are no-ops so we don't re-bind or thrash the DOM.
 */
function initBoardToggles() {
  if (_boardTogglesInitialized) return;
  if (!document.getElementById("board-toggles-panel")) return;
  _boardTogglesInitialized = true;
  renderBoardTogglesPanel();
}

// Expose for future workstreams that need to read flags without importing.
window.getBoardToggles = getBoardToggles;
window.setBoardToggle = setBoardToggle;
window.renderBoardTogglesPanel = renderBoardTogglesPanel;
window.initBoardToggles = initBoardToggles;
