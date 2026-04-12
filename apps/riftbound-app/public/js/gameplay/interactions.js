// interactions.js — Card interaction: selection, cost payment, action bar, target highlights

// Dynamically load auto-pay.js if it is not already loaded. This avoids touching
// gameplay.html while keeping the cost solver in its own file per the workstream spec.
(function ensureAutoPayLoaded() {
  if (typeof autoPayAndPlay === "function") return;
  if (document.querySelector('script[data-module="auto-pay"]')) return;
  const s = document.createElement("script");
  s.src = "/js/gameplay/auto-pay.js";
  s.setAttribute("data-module", "auto-pay");
  // eslint-disable-next-line no-undef
  document.head.appendChild(s);
})();

function switchPlayer(pid) {
  viewingPlayer = pid;
  resetInteractionSilent();
  // Reconnect WebSocket as new player to get correct moves
  disconnectWs();
  connectWs();
  render();
}

function onCardClick(cardId) {
  // If an armed hold-to-arm mode (C/B/T/L/E/P) is active, the click goes to
  // the armed-mode handler instead of the default selection behavior.
  if (typeof isArmed === "function" && isArmed()) {
    if (handleArmedCardClick(cardId)) return;
  }

  // If we are in awaitTarget mode and the clicked card is a valid target, execute
  // (this would be relevant for card-targeting in the future)

  // If in costPayment mode and clicking a rune, handle the rune action without leaving costPayment
  if (interaction.mode === "costPayment") {
    const zone = findCardZone(cardId);
    if (zone === "runePool") {
      handleCostPaymentRuneClick(cardId);
      return;
    }
    // Clicking the pending card again cancels costPayment
    if (cardId === interaction.pendingCardId) {
      cancelInteraction();
      return;
    }
    // Clicking any other card cancels costPayment and selects the new card
    cancelInteraction();
    // Fall through to normal selection below
  }

  // If already selected, deselect
  if (interaction.mode !== "idle" && interaction.sourceCardId === cardId) {
    cancelInteraction();
    return;
  }

  // If in cardSelected/awaitTarget mode and clicking a different card,
  // cancel first then select the new one
  if (interaction.mode !== "idle") {
    cancelInteraction();
  }

  // Find the zone this card lives in
  const zone = findCardZone(cardId);
  if (!zone) return;

  // Only allow interactions with cards the viewing player owns
  const card = findCard(cardId);
  if (!card || card.owner !== viewingPlayer) {
    // Still allow selecting opponent cards for preview purposes
    selectedCard = cardId;
    render();
    return;
  }

  if (zone === "hand") {
    enterHandCardSelected(cardId);
  } else if (zone === "base") {
    enterBaseCardSelected(cardId);
  } else if (zone === "runePool") {
    enterRuneSelected(cardId);
  } else if (zone.startsWith("battlefield-")) {
    enterBattlefieldCardSelected(cardId, zone);
  } else if (zone === "legendZone") {
    enterLegendSelected(cardId);
  } else if (zone === "championZone") {
    enterChampionSelected(cardId);
  } else {
    // Generic select for other zones
    selectedCard = cardId;
    render();
  }
}

/** Handle left-clicking a rune while in costPayment mode (exhaust immediately) */
function handleCostPaymentRuneClick(runeCardId) {
  // Left-click during cost payment = exhaust for energy
  const exhaustMove = availableMoves.find(m =>
    m.moveId === "exhaustRune" && (m.params?.runeId === runeCardId || m.params?.cardId === runeCardId)
  );

  if (exhaustMove) {
    snapshotResources();
    executeMove(exhaustMove.moveId, exhaustMove.params, exhaustMove.playerId);
    return;
  }

  // No exhaust available — explain why
  const card = findCard(runeCardId);
  if (card?.meta?.exhausted) {
    showToast("Rune is already exhausted");
  } else if (gameState?.turn?.phase && gameState.turn.phase !== "main") {
    showToast(`Can't exhaust runes during ${gameState.turn.phase} phase`);
  } else if (gameState?.turn?.activePlayer !== viewingPlayer) {
    showToast("Not your turn");
  } else {
    showToast("This rune can't be exhausted right now");
  }
}

/** Find which zone a card is in */
function findCardZone(cardId) {
  if (!gameState?.zones) return null;
  for (const [zoneName, cards] of Object.entries(gameState.zones)) {
    if (cards.find(c => c.id === cardId)) return zoneName;
  }
  return null;
}

/** Find a card object by ID across all zones */
function findCard(cardId) {
  if (!gameState?.zones) return null;
  for (const cards of Object.values(gameState.zones)) {
    const found = cards.find(c => c.id === cardId);
    if (found) return found;
  }
  return null;
}

/** Cancel the current interaction, reset to idle */
function cancelInteraction() {
  interaction = {
    mode: "idle",
    sourceCardId: null,
    sourceZone: null,
    action: null,
    validTargets: [],
    matchingMoves: [],
    pendingCardId: null,
    pendingCardCost: 0,
  };
  selectedCard = null;
  document.getElementById("actionBar").classList.add("hidden");
  clearValidTargetHighlights();
  clearRuneTappableHighlights();
  render();
}

/** Remove .valid-target and .drag-over classes from all elements */
function clearValidTargetHighlights() {
  document.querySelectorAll(".valid-target").forEach(el => el.classList.remove("valid-target"));
  document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
}

/** Enter selected mode for legend card — activate abilities */
function enterLegendSelected(cardId) {
  const abilityMoves = availableMoves.filter(m =>
    m.moveId === "activateAbility" && m.params?.cardId === cardId
  );

  if (abilityMoves.length === 0) {
    // No activatable abilities, just select for preview
    selectedCard = cardId;
    render();
    return;
  }

  const card = findCard(cardId);
  interaction = {
    mode: "cardSelected",
    sourceCardId: cardId,
    sourceZone: "legendZone",
    action: "activateAbility",
    validTargets: [],
    matchingMoves: abilityMoves,
  };
  selectedCard = cardId;

  render();
  showLegendAbilityActionBar(card?.name || cardId, abilityMoves);
}

/** Show action bar for legend ability activation */
function showLegendAbilityActionBar(cardName, abilityMoves) {
  const bar = document.getElementById("actionBar");
  const label = document.getElementById("actionBarLabel");
  const btns = document.getElementById("actionBarBtns");

  const displayName = cardName.replace(/^player-[12]-/, "");
  label.textContent = `Legend: ${displayName}`;

  let html = "";
  for (let i = 0; i < abilityMoves.length; i++) {
    const move = abilityMoves[i];
    const idx = move.params?.abilityIndex ?? i;
    html += `<button class="action-bar-btn" style="background:#2a2050;border-color:#b080e0;color:#d0b0f0;" onclick='executeInteractionMove("activateAbility", ${idx})'>Activate Ability ${idx + 1}</button>`;
  }

  btns.innerHTML = html;
  bar.classList.remove("hidden");
}

/** Enter selected mode for champion in champion zone — play to base */
function enterChampionSelected(cardId) {
  const playMoves = availableMoves.filter(m =>
    m.moveId === "playFromChampionZone"
  );

  if (playMoves.length === 0) {
    const card = findCard(cardId);
    if (card && card.energyCost > 0) {
      const pool = gameState?.runePools?.[viewingPlayer];
      const totalEnergy = pool?.energy ?? 0;
      if (totalEnergy < card.energyCost) {
        showToast(`Not enough energy (${totalEnergy}/${card.energyCost}) — exhaust runes first`);
      }
    }
    selectedCard = cardId;
    render();
    return;
  }

  const card = findCard(cardId);
  interaction = {
    mode: "cardSelected",
    sourceCardId: cardId,
    sourceZone: "championZone",
    action: "playCard",
    validTargets: ["player-base"],
    matchingMoves: playMoves,
  };
  selectedCard = cardId;

  render();
  applyValidTargetHighlights();
  showActionBar(card?.name || cardId, playMoves, "Play Champion to Base");
}

/** Enter cardSelected mode for a hand card (playUnit/playSpell/playGear) */
function enterHandCardSelected(cardId) {
  const playMoves = availableMoves.filter(m =>
    (m.moveId === "playUnit" || m.moveId === "playSpell" || m.moveId === "playGear") &&
    m.params?.cardId === cardId
  );

  // Single-click auto-play: if the card is already playable, skip the action bar and
  // play it directly. This is the Workstream 7 click-to-play contract.
  if (playMoves.length > 0 && typeof autoPayAndPlay === "function") {
    autoPayAndPlay(cardId);
    return;
  }

  if (playMoves.length === 0) {
    const card = findCard(cardId);

    // Workstream 7: try Auto Pay first — if a valid cost plan exists, pay and play.
    if (card && typeof autoPayAndPlay === "function" && typeof canAutoPay === "function" && canAutoPay(cardId)) {
      autoPayAndPlay(cardId);
      return;
    }

    // Fall back to the existing manual cost-payment mode (users who prefer clicking
    // runes manually still get the old flow).
    if (card && card.energyCost > 0) {
      const pool = gameState?.runePools?.[viewingPlayer];
      const totalEnergy = pool?.energy ?? 0;
      if (totalEnergy < card.energyCost) {
        const runeExhaustMoves = availableMoves.filter(m =>
          m.moveId === "exhaustRune" || m.moveId === "recycleRune"
        );
        if (runeExhaustMoves.length > 0) {
          enterCostPaymentMode(cardId, card, totalEnergy);
          return;
        }
        showToast(`Not enough energy (${totalEnergy}/${card.energyCost}) — no runes available`);
      }
    }
    // No playable moves for this card, just select it for info
    selectedCard = cardId;
    render();
    return;
  }

  // Fallback: if auto-pay is not loaded yet, use the existing action-bar flow.
  const card = findCard(cardId);
  interaction = {
    mode: "cardSelected",
    sourceCardId: cardId,
    sourceZone: "hand",
    action: "playCard",
    validTargets: ["player-base"], // hand cards play to base
    matchingMoves: playMoves,
    pendingCardId: null,
    pendingCardCost: 0,
  };
  selectedCard = cardId;

  render();
  applyValidTargetHighlights();
  showActionBar(card?.name || cardId, playMoves);
}

/** Enter cost payment mode for a card that needs more energy */
function enterCostPaymentMode(cardId, card, currentEnergy) {
  interaction = {
    mode: "costPayment",
    sourceCardId: cardId,
    sourceZone: "hand",
    action: "costPayment",
    validTargets: [],
    matchingMoves: [],
    pendingCardId: cardId,
    pendingCardCost: card.energyCost,
  };
  selectedCard = cardId;

  render();
  applyRuneTappableHighlights();
  showCostPaymentActionBar(card, currentEnergy);
}

/** Show the cost payment action bar with energy progress */
function showCostPaymentActionBar(card, currentEnergy) {
  const bar = document.getElementById("actionBar");
  const label = document.getElementById("actionBarLabel");
  const btns = document.getElementById("actionBarBtns");

  const displayName = (card.name || card.id).replace(/^player-[12]-/, "");
  const cost = card.energyCost || interaction.pendingCardCost;
  const isAffordable = currentEnergy >= cost;
  const countClass = isAffordable ? "affordable" : "insufficient";

  label.innerHTML = `
    <span class="cost-payment-progress">
      Need energy for <strong>${esc(displayName)}</strong>:
      <span class="energy-count ${countClass}">${currentEnergy} / ${cost}</span>
    </span>
  `;

  let html = "";
  if (isAffordable && interaction.mode === "cardSelected" && interaction.matchingMoves.length > 0) {
    // Card is now affordable and interaction was transitioned — show play buttons
    clearRuneTappableHighlights();
    applyValidTargetHighlights();

    const types = new Set(interaction.matchingMoves.map(m => m.moveId));
    for (const moveId of types) {
      const moveLabel = moveId === "playUnit" ? "Play Unit to Base"
        : moveId === "playSpell" ? "Cast Spell"
        : moveId === "playGear" ? "Play Gear"
        : moveId;
      html += `<button class="action-bar-btn" style="background:#2a5040;border-color:#50c878;color:#80e8a0;" onclick='executeInteractionMove(${JSON.stringify(moveId)})'>${esc(moveLabel)}</button>`;
    }
  } else if (!isAffordable) {
    html += `<span style="color:#6a6288;font-size:11px;">Exhaust runes to generate energy</span>`;
  }

  btns.innerHTML = html;
  bar.classList.remove("hidden");
}

/** Highlight runes in the rune pool that can be exhausted */
function applyRuneTappableHighlights() {
  clearRuneTappableHighlights();
  const runeExhaustMoves = availableMoves.filter(m =>
    m.moveId === "exhaustRune" || m.moveId === "recycleRune"
  );
  for (const move of runeExhaustMoves) {
    const cardId = move.params?.runeId || move.params?.cardId;
    if (cardId) {
      const el = document.querySelector(`[data-card-id="${CSS.escape(cardId)}"]`);
      if (el && !el.classList.contains("rune-tappable")) {
        el.classList.add("rune-tappable");
      }
    }
  }
}

/** Remove .rune-tappable class from all elements */
function clearRuneTappableHighlights() {
  document.querySelectorAll(".rune-tappable").forEach(el => el.classList.remove("rune-tappable"));
}

/** Enter cardSelected mode for a base card (standardMove to battlefield) */
function enterBaseCardSelected(cardId) {
  // Find standardMove entries that include this card
  const moveMoves = availableMoves.filter(m =>
    m.moveId === "standardMove" &&
    (m.params?.unitIds?.includes(cardId) || m.params?.unitId === cardId)
  );

  if (moveMoves.length === 0) {
    selectedCard = cardId;
    render();
    return;
  }

  // Valid targets are the battlefields referenced in these moves
  const targets = [];
  for (const m of moveMoves) {
    const bfId = m.params?.destination || m.params?.battlefieldId;
    if (bfId && !targets.includes(bfId)) targets.push(bfId);
  }

  const card = findCard(cardId);
  interaction = {
    mode: "cardSelected",
    sourceCardId: cardId,
    sourceZone: "base",
    action: "moveUnit",
    validTargets: targets,
    matchingMoves: moveMoves,
  };
  selectedCard = cardId;

  render();
  applyValidTargetHighlights();
  showActionBar(card?.name || cardId, moveMoves, "Move to battlefield");
}

/** Enter selected mode for a rune in rune pool (left-click = exhaust) */
function enterRuneSelected(cardId) {
  const exhaustMove = availableMoves.find(m =>
    m.moveId === "exhaustRune" && (m.params?.runeId === cardId || m.params?.cardId === cardId)
  );

  // If exhaust is available, execute it immediately (left-click = tap for energy)
  if (exhaustMove) {
    snapshotResources();
    executeMove(exhaustMove.moveId, exhaustMove.params, exhaustMove.playerId);
    return;
  }

  // No exhaust available — explain why
  const card = findCard(cardId);
  if (card?.meta?.exhausted) {
    showToast("Rune is already exhausted");
  } else if (gameState?.turn?.phase && gameState.turn.phase !== "main") {
    showToast(`Can't exhaust runes during ${gameState.turn.phase} phase`);
  } else if (gameState?.turn?.activePlayer !== viewingPlayer) {
    showToast("Not your turn");
  } else {
    showToast("No rune actions available right now");
  }
  selectedCard = cardId;
  render();
}

/** Enter selected mode for a card on a battlefield */
function enterBattlefieldCardSelected(cardId, zone) {
  // Look for ganking moves or recall moves
  const gankMoves = availableMoves.filter(m =>
    m.moveId === "gankingMove" &&
    (m.params?.unitIds?.includes(cardId) || m.params?.unitId === cardId)
  );
  const recallMoves = availableMoves.filter(m =>
    m.moveId === "recallUnit" && (m.params?.unitId === cardId || m.params?.cardId === cardId)
  );

  const allMoves = [...gankMoves, ...recallMoves];
  if (allMoves.length === 0) {
    selectedCard = cardId;
    render();
    return;
  }

  const targets = [];
  for (const m of gankMoves) {
    const bfId = m.params?.toBattlefield || m.params?.battlefieldId;
    if (bfId && !targets.includes(bfId)) targets.push(bfId);
  }

  const card = findCard(cardId);
  interaction = {
    mode: "cardSelected",
    sourceCardId: cardId,
    sourceZone: zone,
    action: "moveUnit",
    validTargets: targets,
    matchingMoves: allMoves,
  };
  selectedCard = cardId;

  render();
  applyValidTargetHighlights();
  showBattlefieldCardActionBar(card?.name || cardId, gankMoves, recallMoves);
}

/** Apply .valid-target highlights based on interaction state */
function applyValidTargetHighlights() {
  clearValidTargetHighlights();

  if (interaction.action === "playCard") {
    // Highlight the player base zone
    const baseEl = document.getElementById("player-base");
    if (baseEl) baseEl.classList.add("valid-target");
  } else if (interaction.action === "moveUnit") {
    // Highlight valid battlefield destinations
    for (const bfId of interaction.validTargets) {
      const bfEl = document.querySelector(`[data-bf-id="${CSS.escape(bfId)}"]`);
      if (bfEl) bfEl.classList.add("valid-target");
    }
  }
}

/** Show the action bar for a play card action */
function showActionBar(cardName, moves, hint) {
  const bar = document.getElementById("actionBar");
  const label = document.getElementById("actionBarLabel");
  const btns = document.getElementById("actionBarBtns");

  const displayName = cardName.replace(/^player-[12]-/, "");
  label.textContent = hint || `Play ${displayName}`;

  let html = "";
  if (interaction.action === "playCard") {
    // Group by move type
    const types = new Set(moves.map(m => m.moveId));
    for (const moveId of types) {
      const movesOfType = moves.filter(m => m.moveId === moveId);
      const moveLabel = moveId === "playUnit" ? "Play Unit to Base"
        : moveId === "playSpell" ? "Cast Spell"
        : moveId === "playGear" ? "Play Gear"
        : moveId;
      html += `<button class="action-bar-btn" onclick='executeInteractionMove(${JSON.stringify(moveId)})'>${esc(moveLabel)}</button>`;
    }
  } else if (interaction.action === "moveUnit") {
    for (const bfId of interaction.validTargets) {
      const bfName = getBattlefieldName(bfId);
      html += `<button class="action-bar-btn" onclick='onZoneClick("${esc(bfId)}")'>${esc("Move to " + bfName)}</button>`;
    }
  }

  btns.innerHTML = html;
  bar.classList.remove("hidden");
}

/** Show action bar for battlefield card actions (gank/recall) */
function showBattlefieldCardActionBar(cardName, gankMoves, recallMoves) {
  const bar = document.getElementById("actionBar");
  const label = document.getElementById("actionBarLabel");
  const btns = document.getElementById("actionBarBtns");

  const displayName = cardName.replace(/^player-[12]-/, "");
  label.textContent = `Unit: ${displayName}`;

  let html = "";
  if (recallMoves.length > 0) {
    html += `<button class="action-bar-btn" onclick='executeInteractionMove("recallUnit")'>Recall to Base</button>`;
  }
  for (const bfId of interaction.validTargets) {
    const bfName = getBattlefieldName(bfId);
    html += `<button class="action-bar-btn" onclick='onZoneClick("${esc(bfId)}")'>${esc("Gank to " + bfName)}</button>`;
  }

  btns.innerHTML = html;
  bar.classList.remove("hidden");
}

/** Get a display name for a battlefield */
function getBattlefieldName(bfId) {
  if (!gameState?.zones) return bfId;
  const bfRowCards = gameState.zones["battlefieldRow"] || [];
  for (const c of bfRowCards) {
    if (c.id === bfId) return c.name || bfId;
  }
  return bfId.replace(/^ogn-|^sfd-|^unl-/g, "").replace(/-\d+$/, "");
}

/** Execute a move matching the current interaction by moveId (and optionally abilityIndex) */
function executeInteractionMove(moveId, abilityIndex) {
  let move;
  if (abilityIndex != null) {
    move = interaction.matchingMoves.find(m => m.moveId === moveId && m.params?.abilityIndex === abilityIndex);
  } else {
    move = interaction.matchingMoves.find(m => m.moveId === moveId);
  }
  if (!move) return;
  executeMove(move.moveId, move.params, move.playerId);
  cancelInteraction();
}

// Wire global hotkeys + help modal once the DOM is ready. Both modules expose
// their init entry points on `window` via hotkeys.js / help-modal.js.
(function wireHotkeysAndHelp() {
  function go() {
    if (typeof initHotkeys === "function") initHotkeys();
    if (typeof initHelpModal === "function") initHelpModal();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", go, { once: true });
  } else {
    go();
  }
})();
