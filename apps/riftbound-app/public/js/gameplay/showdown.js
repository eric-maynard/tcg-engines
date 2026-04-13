// showdown.js — W9 inline showdown UI per battlefield
//
// Renders a per-battlefield `.battlefield__showdown-panel` child when that
// battlefield has an active showdown. Three explicit exits replace the
// ambiguous "Dismiss" anti-pattern:
//
//   - Pass Focus (W)  — passShowdownFocus { playerId }
//   - Conquer   (Q)   — conquerBattlefield { playerId, battlefieldId }
//                       enabled only when all relevant players have passed
//   - Cancel           — endShowdown (no params)
//                       visible only to the initiator while nothing has been
//                       contributed yet (passedPlayers.length === 0)
//
// The chain overlay used to display showdown state in a centered modal; that
// rendering has been pulled here. The chain overlay still renders the spell
// chain itself.
//
// Depends on globals from other gameplay scripts:
//   gameState, viewingPlayer, availableMoves, executeMove(), esc(), pName(),
//   showToast()

/**
 * Collect every active showdown (top-of-stack per battlefield) keyed by
 * battlefieldId. Today the server only exposes a single top-of-stack
 * showdown via `gameState.interaction.showdown`, but this helper is written
 * so that future multi-simultaneous-showdown support is a drop-in upgrade
 * once the server starts emitting an array.
 *
 * @returns {Record<string, object>} map of battlefieldId → showdown state
 */
function getActiveShowdownsByBattlefield() {
  const out = {};
  const interaction = gameState?.interaction;
  if (!interaction) return out;

  const single = interaction.showdown;
  if (single?.active && single.battlefieldId) {
    out[single.battlefieldId] = single;
  }

  // Forward-compat: if the server ever emits a full stack or array, index
  // each active entry by battlefieldId.
  const stack = interaction.showdownStack;
  if (Array.isArray(stack)) {
    for (const sd of stack) {
      if (sd?.active && sd.battlefieldId) {
        out[sd.battlefieldId] = sd;
      }
    }
  }

  return out;
}

/**
 * Pick the single showdown that should receive Q/W hotkey input.
 *
 * Preference order:
 *   1. A showdown where the viewing player currently holds focus
 *   2. Any active showdown (first match)
 *   3. null
 *
 * @returns {object|null}
 */
function getActiveShowdownForHotkey() {
  const byBf = getActiveShowdownsByBattlefield();
  const values = Object.values(byBf);
  if (values.length === 0) return null;

  const mine = values.find(sd => sd.focusPlayer === viewingPlayer);
  if (mine) return mine;
  return values[0];
}

/**
 * Derive the effective initiator of a showdown. The engine does not record
 * this explicitly, so:
 *   - Combat showdowns: the attacker is the initiator.
 *   - Non-combat showdowns: fall back to the current turn's active player,
 *     since they are the only party that can open a showdown.
 */
function getShowdownInitiator(showdown) {
  if (showdown.isCombatShowdown && showdown.attackingPlayer) {
    return showdown.attackingPlayer;
  }
  return gameState?.turn?.activePlayer ?? null;
}

/**
 * True when every relevant player has passed focus since the last action.
 * When this is true the showdown is ready to close (engine has already set
 * `active: false`, but the stack entry still lingers until `endShowdown`
 * fires, so we also accept `!showdown.active`).
 */
function isShowdownReadyToClose(showdown) {
  if (!showdown) return false;
  if (showdown.active === false) return true;
  const passed = Array.isArray(showdown.passedPlayers) ? showdown.passedPlayers : [];
  const relevant = Array.isArray(showdown.relevantPlayers) ? showdown.relevantPlayers : [];
  if (relevant.length === 0) return false;
  return relevant.every(p => passed.includes(p));
}

/**
 * True when the viewing player is allowed to cancel this showdown. Because
 * the engine tracks neither an explicit "initiator" nor an "opponent has
 * acted" flag, we use the most conservative proxy: only the derived
 * initiator can cancel, and only while `passedPlayers` is still empty (no
 * one has participated yet).
 */
function canViewerCancelShowdown(showdown) {
  const initiator = getShowdownInitiator(showdown);
  if (!initiator || initiator !== viewingPlayer) return false;
  const passed = Array.isArray(showdown.passedPlayers) ? showdown.passedPlayers : [];
  return passed.length === 0;
}

/**
 * Find a specific move in `availableMoves` by id, matching on optional
 * battlefieldId where applicable. Returns `null` if the move isn't
 * currently legal for this player.
 */
function findShowdownMove(moveId, battlefieldId) {
  const moves = typeof availableMoves !== "undefined" ? availableMoves : [];
  return (
    moves.find(m => {
      if (m.moveId !== moveId) return false;
      if (!battlefieldId) return true;
      const mbf = m.params?.battlefieldId;
      return !mbf || mbf === battlefieldId;
    }) || null
  );
}

/**
 * Inject a `.battlefield__showdown-panel` child into the given battlefield
 * element. Called from renderer.js after the battlefield DOM is built.
 *
 * @param {HTMLElement} battlefieldEl
 * @param {string} battlefieldId
 * @param {object} showdown — top-of-stack showdown state for this battlefield
 */
function renderBattlefieldShowdownPanel(battlefieldEl, battlefieldId, showdown) {
  if (!battlefieldEl || !showdown) return;

  // Avoid duplicate panels if render() re-enters for the same element.
  const existing = battlefieldEl.querySelector(":scope > .battlefield__showdown-panel");
  if (existing) existing.remove();

  const hasFocus = showdown.focusPlayer === viewingPlayer;
  const readyToClose = isShowdownReadyToClose(showdown);
  const canCancel = canViewerCancelShowdown(showdown);

  const focusName = pName(showdown.focusPlayer);
  const bannerText = readyToClose
    ? "All passes registered — ready to conquer"
    : hasFocus
    ? "Showdown in progress — your focus"
    : `Waiting on ${focusName}...`;
  const bannerClass = readyToClose
    ? "battlefield__showdown-banner--ready"
    : hasFocus
    ? "battlefield__showdown-banner--mine"
    : "battlefield__showdown-banner--theirs";

  // Pass Focus button — only the focus holder can pass.
  const passMove = hasFocus ? findShowdownMove("passShowdownFocus") : null;
  const passDisabled = !passMove;

  // Conquer button — enabled only when all passes registered AND the move
  // is legal for this viewer.
  const conquerMove = readyToClose ? findShowdownMove("conquerBattlefield", battlefieldId) : null;
  const conquerDisabled = !conquerMove;

  // Cancel button — only the initiator can cancel, and only while nobody
  // has acted. Dispatches endShowdown.
  const cancelMove = canCancel ? findShowdownMove("endShowdown") : null;
  const cancelVisible = canCancel && Boolean(cancelMove);

  const panel = document.createElement("div");
  panel.className = "battlefield__showdown-panel";
  panel.setAttribute("data-battlefield-id", battlefieldId);

  const typeLabel = showdown.isCombatShowdown ? "Combat Showdown" : "Showdown";

  panel.innerHTML = `
    <div class="battlefield__showdown-banner ${bannerClass}">
      <span class="battlefield__showdown-type">${esc(typeLabel)}</span>
      <span class="battlefield__showdown-status">${esc(bannerText)}</span>
    </div>
    <div class="battlefield__showdown-actions">
      <button type="button"
              class="battlefield__showdown-btn battlefield__showdown-btn--pass"
              ${passDisabled ? "disabled" : ""}
              title="Pass Focus (W)">
        Pass Focus
        <span class="battlefield__showdown-hint">W</span>
      </button>
      <button type="button"
              class="battlefield__showdown-btn battlefield__showdown-btn--conquer"
              ${conquerDisabled ? "disabled" : ""}
              title="${conquerDisabled ? "Conquer (both sides must pass first)" : "Conquer (Q)"}">
        Conquer
        <span class="battlefield__showdown-hint">Q</span>
      </button>
      ${cancelVisible
        ? `<button type="button"
                  class="battlefield__showdown-btn battlefield__showdown-btn--cancel"
                  title="Cancel — only available before either side has acted">
             Cancel
           </button>`
        : ""}
    </div>
  `;

  // Stop clicks inside the panel from falling through to the battlefield's
  // onclick handler (which can trigger drop-zone/drag logic).
  panel.addEventListener("click", ev => ev.stopPropagation());
  panel.addEventListener("mousedown", ev => ev.stopPropagation());
  panel.addEventListener("pointerdown", ev => ev.stopPropagation());

  const passBtn = panel.querySelector(".battlefield__showdown-btn--pass");
  if (passBtn && passMove) {
    passBtn.addEventListener("click", () => {
      executeMove(passMove.moveId, passMove.params, passMove.playerId);
    });
  }

  const conquerBtn = panel.querySelector(".battlefield__showdown-btn--conquer");
  if (conquerBtn && conquerMove) {
    conquerBtn.addEventListener("click", () => {
      executeMove(conquerMove.moveId, conquerMove.params, conquerMove.playerId);
    });
  }

  const cancelBtn = panel.querySelector(".battlefield__showdown-btn--cancel");
  if (cancelBtn && cancelMove) {
    cancelBtn.addEventListener("click", () => {
      executeMove(cancelMove.moveId, cancelMove.params, cancelMove.playerId);
    });
  }

  battlefieldEl.appendChild(panel);
}

/**
 * Hotkey: pass focus on the active battlefield showdown (W).
 * Falls through to a toast if no showdown is active or the viewer doesn't
 * hold focus.
 */
function showdownHotkeyPassFocus() {
  const sd = getActiveShowdownForHotkey();
  if (!sd) {
    if (typeof showToast === "function") showToast("No active showdown");
    return;
  }
  if (sd.focusPlayer !== viewingPlayer) {
    if (typeof showToast === "function") showToast("You don't have focus");
    return;
  }
  const move = findShowdownMove("passShowdownFocus");
  if (!move) {
    if (typeof showToast === "function") showToast("Can't pass focus right now");
    return;
  }
  executeMove(move.moveId, move.params, move.playerId);
}

/**
 * Hotkey: conquer the active battlefield showdown (Q). Only fires when
 * every relevant player has passed; otherwise shows a hint toast.
 */
function showdownHotkeyConquer() {
  const sd = getActiveShowdownForHotkey();
  if (!sd) {
    if (typeof showToast === "function") showToast("No active showdown");
    return;
  }
  if (!isShowdownReadyToClose(sd)) {
    if (typeof showToast === "function") showToast("Both sides must pass before you can conquer");
    return;
  }
  const move = findShowdownMove("conquerBattlefield", sd.battlefieldId);
  if (!move) {
    // As a fallback for passing-but-not-conquering scenarios, try endShowdown.
    const end = findShowdownMove("endShowdown");
    if (end) {
      executeMove(end.moveId, end.params, end.playerId);
      return;
    }
    if (typeof showToast === "function") showToast("Can't conquer right now");
    return;
  }
  executeMove(move.moveId, move.params, move.playerId);
}

// Expose globals for consumers in other non-module scripts.
window.renderBattlefieldShowdownPanel = renderBattlefieldShowdownPanel;
window.getActiveShowdownsByBattlefield = getActiveShowdownsByBattlefield;
window.getActiveShowdownForHotkey = getActiveShowdownForHotkey;
window.showdownHotkeyPassFocus = showdownHotkeyPassFocus;
window.showdownHotkeyConquer = showdownHotkeyConquer;
