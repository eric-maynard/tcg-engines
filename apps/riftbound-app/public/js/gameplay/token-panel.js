// token-panel.js — W10a per-zone token panels
//
// Renders a small collapsible "+" button on every battlefield and on the
// player's base. Clicking the button expands a grid of token-spawn
// buttons; each button dispatches the engine `addToken` move for the
// current viewing player and the zone the panel is attached to.
//
// Available tokens mirror Rift Atlas:
//   * Base gets all 6 tokens (Gold, Recruit, Mech, Sand Soldier, Sprite, Bird)
//   * Battlefields get 5 tokens (no Gold — tokens that fight go on the battlefield)
//
// The engine's `addToken` move handles narration, so every successful
// click produces a match-log entry like "Added Recruit token to
// battlefield-...". If it doesn't, that is a bug and should be reported.
//
// Dependencies (globals from other gameplay scripts):
//   executeMove(moveId, params, playerId)  — from game-flow.js
//   viewingPlayer                           — from state.js

// Full base token set, including the non-combat Gold token.
const BASE_TOKENS = ["Gold", "Recruit", "Mech", "Sand Soldier", "Sprite", "Bird"];
// Battlefield token set omits Gold; Gold is an economy/resource token,
// not a combat unit, and Rift Atlas does not offer it on battlefields.
const BATTLEFIELD_TOKENS = ["Recruit", "Mech", "Sand Soldier", "Sprite", "Bird"];

// Tracks the currently open panel so only one panel is expanded at a
// time and clicks outside auto-collapse it.
let _openTokenPanel = null;

/**
 * Collapse whatever token panel is currently open (if any).
 */
function _collapseOpenTokenPanel() {
  if (_openTokenPanel) {
    _openTokenPanel.classList.remove("token-panel--open");
    _openTokenPanel = null;
  }
}

// Single document-level listener that auto-collapses an open panel when
// the user clicks outside of it. Installed once, on first render.
let _tokenPanelDocListenerInstalled = false;
function _ensureDocListener() {
  if (_tokenPanelDocListenerInstalled) return;
  _tokenPanelDocListenerInstalled = true;
  document.addEventListener("click", (ev) => {
    if (!_openTokenPanel) return;
    const target = ev.target;
    if (target instanceof Node && _openTokenPanel.contains(target)) return;
    _collapseOpenTokenPanel();
  }, true);
}

/**
 * Render a collapsible token panel into the given mount element.
 *
 * @param {HTMLElement} mountEl  Container DOM node to append the panel
 *                               into (battlefield or base zone element).
 * @param {string} zoneId        Zone id to pass to `addToken` (e.g.
 *                               "battlefield-ogn-123" or "base").
 * @param {"battlefield"|"base"} zoneType  Which token list to offer.
 */
function renderTokenPanel(mountEl, zoneId, zoneType) {
  if (!mountEl) return;
  _ensureDocListener();

  // Remove any prior panel on this mount so re-renders don't stack.
  const existing = mountEl.querySelector(":scope > .token-panel");
  if (existing) existing.remove();

  const tokens = zoneType === "base" ? BASE_TOKENS : BATTLEFIELD_TOKENS;

  const panel = document.createElement("div");
  panel.className = "token-panel";
  panel.setAttribute("data-zone-id", zoneId);
  panel.setAttribute("data-zone-type", zoneType);

  // Open button — the "+" that expands the grid.
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "token-panel__open-btn";
  openBtn.title = "Add token";
  openBtn.setAttribute("aria-label", "Add token");
  openBtn.textContent = "+";
  openBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const wasOpen = panel.classList.contains("token-panel--open");
    _collapseOpenTokenPanel();
    if (!wasOpen) {
      panel.classList.add("token-panel--open");
      _openTokenPanel = panel;
    }
  });
  panel.appendChild(openBtn);

  // Expanded grid of token-spawn buttons.
  const grid = document.createElement("div");
  grid.className = "token-panel__grid";
  for (const tokenName of tokens) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "token-panel__btn";
    btn.textContent = `+ ${tokenName}`;
    btn.title = `Add a ${tokenName} token to this zone`;
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      // Dispatch the move through the standard pipeline so the engine
      // emits its narration line into the match log.
      const pid = typeof viewingPlayer !== "undefined" ? viewingPlayer : undefined;
      if (typeof executeMove === "function") {
        executeMove("addToken", { playerId: pid, zoneId, tokenName }, pid);
      }
      _collapseOpenTokenPanel();
    });
    grid.appendChild(btn);
  }
  panel.appendChild(grid);

  mountEl.appendChild(panel);
}

// Expose to the global gameplay namespace. Other scripts (renderer.js)
// use window-global functions rather than ES modules.
window.renderTokenPanel = renderTokenPanel;
