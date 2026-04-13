// renderer.js — Main rendering: game board, zones, cards, actions, log, chain overlay

const DOMAIN_LABELS = { fury: "Fury", calm: "Calm", mind: "Mind", body: "Body", chaos: "Chaos", order: "Order" };
const DOMAIN_ORDER = ["fury", "calm", "mind", "body", "chaos", "order"];

// ============================================
// W10d: Sandbox-gated floating resource controls
// ============================================
// A localStorage flag unlocks hidden dev helpers that let the viewing player
// manually add/remove floating Energy and domain Power. Non-sandbox games
// never see these controls. Exposed on window so it can be toggled from the
// browser console — a proper UI toggle is a future workstream.

const SANDBOX_MODE_STORAGE_KEY = "rba-sandbox-mode";

/** @returns {boolean} true when the rba-sandbox-mode localStorage flag is set */
function isSandboxMode() {
  try {
    return localStorage.getItem(SANDBOX_MODE_STORAGE_KEY) === "true";
  } catch (_e) {
    return false;
  }
}

// Console helper: window.setSandboxMode(true) / window.setSandboxMode(false)
window.setSandboxMode = function (enabled) {
  try {
    if (enabled) {
      localStorage.setItem(SANDBOX_MODE_STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(SANDBOX_MODE_STORAGE_KEY);
    }
  } catch (_e) {
    /* ignore storage errors */
  }
  if (typeof render === "function") render();
  return isSandboxMode();
};

/**
 * Dispatch an add/spend resource move from the sandbox ± buttons.
 * Pre-clamps at 0 so we don't fire server requests that can only be rejected.
 * @param {"add"|"spend"} direction
 * @param {"energy"|"fury"|"calm"|"mind"|"body"|"chaos"|"order"} key
 */
function sandboxAdjustResource(direction, key) {
  if (!isSandboxMode()) return;
  const pool = gameState?.runePools?.[viewingPlayer];
  if (!pool) return;

  const current = key === "energy" ? (pool.energy ?? 0) : (pool.power?.[key] ?? 0);
  if (direction === "spend" && current <= 0) {
    // Pre-clamped — nothing to do. Button should already be :disabled.
    return;
  }

  const moveId = direction === "add" ? "addResources" : "spendResources";
  const params = { playerId: viewingPlayer };
  if (key === "energy") {
    params.energy = 1;
  } else {
    params.power = { [key]: 1 };
  }
  try {
    executeMove(moveId, params, viewingPlayer);
  } catch (err) {
    showToast(`Sandbox resource move failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

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

// ============================================
// State indicator tracking (Workstream 1)
// ============================================
// Tracks which cards are "summoning sick" (entered base/battlefield this turn)
// and which are "just played" (entered the board between the previous render and now,
// used for a brief CSS enter animation).
//
// Why client-side tracking? The engine's RiftboundCardMeta does not expose a
// `justEnteredBattlefield` / "entered this turn" flag, so we observe zone
// transitions across renders. Cleared automatically when the active player or
// turn number changes.

/** Map<cardId, turnNumber> — turn the card first appeared on a board zone */
const _enteredOnTurn = new Map();
/** Set<cardId> — board zone cards observed during the previous render */
let _prevBoardCardIds = new Set();
/** Set<cardId> — cards that newly appeared on a board zone this render (just-played) */
let _justPlayedCardIds = new Set();
/** Last seen turn key (number + activePlayer) used to expire sickness */
let _lastTurnKey = "";

/** Returns true if a zone name represents an on-board zone where units sit. */
function isBoardZone(zoneName) {
  if (!zoneName) return false;
  if (zoneName === "base") return true;
  if (zoneName.startsWith("battlefield-")) return true;
  return false;
}

/**
 * Recompute summoning-sick / just-played tracking based on current gameState.
 * Called once per render() before any card rendering happens.
 */
function updateStateIndicatorTracking() {
  if (!gameState) return;

  const turnNum = gameState.turn?.number ?? 0;
  const activeP = gameState.turn?.activePlayer ?? "";
  const turnKey = `${turnNum}:${activeP}`;
  const turnChanged = turnKey !== _lastTurnKey;
  _lastTurnKey = turnKey;

  // Build the set of cards currently on any on-board zone
  const zones = gameState.zones || {};
  const currentBoardCardIds = new Set();
  for (const [zoneName, cards] of Object.entries(zones)) {
    if (!isBoardZone(zoneName)) continue;
    for (const c of cards || []) {
      if (c?.id) currentBoardCardIds.add(c.id);
    }
  }

  // Detect cards that newly appeared on a board zone since the last render.
  // These get the brief "just-played" enter animation.
  _justPlayedCardIds = new Set();
  for (const cardId of currentBoardCardIds) {
    if (!_prevBoardCardIds.has(cardId)) {
      _justPlayedCardIds.add(cardId);
      // Record the turn the card entered the board (used for sickness)
      if (!_enteredOnTurn.has(cardId)) {
        _enteredOnTurn.set(cardId, turnNum);
      }
    }
  }

  // Garbage collect tracking entries for cards that have left the board
  for (const cardId of _enteredOnTurn.keys()) {
    if (!currentBoardCardIds.has(cardId)) {
      _enteredOnTurn.delete(cardId);
    }
  }

  // Save current snapshot for next render's diff
  _prevBoardCardIds = currentBoardCardIds;

  // Optional: when the turn key changes, leave _enteredOnTurn entries alone —
  // a card entered on turn N is naturally no longer sick on turn N+1 because
  // the renderer compares enteredTurn against the current turn number.
  void turnChanged;
}

/** True if the card should display the summoning-sick overlay (entered this turn). */
function isCardSummoningSick(card, zone) {
  if (!card?.id) return false;
  if (!isBoardZone(zone)) return false;
  // Runes don't get sick — only units played to base/battlefields
  if (card.cardType === "rune") return false;
  const enteredTurn = _enteredOnTurn.get(card.id);
  if (enteredTurn == null) return false;
  return enteredTurn === (gameState?.turn?.number ?? -1);
}

/** True if the card just entered the board between the previous render and now. */
function isCardJustPlayed(card, zone) {
  if (!card?.id) return false;
  if (!isBoardZone(zone)) return false;
  return _justPlayedCardIds.has(card.id);
}

function render() {
  if (!gameState) return;

  // Detect phase/turn transitions before rendering
  checkPhaseTransition();

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
  renderLog();
  renderActions();
  renderChainOverlay();
  renderGameOver();

  // Re-apply valid target highlights after DOM rebuild
  if (interaction.mode !== "idle") {
    applyValidTargetHighlights();
  }

  // Re-apply rune tappable highlights if in costPayment mode
  if (interaction.mode === "costPayment") {
    applyRuneTappableHighlights();
  }

  // W10c: mount the board toggles panel on first render (no-op afterwards).
  if (typeof initBoardToggles === "function") initBoardToggles();
}

/** Resolve a param value: if it's a card ID, return the card name */
function resolveParamValue(value) {
  if (typeof value !== "string") return value;
  const card = findCard(value);
  if (card && card.name) return card.name;
  return value.replace(/^player-[12]-/, "");
}

/** Fallback param formatter: show only resolved values without raw key names */
function formatParamsFallback(params) {
  if (!params) return "";
  const vals = Object.entries(params)
    .filter(([k]) => k !== "playerId" && k !== "method")
    .map(([, v]) => resolveParamValue(v))
    .filter(v => v != null && v !== "");
  return vals.join(", ");
}

/** Format a move's params into a natural-language description */
function formatMoveDescription(moveId, params) {
  if (!params) return null;
  const r = (v) => Array.isArray(v) ? v.map(resolveParamValue).join(", ") : resolveParamValue(v);
  const bf = (v) => typeof v === "string" ? getBattlefieldName(v) : String(v ?? "");
  switch (moveId) {
    case "playUnit": return `${r(params.cardId)} to ${params.location ?? "base"}`;
    case "playSpell": return `${r(params.cardId)}`;
    case "playGear": return `${r(params.cardId)}`;
    case "exhaustRune": return `${r(params.runeId)}`;
    case "recycleRune": return `${r(params.runeId)}${params.domain ? " for " + params.domain : ""}`;
    case "standardMove": return `${r(params.unitIds)} to ${bf(params.destination)}`;
    case "gankingMove": return `${r(params.unitId)} to ${bf(params.toBattlefield)}`;
    case "assignAttacker": return `${r(params.unitId)}`;
    case "assignDefender": return `${r(params.unitId)}`;
    case "contestBattlefield": return `${bf(params.battlefieldId)}`;
    case "conquerBattlefield": return `${bf(params.battlefieldId)}`;
    case "recallUnit": return `${r(params.unitId)}`;
    case "hideCard": return `at ${bf(params.battlefieldId)}`;
    case "scorePoint": return `${bf(params.battlefieldId)}`;
    case "activateAbility": return `${r(params.cardId)}`;
    case "resolveFullCombat": return `${bf(params.battlefieldId)}`;
    case "passChainPriority": return null;
    case "passShowdownFocus": return null;
    case "advancePhase": return null;
    case "endTurn": return null;
    case "channelRunes": return null;
    case "drawCard": return null;
    case "readyAll": return null;
    case "emptyRunePool": return null;
    case "concede": return null;
    case "pass": return null;
    default: return null;
  }
}

function renderSidebarHeader() {
  const { turn, status } = gameState;
  const phase = turn?.phase ?? "setup";
  const turnNum = turn?.number ?? 0;
  const activeP = turn?.activePlayer ?? "";
  const isActive = activeP === viewingPlayer;

  document.getElementById("sidebarHeader").innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <div class="turn-badge" style="flex:1;">
        <span class="turn-number">Turn ${turnNum}</span>
        <span class="phase-badge phase-${phase}">${phase}</span>
      </div>
      <button class="leave-btn" onclick="showLeaveConfirm()">Leave</button>
    </div>
    <div class="game-status">
      ${status === "playing"
        ? (isActive ? "Your turn" : `Waiting for ${pName(activeP)}`)
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

    let resourceHtml = "";
    if (pool) {
      if (pool.energy > 0) resourceHtml += `<span class="resource-pip pip-energy">${pool.energy}</span>`;
      for (const [domain, amount] of Object.entries(pool.power || {})) {
        if (amount > 0) resourceHtml += `<span class="resource-pip pip-${domain}">${amount}</span>`;
      }
    }

    document.getElementById(elemId).innerHTML = `
      <div class="player-avatar ${isActive ? "active" : ""}" title="${esc(pName(pid))}">${esc(initials(pName(pid)))}</div>
      <span class="player-name" title="${esc(pName(pid))}" style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;">${esc(pName(pid))}</span>
      <div class="player-stat">
        <span class="stat-label">VP</span>
        <span class="stat-value vp">${player?.victoryPoints ?? 0} / ${gameState.victoryScore}</span>
      </div>
      <div class="player-stat">
        <span class="stat-label">Resources</span>
        <div class="resource-pips">${resourceHtml || (pool ? '<span style="color:#6a6288">Energy 0</span>' : '<span style="color:#6a6288">None</span>')}</div>
      </div>
    `;
  }
}

function renderResourceBar() {
  const bar = document.getElementById("resourceBar");
  if (!bar || !gameState) return;

  const pool = gameState.runePools?.[viewingPlayer];
  if (!pool) {
    bar.innerHTML = '<span class="rb-label">No resources</span>';
    return;
  }

  const energy = pool.energy ?? 0;
  const powers = pool.power ?? {};
  const hasPower = Object.values(powers).some(v => v > 0);
  const sandbox = isSandboxMode();

  /** Render the +/- sandbox buttons for a resource key, or "" outside sandbox mode. */
  const sandboxBtns = (key, current) => {
    if (!sandbox) return "";
    const disabledMinus = current <= 0 ? "disabled" : "";
    return `<div class="floating-res__btns">
      <button type="button" class="floating-res__btn floating-res__btn--minus" ${disabledMinus}
        title="Remove 1 ${key}"
        onclick="sandboxAdjustResource('spend', '${key}')">−</button>
      <button type="button" class="floating-res__btn floating-res__btn--plus"
        title="Add 1 ${key}"
        onclick="sandboxAdjustResource('add', '${key}')">+</button>
    </div>`;
  };

  let html = '<span class="rb-label">Resources</span>';

  // Energy
  html += `<div class="rb-item">
    <div class="rb-icon pip-energy" style="width:auto;border-radius:4px;padding:0 6px;font-size:9px;">Energy</div>
    <div class="rb-value ${energy > 0 ? "has-value" : ""}">${energy}</div>
    ${sandboxBtns("energy", energy)}
  </div>`;

  // Domain powers — in sandbox mode show every domain so the player can raise
  // any pool from 0; otherwise only non-empty ones render.
  const domainsToRender = sandbox
    ? DOMAIN_ORDER
    : Object.keys(powers).filter(d => (powers[d] ?? 0) > 0);
  for (const domain of domainsToRender) {
    const amount = powers[domain] ?? 0;
    html += `<div class="rb-item">
      <div class="rb-icon pip-${domain}">${DOMAIN_LABELS[domain] ?? domain[0].toUpperCase()}</div>
      <div class="rb-value ${amount > 0 ? "has-value" : ""}">${amount}</div>
      ${sandboxBtns(domain, amount)}
    </div>`;
  }

  // Rune pool count (how many runes in pool)
  const runePoolCards = zoneForPlayer("runePool", viewingPlayer);
  const exhaustedCount = runePoolCards.filter(c => c.meta?.exhausted).length;
  const readyCount = runePoolCards.length - exhaustedCount;
  if (runePoolCards.length > 0) {
    html += `<div class="rb-item" style="border-color:#a09030;">
      <div class="rb-icon" style="background:#a09030;width:auto;border-radius:4px;padding:0 6px;font-size:9px;">Runes</div>
      <div class="rb-value" style="font-size:12px;">${readyCount}/${runePoolCards.length}</div>
    </div>`;
  }

  if (energy === 0 && readyCount > 0) {
    html += '<span style="font-size:10px;color:#a09030;font-style:italic;margin-left:4px;animation:hint-pulse 2s ease-in-out infinite;">Tap runes for energy</span>';
  }

  bar.innerHTML = html;
}

/** Show a toast notification */
function showToast(message) {
  // Remove existing toast
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 2500);
}

/** Take a snapshot of current resources before a move executes */
function snapshotResources() {
  const pool = gameState?.runePools?.[viewingPlayer];
  if (!pool) { prevResources = null; return; }
  prevResources = {
    energy: pool.energy ?? 0,
    power: { ...(pool.power || {}) },
  };
}

/** Compare current resources to snapshot and show floating deltas */
function detectAndShowResourceDeltas() {
  if (!prevResources) return;
  const pool = gameState?.runePools?.[viewingPlayer];
  if (!pool) { prevResources = null; return; }

  const newEnergy = pool.energy ?? 0;
  const energyDelta = newEnergy - prevResources.energy;
  if (energyDelta !== 0) {
    showResourceDelta("energy", energyDelta);
  }

  const newPower = pool.power || {};
  const DOMAIN_NAMES = { fury: "Fury", calm: "Calm", mind: "Mind", body: "Body", chaos: "Chaos", order: "Order" };
  for (const [domain, label] of Object.entries(DOMAIN_NAMES)) {
    const oldVal = prevResources.power[domain] ?? 0;
    const newVal = newPower[domain] ?? 0;
    const delta = newVal - oldVal;
    if (delta !== 0) {
      showResourceDelta(domain, delta, label);
    }
  }

  prevResources = null;
}

/** Show a floating "+1 Energy" or "+1 Fury" animation near the resource bar */
function showResourceDelta(type, amount, label) {
  const bar = document.getElementById("resourceBar");
  if (!bar) return;

  const displayLabel = label || (type === "energy" ? "Energy" : type.charAt(0).toUpperCase() + type.slice(1));
  const sign = amount > 0 ? "+" : "";

  const el = document.createElement("div");
  el.className = `resource-delta ${type}`;
  el.textContent = `${sign}${amount} ${displayLabel}`;

  // Position relative to the resource bar
  const barRect = bar.getBoundingClientRect();
  const boardEl = bar.closest(".board") || bar.parentElement;
  const boardRect = boardEl.getBoundingClientRect();

  el.style.left = (barRect.left - boardRect.left + barRect.width / 2) + "px";
  el.style.top = (barRect.top - boardRect.top - 8) + "px";
  el.style.transform = "translateX(-50%)";

  boardEl.style.position = "relative";
  boardEl.appendChild(el);

  setTimeout(() => { if (el.parentNode) el.remove(); }, 1300);
}

/** Re-evaluate cost payment mode after a state update */
function reevaluateCostPayment() {
  const pendingId = interaction.pendingCardId;
  const pendingCost = interaction.pendingCardCost;
  if (!pendingId || !pendingCost) {
    resetInteractionSilent();
    render();
    return;
  }

  // Check if the pending card is still in hand
  const card = findCard(pendingId);
  const zone = findCardZone(pendingId);
  if (!card || zone !== "hand") {
    // Card is gone, cancel
    resetInteractionSilent();
    render();
    return;
  }

  const pool = gameState?.runePools?.[viewingPlayer];
  const currentEnergy = pool?.energy ?? 0;

  // Check if play moves are now available (server says card is playable)
  const playMoves = availableMoves.filter(m =>
    (m.moveId === "playUnit" || m.moveId === "playSpell" || m.moveId === "playGear") &&
    m.params?.cardId === pendingId
  );

  if (playMoves.length > 0) {
    // Card is now affordable — transition to cardSelected with play moves
    interaction = {
      mode: "cardSelected",
      sourceCardId: pendingId,
      sourceZone: "hand",
      action: "playCard",
      validTargets: ["player-base"],
      matchingMoves: playMoves,
      pendingCardId: null,
      pendingCardCost: 0,
    };
    selectedCard = pendingId;
    clearRuneTappableHighlights();
    applyValidTargetHighlights();
    showCostPaymentActionBar(card, currentEnergy);
    return;
  }

  // Still can't afford — check if there are still rune moves available
  const runeExhaustMoves = availableMoves.filter(m =>
    m.moveId === "exhaustRune" || m.moveId === "recycleRune"
  );

  if (runeExhaustMoves.length === 0 && currentEnergy < pendingCost) {
    // No more runes to exhaust and still can't afford
    showToast(`Not enough energy (${currentEnergy}/${pendingCost}) — no more runes available`);
    resetInteractionSilent();
    render();
    return;
  }

  // Stay in costPayment mode — re-apply highlights and update action bar
  applyRuneTappableHighlights();
  showCostPaymentActionBar(card, currentEnergy);
}

function renderCardElement(card, isFacedown = false, zone = "") {
  if (isFacedown) {
    return `<div class="card facedown"><div class="card-back"></div></div>`;
  }

  // W13: if the viewing player has hidden this specific hand card, render
  // a facedown stand-in with an Unhide button so they can toggle it back.
  // Purely client-side — the card still participates normally in gameplay.
  const isOwnedByViewer = card.owner === viewingPlayer;
  if (zone === "hand" && isOwnedByViewer && card.id && isHandCardHidden(card.id)) {
    return `
      <div class="card facedown hand-hidden" data-card-id="${esc(card.id)}" data-zone="hand"
           onpointerdown="onPointerDown(event, '${esc(card.id)}')">
        <div class="card-back"></div>
        <button class="card-hide-btn"
                type="button"
                title="Reveal this card"
                onpointerdown="event.stopPropagation();"
                onclick="event.stopPropagation(); toggleHideHandCard('${esc(card.id)}');">Show</button>
      </div>
    `;
  }

  const classes = ["card"];
  if (card.cardType) classes.push("type-" + card.cardType);
  if (card.meta?.exhausted) {
    classes.push("exhausted");
    classes.push("card--exhausted");
  }
  if (card.meta?.stunned) classes.push("stunned");
  if (card.meta?.buffed) classes.push("buffed");
  if (isCardSummoningSick(card, zone)) classes.push("card--summoning-sick");
  if (isCardJustPlayed(card, zone)) classes.push("card--just-played");
  if (selectedCard === card.id) classes.push("selected");
  if (interaction.sourceCardId === card.id && interaction.mode !== "idle") classes.push("interaction-source");

  const defId = card.definitionId || "";
  const imgId = defId.replace(/^player-[12]-/, "");

  const isLegendZone = zone === "legendZone";

  // Determine if this card is playable (has available moves)
  const isOwned = card.owner === viewingPlayer;
  const isPlayable = isOwned && hasMovesForCard(card.id, zone);
  if (isPlayable) classes.push("playable");
  if (isLegendZone && isPlayable) classes.push("legend-playable");

  // Legend cards without moves get no pointer events; legend cards with moves are interactive
  const pointerAttr = (isLegendZone && !isPlayable)
    ? ""
    : `onpointerdown="onPointerDown(event, '${esc(card.id)}')"`;

  // Workstream 7: render a compact Auto Pay button only on hand cards the viewing
  // player owns. This gives a visible, clickable path that pays the card's cost and
  // plays it in one action — alongside the drag-to-play and click-to-play paths.
  // Inline styles keep the change scoped to this file (CSS is off-limits this pass).
  let autoPayBtn = "";
  if (zone === "hand" && isOwned && typeof canAutoPay === "function" && canAutoPay(card.id)) {
    autoPayBtn = `<button
      class="card-auto-pay-btn"
      type="button"
      title="Auto Pay and play this card"
      onpointerdown="event.stopPropagation();"
      onclick="event.stopPropagation(); autoPayAndPlay('${esc(card.id)}');"
      style="position:absolute;left:4px;bottom:22px;padding:2px 6px;font-size:9px;font-weight:700;letter-spacing:0.5px;background:rgba(30,160,80,0.92);color:#eafff0;border:1px solid #7ff2a8;border-radius:3px;cursor:pointer;z-index:3;text-transform:uppercase;">Auto Pay</button>`;
  }

  // W13: per-card Hide toggle on viewer-owned hand cards. Click replaces
  // the face with a card-back; state persists in localStorage.
  let hideBtn = "";
  if (zone === "hand" && isOwned && card.id) {
    hideBtn = `<button
      class="card-hide-btn"
      type="button"
      title="Hide this card (local, persists via localStorage)"
      onpointerdown="event.stopPropagation();"
      onclick="event.stopPropagation(); toggleHideHandCard('${esc(card.id)}');">Hide</button>`;
  }

  return `
    <div class="${classes.join(" ")}"
         data-card-id="${esc(card.id)}"
         data-def-id="${esc(defId)}"
         data-zone="${esc(zone)}"
         ${pointerAttr}
         onmouseenter="showPreview(event, this)"
         onmouseleave="hidePreview()"
         ondblclick="openZoom('${esc(card.id)}')"
         style="${isLegendZone && !isPlayable ? "cursor:default;" : ""}">
      <img class="card-img" src="/card-image/${esc(imgId)}" alt="${esc(card.name)}"
           onerror="this.style.background='linear-gradient(135deg,#201a38,#2a2248)';this.alt='${esc(card.name)}'">
      ${card.meta?.damage > 0 ? `<div class="card-damage">${card.meta.damage}</div>` : ""}
      ${autoPayBtn}
      ${hideBtn}
      <div class="card-name">${esc(card.name || "")}</div>
    </div>
  `;
}

function renderDeckStack(zoneCards, label, options = {}) {
  const count = zoneCards?.length ?? 0;
  // W12: right-clicking the viewing player's main deck opens the
  // enriched peek dialog. We also add a title hint so users discover
  // the interaction. Opponent decks and rune decks stay inert.
  const peekable = options.peekable === true;
  const attrs = peekable
    ? ' oncontextmenu="event.preventDefault(); if (typeof openPeekDialog === \'function\') openPeekDialog(1); return false;" title="Right-click to peek at the top card"'
    : "";
  const cls = peekable ? "deck-stack deck-stack--peekable" : "deck-stack";
  return `
    <div class="${cls}"${attrs}>
      <div class="deck-count">${count}</div>
      <div class="deck-label">${esc(label)}</div>
    </div>
  `;
}

/** Filter zone cards by owner */
function zoneForPlayer(zoneName, pid) {
  const zones = gameState.zones || {};
  const all = zones[zoneName] || [];
  return all.filter(c => c.owner === pid);
}

function renderZones() {
  const opponent = viewingPlayer === P1 ? P2 : P1;

  // Player hand (face up, draggable)
  const playerHand = zoneForPlayer("hand", viewingPlayer);
  document.getElementById("player-hand").innerHTML =
    playerHand.map(c => renderCardElement(c, false, "hand")).join("") ||
    "";

  // Opponent hand — face up in goldfish mode so player can control both sides
  const opponentHand = zoneForPlayer("hand", opponent);
  document.getElementById("opponent-hand").innerHTML =
    opponentHand.map(c => isSandboxGame ? renderCardElement(c, false, "hand") : renderCardElement({}, true)).join("") ||
    "";

  // Player base (drop target for hand cards, draggable for movement)
  const playerBase = zoneForPlayer("base", viewingPlayer);
  const baseEl = document.getElementById("player-base");
  baseEl.innerHTML =
    playerBase.map(c => renderCardElement(c, false, "base")).join("") ||
    "";

  // W10a: attach the per-zone token panel to the viewing player's base.
  // Base gets the full token set including Gold (the economy token).
  if (typeof renderTokenPanel === "function") {
    renderTokenPanel(baseEl, "base", "base");
  }

  // Opponent base
  const opponentBase = zoneForPlayer("base", opponent);
  document.getElementById("opponent-base").innerHTML =
    opponentBase.map(c => renderCardElement(c, false, "base")).join("") ||
    "";

  // Rune pools
  // Rune pools — grouped by domain, stacked max 3 per pile
  const DOMAIN_COLORS = { fury: "#d04040", calm: "#40a0d0", mind: "#a050d0", body: "#50b050", chaos: "#d08030", order: "#d0d040" };
  const STACK_MAX = 3;
  // Render a single rune card with its actual face image (not a generic back).
  // Uses `card.definitionId` so channeled runes show their real identity (Mind, Chaos, etc.).
  function renderRuneCard(c, topOffset, zIndex, borderColor) {
    const classes = ["card"];
    if (c.cardType) classes.push("type-" + c.cardType);
    if (c.meta?.exhausted) classes.push("exhausted");
    if (selectedCard === c.id) classes.push("selected");
    if (interaction.sourceCardId === c.id && interaction.mode !== "idle") classes.push("interaction-source");

    const defId = c.definitionId || "";
    const imgId = defId.replace(/^player-[12]-/, "");
    const cardName = c.name || "";
    const inlineStyle = `top:${topOffset}px;z-index:${zIndex};border-color:${borderColor};`;
    const imgSrc = imgId ? `/card-image/${esc(imgId)}` : "";

    return `
      <div class="${classes.join(" ")}"
           data-card-id="${esc(c.id)}"
           data-def-id="${esc(defId)}"
           data-zone="runePool"
           style="${inlineStyle}"
           onpointerdown="onPointerDown(event, '${esc(c.id)}')"
           onmouseenter="showPreview(event, this)"
           onmouseleave="hidePreview()"
           ondblclick="openZoom('${esc(c.id)}')"
           title="${esc(cardName)}">
        <img class="card-img" src="${imgSrc}" alt="${esc(cardName)}"
             onerror="this.style.background='linear-gradient(135deg,#201a38,#2a2248)';this.removeAttribute('src');">
      </div>
    `;
  }
  function renderRuneStacks(runes) {
    // Group by domain — one consolidated stack per domain, regardless of count.
    // Visual stacking caps at STACK_MAX cards but the count label always reflects
    // The true total so players can see how many runes they actually have.
    const groups = {};
    for (const c of runes) {
      const d = (Array.isArray(c.domain) ? c.domain[0] : c.domain) || "unknown";
      (groups[d] = groups[d] || []).push(c);
    }
    let html = "";
    for (const [domain, cards] of Object.entries(groups)) {
      const color = DOMAIN_COLORS[domain] || "#a09030";
      const visibleCards = cards.slice(0, STACK_MAX);
      const stackHeight = 70 + (visibleCards.length - 1) * 14;
      const label = DOMAIN_LABELS[domain] ?? domain[0].toUpperCase();
      const labelText = cards.length > 1 ? `${label} (${cards.length})` : label;
      html += `<div class="rune-stack" style="min-height:${stackHeight + 18}px;height:${stackHeight + 18}px;">`;
      html += `<div class="rune-stack-label" style="color:${color};">${labelText}</div>`;
      visibleCards.forEach((c, i) => {
        html += renderRuneCard(c, 16 + i * 14, i + 1, color);
      });
      html += `</div>`;
    }
    return html;
  }
  document.getElementById("player-runePool").innerHTML = renderRuneStacks(zoneForPlayer("runePool", viewingPlayer));
  document.getElementById("opponent-runePool").innerHTML = renderRuneStacks(zoneForPlayer("runePool", opponent));

  // Legend and Champion zones
  const playerLegend = zoneForPlayer("legendZone", viewingPlayer);
  const playerChampion = zoneForPlayer("championZone", viewingPlayer);
  const opponentLegend = zoneForPlayer("legendZone", opponent);
  const opponentChampion = zoneForPlayer("championZone", opponent);

  document.getElementById("player-legendChampion").innerHTML =
    (playerLegend.length > 0 ? '<div class="lc-slot"><div class="legend-label">Legend</div>' + playerLegend.map(c => renderCardElement(c, false, "legendZone")).join("") + '</div>' : "") +
    (playerChampion.length > 0 ? '<div class="lc-slot"><div class="legend-label">Champion</div>' + playerChampion.map(c => renderCardElement(c, false, "championZone")).join("") + '</div>' : "");
  document.getElementById("opponent-legendChampion").innerHTML =
    (opponentLegend.length > 0 ? '<div class="lc-slot"><div class="legend-label">Legend</div>' + opponentLegend.map(c => renderCardElement(c, false, "legendZone")).join("") + '</div>' : "") +
    (opponentChampion.length > 0 ? '<div class="lc-slot"><div class="legend-label">Champion</div>' + opponentChampion.map(c => renderCardElement(c, false, "championZone")).join("") + '</div>' : "");

  // Deck stacks. W12: the viewing player's main deck is peekable via
  // right-click; opponent decks and the rune deck stay inert.
  document.getElementById("player-decks").innerHTML =
    renderDeckStack(zoneForPlayer("mainDeck", viewingPlayer), "Main", { peekable: true }) +
    renderDeckStack(zoneForPlayer("runeDeck", viewingPlayer), "Rune");
  document.getElementById("opponent-decks").innerHTML =
    renderDeckStack(zoneForPlayer("mainDeck", opponent), "Main") +
    renderDeckStack(zoneForPlayer("runeDeck", opponent), "Rune");
}

function renderBattlefields() {
  const bfs = gameState.battlefields || {};
  const zones = gameState.zones || {};
  const opponent = viewingPlayer === P1 ? P2 : P1;

  if (Object.keys(bfs).length === 0) {
    document.getElementById("battlefieldRow").innerHTML =
      '<span style="color:#4a4268; font-size:12px;">No battlefields placed</span>';
    return;
  }

  // Look up battlefield names from the battlefieldRow zone
  const bfRowCards = zones["battlefieldRow"] || [];
  const bfNames = {};
  for (const c of bfRowCards) bfNames[c.id] = c.name;

  let html = "";
  for (const [bfId, bf] of Object.entries(bfs)) {
    const isContested = bf.contested;
    const controlClass = bf.controller === viewingPlayer ? "controlled-p1"
      : bf.controller === opponent ? "controlled-p2" : "";
    const controlLabel = bf.controller ? (bf.controller === viewingPlayer ? "You" : "Opponent") : "Neutral";

    const bfZoneId = `battlefield-${bfId}`;
    const unitsAtBf = zones[bfZoneId] || [];
    const opponentUnits = unitsAtBf.filter(c => c.owner === opponent);
    const playerUnits = unitsAtBf.filter(c => c.owner === viewingPlayer);

    const bfName = bfNames[bfId] || bfId.replace(/^ogn-|^sfd-|^unl-/g, "").replace(/-\d+$/, "");

    // Get battlefield card image
    const bfCard = bfRowCards.find(c => c.id === bfId);
    const bfImgId = bfCard ? (bfCard.definitionId || bfCard.id).replace(/^player-[12]-/, "") : bfId;

    // Check if this battlefield has an active showdown
    const interaction_state = gameState.interaction;
    const activeShowdown = interaction_state?.showdown;
    const hasShowdown = activeShowdown?.active && activeShowdown?.battlefieldId === bfId;
    const showdownClass = hasShowdown ? "showdown-active-bf" : "";

    html += `
      <div class="battlefield ${isContested ? "contested" : ""} ${controlClass} ${showdownClass}" data-bf-id="${esc(bfId)}"
           data-drop-zone="${esc(bfId)}"
           onclick="onBattlefieldClick(event, '${esc(bfId)}')"
           style="--bf-img: url('/card-image/${esc(bfImgId)}');">
        <div class="bf-art"></div>
        ${hasShowdown ? `<div class="bf-showdown-badge">${activeShowdown.isCombatShowdown ? "COMBAT" : "SHOWDOWN"}</div>` : ""}
        <div class="bf-body">
          <div class="bf-header">
            <div class="bf-name">${esc(bfName)}</div>
            <div class="bf-control">${controlLabel}${isContested ? " (Contested)" : ""}${hasShowdown ? " — " + (activeShowdown.isCombatShowdown ? "Combat" : "Showdown") : ""}</div>
          </div>
          <div class="bf-units opponent-side">
            ${opponentUnits.map(c => renderCardElement(c, false, bfZoneId)).join("") || ""}
          </div>
          <div class="bf-divider"></div>
          <div class="bf-units player-side">
            ${playerUnits.map(c => renderCardElement(c, false, bfZoneId)).join("") || ""}
          </div>
        </div>
      </div>
    `;
  }
  const rowEl = document.getElementById("battlefieldRow");
  rowEl.innerHTML = html;

  // W10a: after the battlefield DOM is built, inject a per-battlefield
  // token panel so the viewing player can spawn combat tokens (Recruit,
  // Mech, etc.) directly onto any battlefield zone. Gold is intentionally
  // omitted here — it's an economy token and lives on the base instead.
  if (typeof renderTokenPanel === "function") {
    for (const bfId of Object.keys(bfs)) {
      const bfEl = rowEl.querySelector(`.battlefield[data-bf-id="${bfId}"]`);
      if (bfEl) {
        renderTokenPanel(bfEl, `battlefield-${bfId}`, "battlefield");
      }
    }
  }

  // W9: after the base battlefield DOM is built, inject a
  // per-battlefield showdown panel into every contested battlefield.
  // Multiple simultaneous showdowns each get their own inline panel.
  if (typeof renderBattlefieldShowdownPanel === "function" &&
      typeof getActiveShowdownsByBattlefield === "function") {
    const activeShowdowns = getActiveShowdownsByBattlefield();
    for (const [bfId, sd] of Object.entries(activeShowdowns)) {
      const bfEl = rowEl.querySelector(`.battlefield[data-bf-id="${bfId}"]`);
      if (bfEl) {
        renderBattlefieldShowdownPanel(bfEl, bfId, sd);
      }
    }
  }
}

function renderActions() {
  const list = document.getElementById("actionsList");
  if (!availableMoves || availableMoves.length === 0) {
    list.innerHTML = '<div style="color:#6a6288; font-size:11px; padding:4px;">No moves available</div>';
    return;
  }

  const MOVE_LABELS = {
    advancePhase: "Advance Phase",
    endTurn: "End Turn",
    pass: "Pass",
    channelRunes: "Channel Runes",
    drawCard: "Draw Card",
    readyAll: "Ready All",
    emptyRunePool: "Empty Rune Pool",
    playUnit: "Play Unit",
    playSpell: "Play Spell",
    playGear: "Play Gear",
    standardMove: "Move Unit",
    gankingMove: "Ganking Move",
    recallUnit: "Recall Unit",
    exhaustRune: "Exhaust Rune",
    recycleRune: "Recycle Rune",
    contestBattlefield: "Contest Battlefield",
    conquerBattlefield: "Conquer Battlefield",
    scorePoint: "Score Point",
    hideCard: "Hide Card",
    revealHidden: "Reveal Hidden",
    addResources: "Add Resources",
    spendResources: "Spend Resources",
    concede: "Concede",
    passChainPriority: "Pass Priority",
    passShowdownFocus: "Pass Focus",
    resolveChain: "Resolve Chain",
    startShowdown: "Start Showdown",
    endShowdown: "End Showdown",
    activateAbility: "Activate Ability",
    resolveFullCombat: "Resolve Combat",
  };

  // Categorize moves into sections
  const sections = {
    turn: { label: "Turn Actions", moveIds: ["advancePhase", "endTurn", "channelRunes", "drawCard", "readyAll", "emptyRunePool"], moves: [] },
    play: { label: "Play Cards", moveIds: ["playUnit", "playSpell", "playGear"], moves: [] },
    movement: { label: "Movement", moveIds: ["standardMove", "gankingMove", "recallUnit"], moves: [] },
    runes: { label: "Rune Actions", moveIds: ["exhaustRune", "recycleRune"], moves: [] },
    battlefield: { label: "Battlefield", moveIds: ["contestBattlefield", "conquerBattlefield", "scorePoint"], moves: [] },
    other: { label: "Other", moveIds: [], moves: [] },
  };

  for (const move of availableMoves) {
    let placed = false;
    for (const section of Object.values(sections)) {
      if (section.moveIds.includes(move.moveId)) {
        section.moves.push(move);
        placed = true;
        break;
      }
    }
    if (!placed) sections.other.moves.push(move);
  }

  let html = "";

  for (const section of Object.values(sections)) {
    if (section.moves.length === 0) continue;

    html += `<div class="action-section-title">${esc(section.label)}</div>`;

    // Group moves within section by moveId
    const grouped = {};
    for (const move of section.moves) {
      if (!grouped[move.moveId]) grouped[move.moveId] = [];
      grouped[move.moveId].push(move);
    }

    for (const [moveId, moves] of Object.entries(grouped)) {
      const label = MOVE_LABELS[moveId] || moveId;
      const isPrimary = ["advancePhase", "endTurn", "channelRunes", "drawCard", "readyAll"].includes(moveId);

      // Check if any of these moves relate to the currently selected card
      const isHighlighted = interaction.sourceCardId &&
        moves.some(m =>
          m.params?.cardId === interaction.sourceCardId ||
          m.params?.unitIds?.includes(interaction.sourceCardId) ||
          m.params?.unitId === interaction.sourceCardId
        );

      if (moves.length === 1) {
        const m = moves[0];
        const paramStr = formatMoveDescription(moveId, m.params) || formatParamsFallback(m.params);

        html += `
          <button class="action-btn ${isPrimary ? "primary" : ""} ${isHighlighted ? "highlighted" : ""}"
                  onclick='executeMove(${JSON.stringify(moveId)}, ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})'>
            ${esc(label)}
            ${paramStr ? `<div class="action-detail">${esc(paramStr)}</div>` : ""}
          </button>
        `;
      } else if (moveId === "exhaustRune" || moveId === "recycleRune") {
        // Group rune moves by domain so we don't list 11+ individual runes
        const byDomain = {};
        for (const m of moves) {
          const card = findCard(m.params?.runeId);
          const domain = card?.domain || card?.meta?.domain || "unknown";
          const d = Array.isArray(domain) ? domain[0] : domain;
          if (!byDomain[d]) byDomain[d] = [];
          byDomain[d].push(m);
        }
        const domainEntries = Object.entries(byDomain);
        if (domainEntries.length === 1 && domainEntries[0][1].length === 1) {
          // Only one rune — render as single button
          const m = domainEntries[0][1][0];
          const paramStr = formatMoveDescription(moveId, m.params) || formatParamsFallback(m.params);
          html += `
            <button class="action-btn ${isHighlighted ? "highlighted" : ""}"
                    onclick='executeMove(${JSON.stringify(moveId)}, ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})'>
              ${esc(label)}
              ${paramStr ? `<div class="action-detail">${esc(paramStr)}</div>` : ""}
            </button>
          `;
        } else {
          // Multiple runes — show grouped by domain
          const DOMAIN_DISPLAY = { fury: "Fury", calm: "Calm", mind: "Mind", body: "Body", chaos: "Chaos", order: "Order" };
          const isExpanded = isHighlighted;
          html += `
            <button class="action-btn ${isHighlighted ? "highlighted" : ""}"
                    onclick="toggleMoveGroup('${moveId}')">
              ${esc(label)} (${moves.length} available)
            </button>
            <div id="move-group-${moveId}" class="${isExpanded ? "" : "hidden"}" style="padding-left:8px; display:flex; flex-direction:column; gap:2px;">
              ${domainEntries.map(([domain, domMoves]) => {
                const domLabel = DOMAIN_DISPLAY[domain] || domain;
                if (domMoves.length === 1) {
                  const m = domMoves[0];
                  return `
                    <button class="action-btn"
                            onclick='executeMove(${JSON.stringify(moveId)}, ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})'>
                      ${esc(domLabel)} Rune
                    </button>
                  `;
                }
                // Multiple runes of same domain — show count, click exhausts first available
                const m = domMoves[0];
                return `
                  <button class="action-btn"
                          onclick='executeMove(${JSON.stringify(moveId)}, ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})'>
                    ${esc(domLabel)} Rune (${domMoves.length} available)
                  </button>
                `;
              }).join("")}
            </div>
          `;
        }
      } else {
        // Collapsible group
        const isExpanded = isHighlighted; // auto-expand if highlighted
        html += `
          <button class="action-btn ${isPrimary ? "primary" : ""} ${isHighlighted ? "highlighted" : ""}"
                  onclick="toggleMoveGroup('${moveId}')">
            ${esc(label)} (${moves.length} options)
          </button>
          <div id="move-group-${moveId}" class="${isExpanded ? "" : "hidden"}" style="padding-left:8px; display:flex; flex-direction:column; gap:2px;">
            ${moves.slice(0, 15).map((m, i) => {
              const paramStr = formatMoveDescription(moveId, m.params) || formatParamsFallback(m.params);
              const moveHighlighted = interaction.sourceCardId &&
                (m.params?.cardId === interaction.sourceCardId ||
                 m.params?.unitIds?.includes(interaction.sourceCardId) ||
                 m.params?.unitId === interaction.sourceCardId);
              return `
                <button class="action-btn ${moveHighlighted ? "highlighted" : ""}"
                        onclick='executeMove(${JSON.stringify(moveId)}, ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})'>
                  ${esc(paramStr || `Option ${i + 1}`)}
                </button>
              `;
            }).join("")}
            ${moves.length > 15 ? `<div style="color:#6a6288;font-size:10px;padding:4px;">+${moves.length - 15} more...</div>` : ""}
          </div>
        `;
      }
    }
  }

  list.innerHTML = html;
}

function toggleMoveGroup(moveId) {
  const el = document.getElementById(`move-group-${moveId}`);
  if (el) el.classList.toggle("hidden");
}

function renderPlayerSwitcher() {
  document.getElementById("playerSwitcher").innerHTML = `
    <button class="${viewingPlayer === P1 ? "active" : ""}" onclick="switchPlayer('${P1}')">${esc(pName(P1))}</button>
    <button class="${viewingPlayer === P2 ? "active" : ""}" onclick="switchPlayer('${P2}')">${esc(pName(P2))}</button>
  `;
}

const LOG_MOVE_NAMES = {
  exhaustRune: "exhausted a rune",
  playUnit: "played a unit",
  playSpell: "cast a spell",
  playGear: "played gear",
  standardMove: "moved a unit",
  gankingMove: "ganked",
  passChainPriority: "passed priority",
  passShowdownFocus: "passed focus",
  endTurn: "ended their turn",
  channelRunes: "channeled runes",
  drawCard: "drew a card",
  activateAbility: "activated an ability",
  conquerBattlefield: "conquered a battlefield",
  contestBattlefield: "contested a battlefield",
  recycleRune: "recycled a rune",
  readyAll: "readied all cards",
  emptyRunePool: "emptied rune pool",
  advancePhase: "advanced phase",
  scorePoint: "scored a point",
  recallUnit: "recalled a unit",
  moveUnit: "moved a unit",
  hideCard: "hid a card",
  revealHidden: "revealed a hidden card",
  resolveChain: "resolved the chain",
  resolveFullCombat: "resolved combat",
  startShowdown: "started a showdown",
  endShowdown: "ended the showdown",
  concede: "conceded",
  sandboxAutoPlay: "auto-played",
};

function formatLogEntry(raw) {
  let text = raw;
  // Replace player IDs with display names
  text = text.replace(/player-1/g, pName(P1));
  text = text.replace(/player-2/g, pName(P2));
  // Humanize move IDs
  for (const [id, label] of Object.entries(LOG_MOVE_NAMES)) {
    text = text.replace(new RegExp(":\\s*" + id, "g"), ": " + label);
  }
  // Resolve card IDs in log text
  text = text.replace(/(?:main|rune)-\d+-[a-z][\w-]*/g, match => {
    const card = findCard(match) || findCard("player-1-" + match) || findCard("player-2-" + match);
    return card?.name || match;
  });
  return text;
}

/**
 * Normalize a log entry into a consistent shape.
 *
 * The server may emit either plain strings (legacy callers) or structured
 * LogEntry objects with `{ text, timestamp, rewindable, key }`. This helper
 * shields the render path from that variance.
 */
function normalizeLogEntry(entry) {
  if (typeof entry === "string") {
    return { text: entry, timestamp: "", rewindable: false };
  }
  return {
    text: entry?.text ?? "",
    timestamp: entry?.timestamp ?? "",
    rewindable: Boolean(entry?.rewindable),
    key: entry?.key,
  };
}

/**
 * Build the inner HTML for a single log entry. Returns a row with a
 * monospaced timestamp gutter, the narration text, and an optional
 * clickable rewind (↺) marker. Rewind wiring lands in Workstream 8.
 */
function renderLogEntryRow(entry) {
  const normalized = normalizeLogEntry(entry);
  let text = esc(formatLogEntry(normalized.text));
  text = text.replace(/\bP1\b/g, '<span class="log-player">P1</span>');
  text = text.replace(/\bP2\b/g, '<span class="log-player" style="color:#e09060">P2</span>');

  const timestamp = normalized.timestamp
    ? `<span class="log-timestamp" style="opacity:0.55;font-size:0.8em;margin-right:6px;font-variant-numeric:tabular-nums">${esc(normalized.timestamp)}</span>`
    : "";
  const rewindMark = normalized.rewindable
    ? ` <span class="log-rewind" role="button" tabindex="0" title="Rewind to this point" style="cursor:pointer;opacity:0.55;margin-left:4px" onclick="handleRewindClick(event)">&#x21BA;</span>`
    : "";

  return `<div class="log-entry">${timestamp}<span class="log-text">${text}</span>${rewindMark}</div>`;
}

function renderLog() {
  const log = gameState.log || [];
  const logEl = document.getElementById("gameLog");
  // Preserve user scroll position if they've scrolled back to review older entries.
  // The log renders newest-at-top, so "near the top" means scrollTop is small.
  const wasAtNewest = !logEl || logEl.scrollTop < 32;

  document.getElementById("logEntries").innerHTML = log
    .slice()
    .reverse()
    .map(renderLogEntryRow)
    .join("");

  // Auto-scroll log to top (newest entries) only when the user was already there
  if (logEl && wasAtNewest) logEl.scrollTop = 0;

  // Update undo/redo button state
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if (undoBtn) undoBtn.disabled = !gameState.canUndo;
  if (redoBtn) redoBtn.disabled = false; // Can't know redo state from server easily; always enable
}

function addLogEntry(text) {
  const el = document.getElementById("logEntries");
  el.innerHTML = renderLogEntryRow({ text, timestamp: formatNowForLog(), rewindable: false }) + el.innerHTML;
}

/** Format "now" as HH:MM in local time for optimistic client-side log rows. */
function formatNowForLog() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Click handler for the ↺ marker on rewindable log entries.
 *
 * W8 fallback: every rewindable marker performs a single-step rewind
 * regardless of which entry was clicked. Full "jump to this point" wiring
 * (looping N undo steps server-side) is a follow-up — see
 * .ai_memory/riftatlas-gap-closure-sequenced-plan.md Section 6.
 */
function handleRewindClick(event) {
  event.stopPropagation();
  if (typeof requestUndo === "function") {
    requestUndo();
  }
}

/**
 * Text of the server-emitted log line that marks a successful rewind. Must
 * stay in sync with server.ts's undo paths — the client uses this as a
 * sentinel to clear in-progress interaction state and flash the board.
 */
const REWIND_LOG_SENTINEL = "Rewound their last action.";

/** Track the last-seen rewind entry so we only react to new rewinds. */
let lastSeenRewindTimestamp = null;

/**
 * Detect whether a new state frame's newest log entry is the canonical
 * "Rewound their last action." line and, if so, clear any in-progress UI
 * interaction (target cursor, armed hotkey modes) and flash the board.
 *
 * Called from render() after gameState has been updated for the new frame.
 */
function clearInteractionStateOnRewind() {
  const log = gameState?.log;
  if (!Array.isArray(log) || log.length === 0) return;
  const newest = log[log.length - 1];
  if (!newest || newest.text !== REWIND_LOG_SENTINEL) return;

  // Dedupe: only react if this is a different rewind than the one we
  // already processed (timestamp is HH:MM, but combined with text it's a
  // stable-enough sentinel for per-frame detection).
  const stamp = newest.timestamp || "";
  if (stamp === lastSeenRewindTimestamp && log === gameState.log) {
    // Same entry on a re-render — nothing to do.
  }
  if (stamp === lastSeenRewindTimestamp) return;
  lastSeenRewindTimestamp = stamp;

  try {
    if (typeof cancelInteraction === "function") cancelInteraction();
  } catch (err) {
    console.warn("[renderer] cancelInteraction threw during rewind", err);
  }
  try {
    if (typeof disarmAll === "function") disarmAll();
  } catch (err) {
    console.warn("[renderer] disarmAll threw during rewind", err);
  }

  // Brief visual flash on the scale wrapper — purely cosmetic.
  const wrapper = document.getElementById("game-scale-wrapper");
  if (wrapper) {
    wrapper.classList.remove("rewind-flash");
    // Force reflow so the animation restarts if two rewinds happen quickly.
    void wrapper.offsetWidth;
    wrapper.classList.add("rewind-flash");
    setTimeout(() => wrapper.classList.remove("rewind-flash"), 320);
  }
}

function requestUndo() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "undo" }));
}

function requestRedo() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "redo" }));
}

// Chain / Showdown Overlay

function renderChainOverlay() {
  const overlay = document.getElementById("chainOverlay");
  const box = document.getElementById("chainBox");
  if (!overlay || !box) return;

  const interaction_state = gameState?.interaction;
  const chain = interaction_state?.chain;

  // W9: showdown rendering has moved to the per-battlefield inline panel
  // (see showdown.js + renderBattlefields). The chain overlay now only
  // reacts to the spell chain itself.
  if (!chain || !chain.active) {
    overlay.classList.remove("visible");
    box.classList.remove("showdown-active");
    return;
  }

  overlay.classList.add("visible");
  box.classList.remove("showdown-active");

  const isMyPriority = chain?.activePlayer === viewingPlayer;
  const hasChain = chain?.active && chain.items?.length > 0;

  // Resolve card name helper
  function resolveChainCard(cardId) {
    if (!gameState?.zones) return cardId;
    for (const zoneCards of Object.values(gameState.zones)) {
      const found = zoneCards.find(c => c.id === cardId);
      if (found) return found.name || cardId;
    }
    const stripped = cardId.replace(/^player-[12]-(?:main|rune)-\d+-/, "");
    for (const zoneCards of Object.values(gameState.zones)) {
      const found = zoneCards.find(c => c.definitionId === stripped);
      if (found) return found.name || cardId;
    }
    return cardId;
  }

  let html = "";

  // ---- Chain active ----
  // W9: showdown-specific DOM was removed from this overlay. Per-battlefield
  // inline panels (showdown.js) own all showdown UI now.
  if (hasChain) {
    html += `<div class="chain-title">The Chain</div>`;
    html += `<div class="chain-subtitle">Spells and abilities resolving — play reactions or pass</div>`;

    html += `<div class="chain-stack">`;
    const items = [...(chain.items || [])].reverse();
    items.forEach((item, i) => {
      const isTop = i === 0;
      const cardName = resolveChainCard(item.cardId);
      const controller = pName(item.controller);
      const imgId = item.cardId.replace(/^player-[12]-(?:main|rune)-\d+-/, "");
      html += `
        <div class="chain-item ${isTop ? "top-item" : ""}">
          <div class="ci-order">${isTop ? "Next" : items.length - i}</div>
          <img class="ci-img" src="/card-image/${esc(imgId)}" alt="" onerror="this.style.display='none'">
          <div class="ci-info">
            <div class="ci-name">${esc(cardName)}</div>
            <div class="ci-detail">${esc(controller)} — ${esc(item.type)}${item.countered ? " (Countered)" : ""}</div>
          </div>
        </div>
      `;
    });
    html += `</div>`;

    html += `<div class="chain-priority">`;
    if (isMyPriority) {
      html += `<span class="priority-player">${esc(pName(chain.activePlayer))} has Priority</span> — play a reaction spell or pass`;
    } else if (chain.activePlayer) {
      const name = pName(chain.activePlayer);
      html += `<span class="priority-waiting">${esc(name)} has Priority</span> — waiting...`;
    } else {
      html += `All players passed — resolving top item`;
    }
    html += `</div>`;
  }

  // ---- Action buttons ----
  // W9: showdown-focus passing is handled by the per-battlefield inline
  // panel; this block now only offers chain-priority passing / resolving.
  html += `<div class="chain-actions">`;
  if (isMyPriority) {
    const passMove = availableMoves.find(m => m.moveId === "passChainPriority");
    if (passMove) {
      const passParams = JSON.stringify(passMove.params).replace(/'/g, "\\'");
      html += `<button class="chain-pass-btn" onclick='executeMove("${passMove.moveId}", ${passParams}, "${passMove.playerId}")'>Pass (Space)</button>`;
      html += `<div class="chain-hint">Press Space to pass</div>`;
    }

    const resolveMove = availableMoves.find(m => m.moveId === "resolveChain");
    if (resolveMove) {
      const resolveParams = JSON.stringify(resolveMove.params).replace(/'/g, "\\'");
      html += `<button class="chain-resolve-btn" onclick='executeMove("${resolveMove.moveId}", ${resolveParams}, "${resolveMove.playerId}")'>Resolve</button>`;
    }
  }
  html += `</div>`;

  box.innerHTML = html;
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
    els.img.src = nextSrc;
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
  return target.closest(".card");
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
