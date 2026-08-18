// renderer.js — Main render() orchestration + small sidebar renderers + hover
// preview. The bulk of rendering lives in render/*.js (card, hand, runes,
// board, actions, modals, log), loaded before this file in gameplay.html.
// All files are classic scripts sharing globals.

function render() {
  if (!gameState) return;

  // Detect phase/turn transitions before rendering
  checkPhaseTransition();

  // A hint toast names one card; drop it once this frame makes that card playable.
  clearStaleCardToasts();

  // W8: if the newest log entry on the incoming frame is the rewind
  // sentinel, clear any in-progress UI interaction (target cursor, armed
  // hotkey mode) and flash the board. Runs before child renderers so they
  // pick up the cleared interaction state.
  clearInteractionStateOnRewind();

  // Recompute summoning-sick / just-played card tracking before any card render
  updateStateIndicatorTracking();

  renderSidebarHeader();
  renderPlayerInfo();
  renderResourceBar();
  renderPhaseBar();
  renderEndTurnButton();
  renderZones();
  renderBattlefields();
  renderPlayerSwitcher();
  // vs-Claude: "thinking…" pill in the opponent strip; hides the seat switcher.
  if (typeof renderAiThinking === "function") renderAiThinking();
  renderLog();
  renderActions();
  renderChainOverlay();
  renderPendingChoiceModal();
  // rule 383.3.d — soft trigger-order stack popup (non-blocking; gone when the offer is).
  if (typeof renderTriggerOrderPopup === "function") renderTriggerOrderPopup();
  renderGameOver();
  // A queued pass fires as soon as priority reaches this seat.
  if (typeof maybeFirePrepass === "function") maybeFirePrepass();
  // A staged bundle belongs to the menu it was assembled from; keep the bar
  // in sync and drop it when those moves are gone.
  if (typeof renderStagedMoveBar === "function") renderStagedMoveBar();

  // Re-apply valid target highlights after DOM rebuild
  if (interaction.mode !== "idle") {
    applyValidTargetHighlights();
  }

  // Re-apply rune tappable highlights if in costPayment mode
  if (interaction.mode === "costPayment") {
    applyRuneTappableHighlights();
  }

  // Pending choose-target/choose-card: glow the pickable cards on the board too.
  if (typeof applyPendingChoiceHighlights === "function") applyPendingChoiceHighlights();

  // W10c: mount the board toggles panel on first render (no-op afterwards).
  if (typeof initBoardToggles === "function") initBoardToggles();
}

function renderSidebarHeader() {
  const { turn, status } = gameState;
  const phase = turn?.phase ?? "setup";
  const turnNum = turn?.number ?? 0;
  const activeP = turn?.activePlayer ?? "";
  const isActive = activeP === viewingPlayer;

  // Whose move is it REALLY: priority on the chain, focus in a showdown and a
  // pending prompt all hand the cursor to a player regardless of whose turn it is.
  const ix = gameState.interaction;
  const pc = gameState.pendingChoice;
  const cursor = pc ? (pc.prompter ?? pc.playerId)
    : ix?.chain?.active ? ix.chain.activePlayer
    : ix?.showdown?.active ? ix.showdown.focusPlayer
    : activeP;
  const myCursor = cursor === viewingPlayer;
  const cursorText = pc
    ? (myCursor ? "Your choice — answer the prompt" : `Waiting for ${pName(cursor)} to choose`)
    : ix?.chain?.active
    ? (myCursor ? "You have priority — react or pass (Space)" : `${pName(cursor)} has priority`)
    : ix?.showdown?.active
    ? (myCursor ? "You have focus — act or pass (Space)" : `${pName(cursor)} has focus`)
    : (isActive ? "Your turn" : `Waiting for ${pName(activeP)}`);

  document.getElementById("sidebarHeader").innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <div class="turn-badge" style="flex:1;">
        <span class="turn-number">Turn ${turnNum}</span>
        <span class="phase-badge phase-${phase}">${phase}</span>
        ${typeof matchHeaderHtml === "function" ? matchHeaderHtml() : ""}
      </div>
      ${typeof matchConcedeButtonsHtml === "function" ? matchConcedeButtonsHtml() : ""}
      <button class="leave-btn" onclick="showLeaveConfirm()">Leave</button>
    </div>
    <div class="game-status${myCursor && !isActive && status === "playing" ? " game-status--cursor" : ""}" data-cursor="${esc(cursor || "")}">
      ${status === "playing"
        ? esc(cursorText)
        : status === "finished" ? `Game Over — ${(() => { const vp = gameState.players?.[viewingPlayer]?.victoryPoints ?? 0; const opp = viewingPlayer === P1 ? P2 : P1; const opVp = gameState.players?.[opp]?.victoryPoints ?? 0; return (gameState.winner === viewingPlayer || vp > opVp) ? "You Win!" : "You Lose"; })()}`
        : `Status: ${status}`
      }
    </div>
    <div id="connStatus" style="font-size:10px;margin-top:2px;">${wsConnected ? "Connected" : "Disconnected"}</div>
  `;
}

function renderPlayerInfo() {
  const opponent = viewingPlayer === P1 ? P2 : P1;

  for (const [pid, elemId] of [[viewingPlayer, "playerInfo"], [opponent, "opponentInfo"]]) {
    const player = gameState.players[pid];
    const pool = gameState.runePools[pid];
    const isActive = gameState.turn?.activePlayer === pid;

    // rules 163.1 / 163.2 / 166 — Energy and each Domain's Power share one Rune
    // Pool but are different resources, and the pips differ only by color, so
    // every pip carries its own name. Energy always renders (even at 0) so the
    // pill reads the same for both players instead of losing its label the
    // moment the value goes above zero.
    let resourceHtml = "";
    if (pool) {
      const energy = pool.energy ?? 0;
      resourceHtml += `<span class="resource-pip pip-energy" title="Energy" aria-label="Energy ${energy}">${energy}</span>`;
      for (const [domain, amount] of Object.entries(pool.power || {})) {
        if (amount > 0) {
          resourceHtml += `<span class="resource-pip pip-${domain}" title="${esc(domain)} Power" aria-label="${esc(domain)} Power ${amount}">${amount}</span>`;
        }
      }
    }

    // rule-id: unl-034-219 (XP) — surface player XP whenever the xpCounter
    // toggle is on or any XP has actually been gained, so "gain N XP" effects
    // are visible in the DOM.
    const xp = player?.xp ?? 0;
    const showXp = xp > 0 || (typeof window.getBoardToggles === "function" && window.getBoardToggles().xpCounter);
    const xpHtml = showXp
      ? `<div class="player-stat"><span class="stat-label">XP</span><span class="stat-value xp">${xp}</span></div>`
      : "";

    // rule-id: ogn-276-298 (Aspirant's Climb) / rule 194.3.a — that battlefield
    // raises the threshold without touching victoryScoreModifier, so prefer the
    // server's engine-computed effectiveVictoryScore over the local sum.
    const effectiveVictoryScore = gameState.victoryScoreEffective?.[pid]
      ?? (gameState.victoryScore ?? 0) + (player?.victoryScoreModifier ?? 0);

    document.getElementById(elemId).innerHTML = `
      <div class="player-avatar ${isActive ? "active" : ""}" title="${esc(pName(pid))}">${esc(initials(pName(pid)))}</div>
      <span class="player-name" title="${esc(pName(pid))}" style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;">${esc(pName(pid))}</span>
      <div class="player-stat">
        <span class="stat-label">VP</span>
        <span class="stat-value vp">${player?.victoryPoints ?? 0} / ${effectiveVictoryScore}</span>
      </div>
      ${xpHtml}
      <div class="player-stat">
        <span class="stat-label">Resources</span>
        <div class="resource-pips">${resourceHtml || '<span style="color:#6a6288">None</span>'}</div>
      </div>
    `;
  }
}

/** Drop any toast still on screen — a toast names the card it was raised for,
 * so it must not outlive that card's prompt (toasts live 2500ms on their own). */
function clearToasts() {
  document.querySelectorAll(".toast").forEach(t => t.remove());
}

/** Drop a card-scoped toast whose statement the current frame has falsified —
 * a "can't pay X" hint is computed once at click time and never re-evaluated, so
 * without this it keeps instructing the player after the very state change (a
 * recycle, a rune tap) that made the card playable. */
function clearStaleCardToasts() {
  const stale = document.querySelectorAll(".toast[data-for-card]");
  if (!stale.length) return;
  const moves = typeof availableMoves !== "undefined" && Array.isArray(availableMoves) ? availableMoves : [];
  for (const toast of stale) {
    const cardId = toast.dataset.forCard;
    const playable = moves.some(m =>
      (m.moveId === "playUnit" || m.moveId === "playSpell" || m.moveId === "playGear" ||
       m.moveId === "playFromChampionZone" || m.moveId === "hideCard") &&
      m.params?.cardId === cardId
    );
    if (playable) toast.remove();
  }
}

/** Show a toast notification. `opts.cardId` scopes it to one card, so the next
 * frame that makes that card playable takes the message down (clearStaleCardToasts). */
function showToast(message, opts = {}) {
  // Remove existing toast
  clearToasts();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  if (opts && opts.cardId) toast.dataset.forCard = opts.cardId;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 2500);
}

function renderPlayerSwitcher() {
  document.getElementById("playerSwitcher").innerHTML = `
    <button class="${viewingPlayer === P1 ? "active" : ""}" onclick="switchPlayer('${P1}')">${esc(pName(P1))}</button>
    <button class="${viewingPlayer === P2 ? "active" : ""}" onclick="switchPlayer('${P2}')">${esc(pName(P2))}</button>
  `;
}

// ============================================================================
// Hover preview slot (Workstream 2)
// Delegated hover listeners populate a fixed slot in the sidebar with a large
// readable version of whatever card the user is currently hovering. Works for
// any card type (hand, board, battlefield, legend, champion, rune) because it
// listens at document level for `.card` elements bearing a `data-def-id`.
// ============================================================================

let hoverPreviewClearTimer = null;
const HOVER_PREVIEW_CLEAR_DELAY_MS = 150;

function getHoverPreviewElements() {
  const slot = document.getElementById("hover-preview");
  if (!slot) return null;
  const img = document.getElementById("hoverPreviewImg");
  if (!img) return null;
  return { slot, img };
}

function setHoverPreviewCard(defId, name) {
  const els = getHoverPreviewElements();
  if (!els) return;
  if (!defId) return;

  // Cancel any pending clear from a previous mouseleave.
  if (hoverPreviewClearTimer !== null) {
    clearTimeout(hoverPreviewClearTimer);
    hoverPreviewClearTimer = null;
  }

  // Strip the per-player instance prefix so we hit the shared card-image route.
  const imgId = String(defId).replace(/^player-[12]-/, "");
  const nextSrc = `/card-image/${encodeURIComponent(imgId)}`;

  // Avoid reassigning src if unchanged (prevents flicker on re-entry).
  if (els.img.getAttribute("data-current") !== imgId) {
    els.img.setAttribute("data-current", imgId);
    els.img.removeAttribute("data-failed");
    // Remember which image 404'd: mouseover bubbles from every descendant of a
    // card, so a re-entry with the same src fires no new error event and must
    // not re-show the broken <img> (tokens have no card image).
    els.img.onerror = () => {
      els.img.setAttribute("data-failed", imgId);
      els.slot.classList.remove("has-card");
      els.slot.setAttribute("aria-hidden", "true");
    };
    els.img.src = nextSrc;
  }
  if (els.img.getAttribute("data-failed") === imgId) {
    els.slot.classList.remove("has-card");
    els.slot.setAttribute("aria-hidden", "true");
    return;
  }
  els.img.alt = name || "";
  els.slot.classList.add("has-card");
  els.slot.setAttribute("aria-hidden", "false");
}

function scheduleHoverPreviewClear() {
  const els = getHoverPreviewElements();
  if (!els) return;
  if (hoverPreviewClearTimer !== null) {
    clearTimeout(hoverPreviewClearTimer);
  }
  hoverPreviewClearTimer = setTimeout(() => {
    hoverPreviewClearTimer = null;
    const latest = getHoverPreviewElements();
    if (!latest) return;
    latest.slot.classList.remove("has-card");
    latest.slot.setAttribute("aria-hidden", "true");
    latest.img.removeAttribute("data-current");
    latest.img.removeAttribute("src");
    latest.img.alt = "";
  }, HOVER_PREVIEW_CLEAR_DELAY_MS);
}

function findCardElementFromEvent(event) {
  const target = event.target;
  if (!target || typeof target.closest !== "function") return null;
  // Ignore hover over the preview slot itself (its img is not a `.card`).
  if (target.closest("#hover-preview")) return null;
  return target.closest(".card, .bf-art");
}

function onDocumentCardMouseOver(event) {
  const cardEl = findCardElementFromEvent(event);
  if (!cardEl) return;
  const defId = cardEl.getAttribute("data-def-id");
  if (!defId) return;
  const nameEl = cardEl.querySelector(".card-name");
  const name = nameEl ? nameEl.textContent : cardEl.getAttribute("alt") || "";
  setHoverPreviewCard(defId, name);
}

function onDocumentCardMouseOut(event) {
  const cardEl = findCardElementFromEvent(event);
  if (!cardEl) return;
  // Only schedule a clear when the mouse actually leaves the card element
  // (mouseout fires when moving between descendants, so check relatedTarget).
  const related = event.relatedTarget;
  if (related && typeof cardEl.contains === "function" && cardEl.contains(related)) {
    return;
  }
  scheduleHoverPreviewClear();
}

// Install delegated listeners once on DOM ready. Using `mouseover`/`mouseout`
// (which bubble) instead of `mouseenter`/`mouseleave` so a single document
// listener covers every card rendered now or in the future.
function initHoverPreview() {
  if (document.body.dataset.hoverPreviewInstalled === "1") return;
  document.body.dataset.hoverPreviewInstalled = "1";
  document.addEventListener("mouseover", onDocumentCardMouseOver);
  document.addEventListener("mouseout", onDocumentCardMouseOut);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHoverPreview);
} else {
  initHoverPreview();
}
