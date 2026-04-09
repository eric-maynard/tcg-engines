// renderer.js — Main rendering: game board, zones, cards, actions, log, chain overlay

function render() {
  if (!gameState) return;

  // Detect phase/turn transitions before rendering
  checkPhaseTransition();

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
}

/** Resolve a param value: if it's a card ID, return the card name */
function resolveParamValue(value) {
  if (typeof value !== "string") return value;
  const card = findCard(value);
  if (card && card.name) return card.name;
  return value.replace(/^player-[12]-/, "");
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
        : status === "finished" ? `Game Over — ${gameState.winner === viewingPlayer ? "You Win!" : "You Lose"}`
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

  let html = '<span class="rb-label">Resources</span>';

  // Energy
  html += `<div class="rb-item">
    <div class="rb-icon pip-energy" style="width:auto;border-radius:4px;padding:0 6px;font-size:9px;">Energy</div>
    <div class="rb-value ${energy > 0 ? "has-value" : ""}">${energy}</div>
  </div>`;

  // Domain powers
  const DOMAIN_LABELS = { fury: "F", calm: "C", mind: "M", body: "B", chaos: "X", order: "O" };
  for (const [domain, amount] of Object.entries(powers)) {
    if (amount > 0) {
      html += `<div class="rb-item">
        <div class="rb-icon pip-${domain}">${DOMAIN_LABELS[domain] ?? domain[0].toUpperCase()}</div>
        <div class="rb-value has-value">${amount}</div>
      </div>`;
    }
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

  const classes = ["card"];
  if (card.cardType) classes.push("type-" + card.cardType);
  if (card.meta?.exhausted) classes.push("exhausted");
  if (card.meta?.stunned) classes.push("stunned");
  if (card.meta?.buffed) classes.push("buffed");
  if (selectedCard === card.id) classes.push("selected");
  if (interaction.sourceCardId === card.id && interaction.mode !== "idle") classes.push("interaction-source");

  const defId = card.definitionId || "";
  const imgId = defId.replace(/^player-[12]-/, "");

  // Legend cards are display-only — never interactive
  const isLegendZone = zone === "legendZone";

  // Determine if this card is playable (has available moves)
  const isOwned = card.owner === viewingPlayer;
  const isPlayable = !isLegendZone && isOwned && hasMovesForCard(card.id, zone);
  if (isPlayable) classes.push("playable");

  // Legend cards: no pointer events, just hover preview and zoom
  const pointerAttr = isLegendZone
    ? ""
    : `onpointerdown="onPointerDown(event, '${esc(card.id)}')"`;

  return `
    <div class="${classes.join(" ")}"
         data-card-id="${esc(card.id)}"
         data-def-id="${esc(defId)}"
         data-zone="${esc(zone)}"
         ${pointerAttr}
         onmouseenter="showPreview(event, this)"
         onmouseleave="hidePreview()"
         ondblclick="openZoom('${esc(card.id)}')"
         style="${isLegendZone ? "cursor:default;" : ""}"">
      ${card.energyCost != null ? `<div class="card-cost">${card.energyCost}</div>` : ""}
      ${card.might != null ? `<div class="card-might">${card.might}</div>` : ""}
      <img class="card-img" src="/card-image/${esc(imgId)}" alt="${esc(card.name)}"
           onerror="this.style.background='linear-gradient(135deg,#201a38,#2a2248)';this.alt='${esc(card.name)}'">
      ${card.meta?.damage > 0 ? `<div class="card-damage">${card.meta.damage}</div>` : ""}
      <div class="card-name">${esc(card.name || "")}</div>
    </div>
  `;
}

function renderDeckStack(zoneCards, label) {
  const count = zoneCards?.length ?? 0;
  return `
    <div class="deck-stack">
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

  // Opponent base
  const opponentBase = zoneForPlayer("base", opponent);
  document.getElementById("opponent-base").innerHTML =
    opponentBase.map(c => renderCardElement(c, false, "base")).join("") ||
    "";

  // Rune pools
  // Rune pools — grouped by domain, stacked max 3 per pile
  const DOMAIN_COLORS = { fury: "#d04040", calm: "#40a0d0", mind: "#a050d0", body: "#50b050", chaos: "#d08030", order: "#d0d040" };
  const STACK_MAX = 3;
  function renderRuneStacks(runes) {
    // Group by domain
    const groups = {};
    for (const c of runes) {
      const d = (Array.isArray(c.domain) ? c.domain[0] : c.domain) || "unknown";
      (groups[d] = groups[d] || []).push(c);
    }
    let html = "";
    for (const [domain, cards] of Object.entries(groups)) {
      const color = DOMAIN_COLORS[domain] || "#a09030";
      // Split into sub-stacks of STACK_MAX
      for (let s = 0; s < cards.length; s += STACK_MAX) {
        const chunk = cards.slice(s, s + STACK_MAX);
        const stackHeight = 70 + (chunk.length - 1) * 14;
        html += `<div class="rune-stack" style="height:${stackHeight + 16}px;">`;
        html += `<div class="rune-stack-label" style="color:${color};">${domain[0].toUpperCase()}</div>`;
        chunk.forEach((c, i) => {
          const el = renderCardElement(c, false, "runePool");
          html += el.replace('class="card', `style="top:${14 + i * 14}px;z-index:${i + 1};border-color:${color};" class="card`);
        });
        html += `</div>`;
      }
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

  // Deck stacks
  document.getElementById("player-decks").innerHTML =
    renderDeckStack(zoneForPlayer("mainDeck", viewingPlayer), "Main") +
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
  document.getElementById("battlefieldRow").innerHTML = html;
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
        const paramStr = Object.entries(m.params || {})
          .filter(([k]) => k !== "playerId")
          .map(([k, v]) => `${k}: ${resolveParamValue(v)}`)
          .join(", ");

        html += `
          <button class="action-btn ${isPrimary ? "primary" : ""} ${isHighlighted ? "highlighted" : ""}"
                  onclick='executeMove(${JSON.stringify(moveId)}, ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})'>
            ${esc(label)}
            ${paramStr ? `<div class="action-detail">${esc(paramStr)}</div>` : ""}
          </button>
        `;
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
              const paramStr = Object.entries(m.params || {})
                .filter(([k]) => k !== "playerId")
                .map(([k, v]) => `${resolveParamValue(v)}`)
                .join(", ");
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
  passChainPriority: "passed priority",
  passShowdownFocus: "passed focus",
  endTurn: "ended their turn",
  channelRunes: "channeled runes",
  drawCard: "drew a card",
  activateAbility: "activated an ability",
  conquerBattlefield: "conquered a battlefield",
  recycleRune: "recycled a rune",
  readyAll: "readied all cards",
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

function renderLog() {
  const log = gameState.log || [];
  document.getElementById("logEntries").innerHTML = log
    .slice()
    .reverse()
    .map(entry => {
      // Highlight player references
      let html = esc(formatLogEntry(entry));
      html = html.replace(/\bP1\b/g, '<span class="log-player">P1</span>');
      html = html.replace(/\bP2\b/g, '<span class="log-player" style="color:#e09060">P2</span>');
      return `<div class="log-entry">${html}</div>`;
    })
    .join("");

  // Auto-scroll log to top (newest entries)
  const logEl = document.getElementById("gameLog");
  if (logEl) logEl.scrollTop = 0;

  // Update undo/redo button state
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if (undoBtn) undoBtn.disabled = !gameState.canUndo;
  if (redoBtn) redoBtn.disabled = false; // Can't know redo state from server easily; always enable
}

function addLogEntry(text) {
  const el = document.getElementById("logEntries");
  let html = esc(text);
  html = html.replace(/\bP1\b/g, '<span class="log-player">P1</span>');
  html = html.replace(/\bP2\b/g, '<span class="log-player" style="color:#e09060">P2</span>');
  el.innerHTML = `<div class="log-entry">${html}</div>` + el.innerHTML;
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
  const showdown = interaction_state?.showdown;

  // No chain and no showdown — hide overlay
  if ((!chain || !chain.active) && (!showdown || !showdown.active)) {
    overlay.classList.remove("visible");
    box.classList.remove("showdown-active");
    return;
  }

  overlay.classList.add("visible");

  const isMyPriority = chain?.activePlayer === viewingPlayer;
  const isMyFocus = showdown?.focusPlayer === viewingPlayer;
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

  // ---- Showdown active ----
  if (showdown?.active) {
    const bfName = getBattlefieldName(showdown.battlefieldId);

    if (showdown.isCombatShowdown) {
      html += `<div class="showdown-battlefield">Combat Showdown at ${esc(bfName)}</div>`;
      html += `<div class="chain-subtitle">Play spells or pass focus</div>`;
      box.classList.add("showdown-active");

      // Get units at the battlefield
      const bfZoneId = "battlefield-" + showdown.battlefieldId;
      const unitsAtBf = (gameState.zones || {})[bfZoneId] || [];
      const attackerUnits = unitsAtBf.filter(c => c.owner === showdown.attackingPlayer);
      const defenderUnits = unitsAtBf.filter(c => c.owner !== showdown.attackingPlayer);

      // Render showdown sides with unit cards
      html += `<div class="showdown-sides">`;
      html += `<div class="showdown-side attacker">
        <div class="side-label">Attacker${showdown.attackingPlayer === viewingPlayer ? " (You)" : ""}</div>
        <div class="side-units" id="showdownAttackers">${attackerUnits.map(c => renderShowdownCard(c)).join("")}</div>
      </div>`;
      html += `<div class="showdown-side defender">
        <div class="side-label">Defender${showdown.defendingPlayer === viewingPlayer ? " (You)" : ""}</div>
        <div class="side-units" id="showdownDefenders">${defenderUnits.map(c => renderShowdownCard(c)).join("")}</div>
      </div>`;
      html += `</div>`;

      // Combat Preview — Might comparison
      const preview = calculateCombatPreview(attackerUnits, defenderUnits);
      const atkWinning = preview.attackerMight > preview.defenderMight;
      const defWinning = preview.defenderMight > preview.attackerMight;

      html += `<div class="combat-preview">`;
      html += `<div class="combat-preview-col">`;
      html += `<div class="combat-might attacker-might ${atkWinning ? "winning" : ""}">${preview.attackerMight}</div>`;
      html += `<div style="font-size:9px;color:#6a6288;">Attacker Might</div>`;
      html += `</div>`;
      html += `<div class="combat-vs">vs</div>`;
      html += `<div class="combat-preview-col">`;
      html += `<div class="combat-might defender-might ${defWinning ? "winning" : ""}">${preview.defenderMight}</div>`;
      html += `<div style="font-size:9px;color:#6a6288;">Defender Might</div>`;
      html += `</div>`;
      html += `</div>`;

      // Prediction text
      const predClass = atkWinning ? "pred-attacker" : defWinning ? "pred-defender" : "pred-tie";
      const predText = atkWinning ? "Attackers predicted to conquer"
        : defWinning ? "Defenders predicted to hold"
        : "Mutual destruction likely";
      html += `<div class="combat-prediction ${predClass}">${predText}</div>`;
    } else {
      html += `<div class="showdown-battlefield">Showdown at ${esc(bfName)}</div>`;
      html += `<div class="chain-subtitle">Showdown — play action/reaction spells or pass focus</div>`;
      box.classList.remove("showdown-active");
    }

    html += `<div class="chain-priority">`;
    if (isMyFocus) {
      html += `<span class="priority-player">${esc(pName(showdown.focusPlayer))} has Focus</span> — play a spell or pass`;
    } else {
      const focusName = pName(showdown.focusPlayer);
      html += `<span class="priority-waiting">${esc(focusName)} has Focus</span> — waiting...`;
    }
    html += `</div>`;
  } else {
    box.classList.remove("showdown-active");
  }

  // ---- Chain active ----
  if (hasChain) {
    if (!showdown?.active) {
      html += `<div class="chain-title">The Chain</div>`;
      html += `<div class="chain-subtitle">Spells and abilities resolving — play reactions or pass</div>`;
    } else {
      html += `<div style="margin-top:12px;"><div class="chain-title" style="font-size:14px;">Chain Stack</div></div>`;
    }

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
  html += `<div class="chain-actions">`;
  if (isMyPriority || isMyFocus) {
    const passMove = availableMoves.find(m =>
      m.moveId === "passChainPriority" || m.moveId === "passShowdownFocus"
    );
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
