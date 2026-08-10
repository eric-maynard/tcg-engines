// interactions.js — Card interaction: selection, cost payment, action bar, target highlights

// DESIGN.md §Resource management: no auto-pay module is loaded.

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

  // Pending choose-target/choose-card: clicking a highlighted board card resolves it.
  if (gameState?.pendingChoice) {
    const pick = pendingChoicePickForCard(cardId);
    if (pick) {
      executeMove("resolvePendingChoice", pick.params, pick.playerId);
      return;
    }
  }

  // Targeting mode: clicking a legal target plays the pending move; anything else cancels.
  // rule-id: sfd-080-221 (rule 355.13) — "up to N" spells carry multi-target
  // variants: a pick that some variant can still extend keeps targeting open
  // (Done confirms the current set); otherwise the exact variant plays.
  if (isChoosingTarget()) {
    const chosen = interaction.chosenTargets || [];
    if (!(interaction.validTargets || []).includes(cardId)) {
      cancelInteraction();
      showToast("Targeting cancelled");
      return;
    }
    const next = [...chosen, cardId];
    const extending = variantsExtending(interaction.pendingMoves, next);
    if (extending.length > 0) {
      interaction.chosenTargets = next;
      interaction.validTargets = remainingTargetIds(extending, next);
      render();
      updateTargetBanner();
      return;
    }
    const move = chosen.length === 0
      ? pickTargetedMove(interaction.pendingMoves, cardId)
      : exactTargetVariant(interaction.pendingMoves, next);
    // rule 573 (Repeat) — the same target set may also have Repeat variants;
    // hold targeting open so the banner can offer them instead of silently
    // committing to the base cost.
    // rule 356.2.b — likewise hold targeting open while an optional additional
    // cost (discard / sacrifice) can still be elected for this target set.
    // rule 820.2.a (sfd-040-221 Thwonk!) — a Repeat may pick a DIFFERENT target,
    // so the engine enumerates {targets:[A,B],repeatCount:n} with no base-cost
    // twin. Hold targeting open on the strength of the paid variants alone;
    // requiring a base-cost `move` here made that target set unreachable.
    if (
      repeatVariantsFor(interaction.pendingMoves, next).length > 0 ||
      additionalCostVariantsFor(interaction.pendingMoves, next).length > 0 ||
      mandatoryCostVariantsFor(interaction.pendingMoves, next).length > 0
    ) {
      interaction.chosenTargets = next;
      interaction.validTargets = remainingTargetIds(
        variantsExtending(interaction.pendingMoves, next),
        next,
      );
      render();
      updateTargetBanner();
      return;
    }
    if (move) {
      executeMove(move.moveId, move.params, move.playerId);
      cancelInteraction();
    } else {
      cancelInteraction();
      showToast("Targeting cancelled");
    }
    return;
  }

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
  } else if (zone.startsWith("facedown-")) {
    enterFacedownSelected(cardId, zone);
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
  hideTargetBanner();
  clearValidTargetHighlights();
  clearRuneTappableHighlights();
  render();
}

/** Remove .valid-target and .drag-over classes from all elements */
function clearValidTargetHighlights() {
  document.querySelectorAll(".valid-target").forEach(el => el.classList.remove("valid-target"));
  document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
  document.body.classList.remove("targeting-mode");
}

// ---- Targeting mode -----------------------------------------------------------
// The engine enumerates one move per legal target (params.targets[0] or
// params.chosenTargetId). Rather than silently playing the first variant, the UI
// enters awaitTarget/chooseTarget: legal targets glow, click picks, Esc cancels.

/** The card a targeted move variant points at, or null for untargeted moves. */
function moveTargetId(m) {
  const t = m?.params?.targets;
  if (Array.isArray(t) && t.length > 0) return t[0];
  // rule 476.1: an [Equip] variant targets the unit it attaches to.
  if (m?.moveId === "equipCard") return m.params?.unitId ?? null;
  return m?.params?.chosenTargetId ?? null;
}

function isChoosingTarget() {
  return interaction.mode === "awaitTarget" && interaction.action === "chooseTarget";
}

/** Among pending variants, pick the one for `targetId` (prefer base-cost, single-target). */
function pickTargetedMove(moves, targetId) {
  const matches = (moves || []).filter(m => moveTargetId(m) === targetId);
  if (matches.length === 0) return null;
  return matches.find(m => !m.params?.paidAdditionalCost && (m.params?.targets?.length ?? 1) === 1)
    || matches[0];
}

/** All target ids a variant binds ([] for untargeted / zero-target plays). */
function moveTargetList(m) {
  const t = m?.params?.targets;
  if (Array.isArray(t)) return t;
  if (m?.moveId === "equipCard") return m.params?.unitId ? [m.params.unitId] : [];
  const c = m?.params?.chosenTargetId;
  return c ? [c] : [];
}

/**
 * rule 356.4 (sfd-076-221 Production Surge) — the energy the engine will
 * actually charge. The server prices hand cards with the board's static cost
 * reductions applied (`effectiveEnergyCost`); the printed `energyCost` is only
 * the fallback for zones the server does not price.
 */
function payableEnergyCost(card) {
  const eff = card?.effectiveEnergyCost;
  if (typeof eff === "number") return eff;
  return typeof card?.energyCost === "number" ? card.energyCost : 0;
}

function isBaseCostVariant(m) {
  return !m.params?.paidAdditionalCost && !m.params?.repeatCount;
}

/**
 * rule 355.13 — a multi-target spell may bind the SAME object more than once
 * ("deal 1 damage to two units" can hit one unit twice), so target sets are
 * multisets: containment must compare counts, not set membership.
 */
function targetCounts(list) {
  const counts = new Map();
  for (const id of list) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/** True when every id in `chosen` appears in `list` at least as many times. */
function containsTargetMultiset(list, chosen) {
  const have = targetCounts(list);
  for (const [id, n] of targetCounts(chosen)) if ((have.get(id) ?? 0) < n) return false;
  return true;
}

/** Variants whose target set strictly contains `chosen` (more picks possible). */
function variantsExtending(moves, chosen) {
  return (moves || []).filter(m => {
    const t = moveTargetList(m);
    return t.length > chosen.length && containsTargetMultiset(t, chosen);
  });
}

/**
 * Variant binding exactly `chosen` (order-insensitive) at the PRINTED cost.
 *
 * rule 356.1 — a play only happens at base cost when the engine actually
 * enumerated a base-cost variant for that target set. For a single-target
 * spell with [Repeat] (sfd-040-221 Thwonk!) every 2-target variant pays a
 * Repeat cost, so falling back to `matches[0]` here would label a Repeat
 * variant "Play" and silently charge the extra cost. No base variant = no
 * base play.
 */
function exactTargetVariant(moves, chosen) {
  const matches = (moves || []).filter(m => {
    const t = moveTargetList(m);
    return t.length === chosen.length && containsTargetMultiset(t, chosen);
  });
  return matches.find(isBaseCostVariant) || null;
}

/** True when `a` and `b` are the same ids in the same order. */
function sameTargetOrder(a, b) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * rule 573 (Repeat) — variants binding exactly `chosen` that pay one or more
 * extra Repeat costs, cheapest first. The engine enumerates these alongside the
 * base-cost play; without an explicit opt-in the UI would always take the base
 * variant and Repeat would be unreachable.
 */
function repeatVariantsFor(moves, chosen) {
  const matches = (moves || [])
    .filter(m => {
      const t = moveTargetList(m);
      if (t.length !== chosen.length || !containsTargetMultiset(t, chosen)) return false;
      return (m.params?.repeatCount ?? 0) > 0;
    })
    .sort((a, b) => (a.params?.repeatCount ?? 0) - (b.params?.repeatCount ?? 0));

  // The engine enumerates one variant per ORDERING of the same target multiset,
  // which would render a duplicate "Repeat xN" button per ordering. Keep one per
  // repeatCount, preferring the ordering the player actually clicked.
  // rule 356.2.a — the Repeat cost itself can be a card the PLAYER chooses
  // ("Repeat — Discard 1"): keying on repeatCount alone collapsed every
  // discardId into one button and discarded whichever variant came first.
  // Key on the cost card too so each candidate gets its own button.
  const byCount = new Map();
  for (const m of matches) {
    const n = m.params?.repeatCount ?? 0;
    const key = `${n} ${costChoiceId(m) ?? ""}`;
    const existing = byCount.get(key);
    if (!existing || (!sameTargetOrder(moveTargetList(existing), chosen) &&
                      sameTargetOrder(moveTargetList(m), chosen))) {
      byCount.set(key, m);
    }
  }
  return [...byCount.values()].sort((a, b) => (a.params?.repeatCount ?? 0) - (b.params?.repeatCount ?? 0));
}

/**
 * rule 356.2.b (ven-008-166 Ruthless Strike) — variants binding exactly `chosen`
 * that also pay an OPTIONAL additional cost (discard / sacrifice / extra pips).
 * The engine enumerates them alongside the base play; without an explicit opt-in
 * the UI always takes the base variant and the paid mode is unreachable.
 */
function additionalCostVariantsFor(moves, chosen) {
  return (moves || []).filter(m => {
    if (!m.params?.paidAdditionalCost || (m.params?.repeatCount ?? 0) > 0) return false;
    const t = moveTargetList(m);
    return t.length === chosen.length && containsTargetMultiset(t, chosen);
  });
}

/** The card a variant spends for a cost the player gets to choose (discard / sacrifice). */
function costChoiceId(m) {
  return m?.params?.discardId ?? m?.params?.sacrificeId ?? (m?.params?.sacrificeIds || [])[0] ?? null;
}

/**
 * rule 356.2.a — variants binding exactly `chosen` that differ only in WHICH
 * card pays a MANDATORY cost (Discard 1, Sacrifice a unit …). These are not
 * `paidAdditionalCost`, so without this the UI silently submitted the first one
 * and discarded whatever happened to be first in hand.
 * Returns [] unless there is a real choice to make.
 */
function mandatoryCostVariantsFor(moves, chosen) {
  const matches = (moves || []).filter(m => {
    if (!isBaseCostVariant(m) || costChoiceId(m) === null) return false;
    const t = moveTargetList(m);
    return t.length === chosen.length && containsTargetMultiset(t, chosen);
  });
  const seen = new Set();
  const unique = matches.filter(m => {
    const id = costChoiceId(m);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return unique.length > 1 ? unique : [];
}

/** Short label for the extra cost a paidAdditionalCost variant pays. */
function additionalCostLabel(m) {
  if (m.params?.discardId) {
    const name = (findCard(m.params.discardId)?.name || m.params.discardId).replace(/^player-[12]-/, "");
    return `Discard ${name}`;
  }
  const sacId = m.params?.sacrificeId ?? (m.params?.sacrificeIds || [])[0];
  if (sacId) {
    const name = (findCard(sacId)?.name || sacId).replace(/^player-[12]-/, "");
    return `Sacrifice ${name}`;
  }
  return "Pay additional cost";
}

/**
 * Ids that can still be added to `chosen` given the extending variants.
 * rule 355.13 — an id already picked stays selectable while some variant binds
 * it more times than it has been chosen (e.g. the [X,X] variant of a two-target spell).
 */
function remainingTargetIds(extending, chosen) {
  const picked = targetCounts(chosen);
  const ids = new Set();
  for (const m of extending) {
    for (const [id, n] of targetCounts(moveTargetList(m))) {
      if (n > (picked.get(id) ?? 0)) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * If `moves` (all for one source card / ability) carry per-target variants, enter
 * targeting mode and return true. Returns false when the caller should just play:
 * no targeted variants, or the only target is the source card itself.
 */
function beginTargetingIfNeeded(moves, sourceCardId, extraMoves) {
  const targeted = (moves || []).filter(m => moveTargetId(m));
  if (targeted.length === 0) return false;
  const targetIds = [...new Set(targeted.map(moveTargetId))];
  if (targetIds.length === 1 && targetIds[0] === sourceCardId && !(extraMoves && extraMoves.length)) return false;
  // rule-id: sfd-080-221 (rule 355.13) — keep zero-target variants pending so
  // "up to N" can be declined via the banner's "No target" button.
  const zeroTarget = (moves || []).filter(m => Array.isArray(m.params?.targets) && m.params.targets.length === 0);
  enterAwaitTargetMode([...targeted, ...zeroTarget], sourceCardId, extraMoves);
  return true;
}

/** Enter targeting for `moves`, or play immediately when no target choice is needed. */
function beginTargetingOrPlay(moves, sourceCardId) {
  if (!moves || moves.length === 0) return;
  if (beginTargetingIfNeeded(moves, sourceCardId)) return;
  // rule 356.2.b (ven-008-166) — with no target choice but several cost
  // variants, playing moves[0] would silently discard the paid options.
  if (
    moves.length > 1 &&
    sourceCardId &&
    moves.some(m => m.params?.paidAdditionalCost) &&
    typeof openPlayCostModal === "function"
  ) {
    openPlayCostModal(sourceCardId);
    if (interaction.mode !== "idle") cancelInteraction();
    return;
  }
  const m = moves[0];
  executeMove(m.moveId, m.params, m.playerId);
  if (interaction.mode !== "idle") cancelInteraction();
}

function enterAwaitTargetMode(pendingMoves, sourceCardId, extraMoves) {
  const targetIds = remainingTargetIds(pendingMoves, []);
  interaction = {
    mode: "awaitTarget",
    sourceCardId,
    sourceZone: findCardZone(sourceCardId),
    action: "chooseTarget",
    validTargets: targetIds,
    matchingMoves: pendingMoves,
    pendingMoves,
    // Alternative uses of the same card offered next to targeting (rule 723 "Hide at …").
    extraMoves: extraMoves || [],
    chosenTargets: [],
    pendingCardId: null,
    pendingCardCost: 0,
    enteredAt: performance.now(),
  };
  selectedCard = sourceCardId;
  document.getElementById("actionBar")?.classList.add("hidden");
  if (typeof closeZoom === "function") closeZoom();
  render(); // re-applies .valid-target via applyValidTargetHighlights
  updateTargetBanner();
}

/**
 * rule-id: sfd-080-221 (rule 355.13) — banner reflects multi-pick progress and
 * offers "No target" (zero-target variant) / "Done" (confirm current subset).
 */
function updateTargetBanner() {
  const name = (findCard(interaction.sourceCardId)?.name || "this card").replace(/^player-[12]-/, "");
  const chosen = interaction.chosenTargets || [];
  const buttons = [];
  if (chosen.length === 0) {
    const none = exactTargetVariant(interaction.pendingMoves, []);
    if (none) buttons.push({ label: "No target", move: none });
    // rule 723 (Hidden): the card may instead be hidden facedown at a battlefield you control.
    for (const m of interaction.extraMoves || []) {
      if (m.moveId === "hideCard") {
        buttons.push({ label: `Hide at ${getBattlefieldName(String(m.params?.battlefieldId ?? ""))}`, move: m });
      }
    }
  }
  const repeats = chosen.length === 0 ? [] : repeatVariantsFor(interaction.pendingMoves, chosen);
  const paid = chosen.length === 0 ? [] : additionalCostVariantsFor(interaction.pendingMoves, chosen);
  // rule 356.2.a — a mandatory cost the player chooses the card for gets one
  // button per candidate instead of a single "Done" that picks for them.
  const mandatory = chosen.length === 0 ? [] : mandatoryCostVariantsFor(interaction.pendingMoves, chosen);
  if (chosen.length > 0) {
    const done = mandatory.length > 0 ? null : exactTargetVariant(interaction.pendingMoves, chosen);
    if (done) {
      buttons.push({
        label: repeats.length > 0 || paid.length > 0 ? "Play" : `Done (${chosen.length})`,
        move: done,
      });
    }
    for (const m of mandatory) {
      buttons.push({ label: additionalCostLabel(m), move: m });
    }
    // rule 573 — one button per extra Repeat the player can pay for. When the
    // Repeat cost is a card the player picks (Discard 1 / Sacrifice), name it —
    // there is one button per candidate and an unlabelled button would hide
    // which card is being spent.
    const repeatNeedsCostLabel = repeats.filter(m => costChoiceId(m) !== null).length > 1;
    for (const m of repeats) {
      const cost = repeatNeedsCostLabel && costChoiceId(m) !== null ? ` — ${additionalCostLabel(m)}` : "";
      buttons.push({ label: `Repeat x${m.params.repeatCount}${cost}`, move: m });
    }
    // rule 356.2.b — one button per optional additional cost the player may elect.
    for (const m of paid) {
      buttons.push({ label: additionalCostLabel(m), move: m });
    }
  }
  // rule 355.7 (unl-106-219): a counter spell targets an item on the chain, and
  // no renderer draws the "chain" zone as a [data-card-id] node — such a target
  // cannot be clicked at all. Offer every unclickable valid target as an
  // explicit banner button, routed through onCardClick so multi-pick / Repeat
  // handling stays in one place.
  for (const id of interaction.validTargets || []) {
    if (document.querySelector(`[data-card-id="${CSS.escape(id)}"]`)) continue;
    const nm = String(
      findCard(id)?.name
      || (typeof resolveChainCard === "function" ? resolveChainCard(String(id)) : "")
      || id,
    ).replace(/^player-[12]-/, "");
    buttons.push({ label: `Target ${nm}`, pick: id });
  }

  const chosenNames = chosen.map(id => (findCard(id)?.name || id).replace(/^player-[12]-/, ""));
  const text = chosen.length === 0
    ? `Choose a target for ${name} — Esc to cancel`
    : repeats.length > 0
      ? `${name}: ${chosenNames.join(", ")} — Play, or pay Repeat · Esc to cancel`
      : paid.length > 0
        ? `${name}: ${chosenNames.join(", ")} — Play, or pay the additional cost · Esc to cancel`
        : `${name}: ${chosenNames.join(", ")} — pick another or Done · Esc to cancel`;
  showTargetBanner(text, buttons);
}

function showTargetBanner(text, buttons) {
  let banner = document.getElementById("targetBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "targetBanner";
    banner.className = "target-banner";
    document.body.appendChild(banner);
  }
  banner.textContent = text;
  for (const b of buttons || []) {
    const btn = document.createElement("button");
    btn.className = "target-banner-btn";
    btn.textContent = b.label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      // A `pick` button stands in for clicking an unclickable target (chain zone).
      if (b.pick) {
        onCardClick(b.pick);
        return;
      }
      executeMove(b.move.moveId, b.move.params, b.move.playerId);
      cancelInteraction();
    });
    banner.appendChild(btn);
  }
  banner.classList.add("visible");
}

function hideTargetBanner() {
  const banner = document.getElementById("targetBanner");
  if (!banner) return;
  banner.classList.remove("visible");
  banner.querySelectorAll(".target-banner-btn").forEach(b => b.remove());
}

/** Highlight every board/hand card that is a legal target of the pending moves. */
function applyChooseTargetHighlights() {
  for (const id of interaction.validTargets || []) {
    document.querySelectorAll(`[data-card-id="${CSS.escape(id)}"]`).forEach(el => el.classList.add("valid-target"));
  }
  document.body.classList.add("targeting-mode");
}

/** resolvePendingChoice move that picks `cardId`, if the viewer is the prompter. */
function pendingChoicePickForCard(cardId) {
  const pending = gameState?.pendingChoice;
  if (!pending) return null;
  if ((pending.prompter ?? pending.playerId) !== viewingPlayer) return null;
  return availableMoves.find(m => m.moveId === "resolvePendingChoice" && m.params?.pickedCardId === cardId) || null;
}

/** Mirror the pending-choice modal's card picks onto the board as .valid-target glows. */
function applyPendingChoiceHighlights() {
  const pending = gameState?.pendingChoice;
  if (!pending || (pending.prompter ?? pending.playerId) !== viewingPlayer) return;
  for (const m of availableMoves) {
    if (m.moveId !== "resolvePendingChoice" || !m.params?.pickedCardId) continue;
    document.querySelectorAll(`[data-card-id="${CSS.escape(m.params.pickedCardId)}"]`)
      .forEach(el => el.classList.add("valid-target"));
  }
}

// Click on empty board space cancels targeting. Clicks that land on cards, the
// sidebar action list, or a modal are handled by their own listeners.
document.addEventListener("click", (e) => {
  if (!isChoosingTarget()) return;
  if (performance.now() - (interaction.enteredAt || 0) < 80) return;
  if (e.target.closest("[data-card-id], #actionsList, #actionBar, .chain-overlay, .target-banner")) return;
  cancelInteraction();
});

// Cards without a pointerdown handler (e.g. an opponent legend) still need to be
// clickable as targets; route those through onCardClick here.
document.addEventListener("click", (e) => {
  if (!isChoosingTarget() && !gameState?.pendingChoice) return;
  const el = e.target.closest("[data-card-id]");
  if (!el || el.hasAttribute("onpointerdown")) return;
  if (!el.classList.contains("valid-target")) return;
  onCardClick(el.dataset.cardId);
});

// ---- Rune quick-recycle (right-click) ----------------------------------------------

/** Float a "+1" energy marker up from `el` (appended to body so re-renders don't cut it). */
function showEnergyFloat(el, text = "+1") {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "energy-float";
  f.textContent = text;
  f.style.left = `${rect.left + rect.width / 2}px`;
  f.style.top = `${rect.top + rect.height / 3}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 700);
}

function findRuneMove(moveId, runeId) {
  return availableMoves.find(m =>
    m.moveId === moveId && (m.params?.runeId === runeId || m.params?.cardId === runeId)
  );
}

/**
 * Right-click a rune = recycle. A ready rune is auto-tapped first for +1 energy
 * (strictly better than recycling it ready), then recycled once the exhaust lands.
 */
function quickRecycleRune(runeId, el) {
  const exhaustMove = findRuneMove("exhaustRune", runeId);
  if (!exhaustMove) {
    const recycleMove = findRuneMove("recycleRune", runeId);
    if (recycleMove) {
      snapshotResources();
      executeMove(recycleMove.moveId, recycleMove.params, recycleMove.playerId);
    } else {
      showToast("Cannot recycle this rune");
    }
    return;
  }

  snapshotResources();
  executeMove(exhaustMove.moveId, exhaustMove.params, exhaustMove.playerId);
  showEnergyFloat(el);

  // Recycle on the frame that carries the exhaust result. Polling the local
  // state on a timer instead silently abandoned the recycle whenever the
  // round-trip outran the poll window, leaving the rune merely tapped.
  afterMoveSettled(() => {
    const recycleMove = findRuneMove("recycleRune", runeId);
    if (!recycleMove) {
      showToast("Cannot recycle this rune");
      return;
    }
    snapshotResources();
    executeMove(recycleMove.moveId, recycleMove.params, recycleMove.playerId);
  });
}

/** Enter selected mode for legend card — activate abilities */
function enterLegendSelected(cardId) {
  const abilityMoves = availableMoves.filter(m =>
    m.moveId === "activateAbility" && m.params?.cardId === cardId
  );
  const card = findCard(cardId);

  if (abilityMoves.length === 0) {
    // No activatable ability right now. A legend that HAS a printed activated
    // ability still answers the click: its ability shows greyed out with the
    // reason, instead of the card silently doing nothing.
    selectedCard = cardId;
    render();
    if (typeof activatedAbilitySegments === "function" && activatedAbilitySegments(card).length > 0) {
      interaction = { ...interaction, mode: "cardSelected", sourceCardId: cardId, sourceZone: "legendZone", action: "activateAbility", validTargets: [], matchingMoves: [] };
      showLegendAbilityActionBar(card?.name || cardId, [], card);
    }
    return;
  }

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
  showLegendAbilityActionBar(card?.name || cardId, abilityMoves, card);
}

/**
 * Why a printed activated ability is not usable right now — shown on the
 * greyed-out button so "nothing happens" never has to be guessed at.
 */
function abilityUnavailableReason(card) {
  if (!card) return "Not available right now";
  if (card.owner !== viewingPlayer) return "Not your card";
  if (card.meta?.exhausted && /\[\s*Exhaust\s*\]\s*[^:]*:/i.test(card.rulesText || "")) return "Already exhausted";
  const myTurn = gameState?.turn?.activePlayer === viewingPlayer;
  const chain = gameState?.interaction?.chain;
  const isReaction = /\[\s*Reaction\s*\]/i.test(card.rulesText || "");
  if (chain?.active && !isReaction) return "Only Reactions while the chain is open";
  if (!myTurn && !isReaction) return "Only on your turn";
  if (gameState?.turn?.phase && gameState.turn.phase !== "main" && !isReaction) return `Not during the ${gameState.turn.phase} phase`;
  return "Can't pay its cost right now";
}

/** Greyed-out buttons for a card's printed activated abilities that have no legal move now. */
function disabledAbilityButtonsHtml(card) {
  const segs = typeof activatedAbilitySegments === "function" ? activatedAbilitySegments(card) : [];
  if (segs.length === 0) return "";
  const why = abilityUnavailableReason(card);
  return segs.map(seg =>
    `<button class="action-bar-btn action-bar-btn--disabled" disabled data-ability-disabled
       style="background:#1e1b30;border-color:#4a4566;color:#6a6288;cursor:not-allowed;"
       title="${esc(why)}">${esc(seg)} <span class="ability-why">— ${esc(why)}</span></button>`
  ).join("");
}

/** Show action bar for legend ability activation */
function showLegendAbilityActionBar(cardName, abilityMoves, card) {
  const bar = document.getElementById("actionBar");
  const label = document.getElementById("actionBarLabel");
  const btns = document.getElementById("actionBarBtns");

  const displayName = cardName.replace(/^player-[12]-/, "");
  label.textContent = `Legend: ${displayName}`;

  let html = "";
  for (let i = 0; i < abilityMoves.length; i++) {
    const move = abilityMoves[i];
    const idx = move.params?.abilityIndex ?? i;
    if (abilityMoves.findIndex(m => (m.params?.abilityIndex ?? 0) === idx) !== i) continue; // one button per ability, not per target
    const segs = typeof activatedAbilitySegments === "function"
      ? activatedAbilitySegments(findCard(move.params?.cardId))
      : [];
    const seg = segs.length === 1 ? segs[0] : segs[idx];
    html += `<button class="action-bar-btn" style="background:#2a2050;border-color:#b080e0;color:#d0b0f0;" onclick='executeInteractionMove("activateAbility", ${idx})' title="${esc(seg || "")}">${esc(seg || `Activate Ability ${idx + 1}`)}</button>`;
  }
  if (abilityMoves.length === 0) html += disabledAbilityButtonsHtml(card);

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
    const needed = payableEnergyCost(card);
    if (card && needed > 0) {
      const pool = gameState?.runePools?.[viewingPlayer];
      const totalEnergy = pool?.energy ?? 0;
      if (totalEnergy < needed) {
        showToast(`Not enough energy (${totalEnergy}/${needed}) — exhaust runes first`);
      }
    }
    selectedCard = cardId;
    render();
    return;
  }

  const card = findCard(cardId);
  // Destinations the engine offers (base and/or controlled battlefields).
  const bfTargets = [...new Set(playMoves
    .map(m => String(m.params?.location ?? "base"))
    .filter(l => l !== "base")
    .map(l => l.replace(/^battlefield-/, "")))];
  interaction = {
    mode: "cardSelected",
    sourceCardId: cardId,
    sourceZone: "championZone",
    action: "playCard",
    validTargets: ["player-base", ...bfTargets],
    matchingMoves: playMoves,
  };
  selectedCard = cardId;

  render();
  applyValidTargetHighlights();
  showActionBar(card?.name || cardId, playMoves, `Champion: ${String(card?.name || cardId).replace(/^player-[12]-/, "")}`);
}

/** hideCard variants for a hand card (rule 723: Hide at a battlefield you control). */
function hideMovesFor(cardId) {
  return availableMoves.filter(m => m.moveId === "hideCard" && m.params?.cardId === cardId);
}

/** Selected mode for a facedown (Hidden) card at a battlefield: reveal it (rule 723). */
function enterFacedownSelected(cardId, zone) {
  const revealMoves = availableMoves.filter(m => m.moveId === "revealHidden" && m.params?.cardId === cardId);
  const card = findCard(cardId);
  interaction = {
    mode: "cardSelected",
    sourceCardId: cardId,
    sourceZone: zone,
    action: "revealHidden",
    validTargets: [],
    matchingMoves: revealMoves,
  };
  selectedCard = cardId;
  render();
  const bar = document.getElementById("actionBar");
  const label = document.getElementById("actionBarLabel");
  const btns = document.getElementById("actionBarBtns");
  label.textContent = `Hidden: ${String(card?.name || cardId).replace(/^player-[12]-/, "")}`;
  btns.innerHTML = revealMoves.length
    ? `<button class="action-bar-btn" style="background:#203a50;border-color:#60b0e0;color:#b0e0ff;" onclick='executeInteractionMove("revealHidden")'>Reveal (play for 0)</button>`
    : `<button class="action-bar-btn action-bar-btn--disabled" disabled title="A hidden card can be revealed from the turn after it was hidden, at Reaction speed" style="background:#1e1b30;border-color:#4a4566;color:#6a6288;cursor:not-allowed;">Reveal <span class="ability-why">— not yet (from your next turn)</span></button>`;
  bar.classList.remove("hidden");
}

/** Enter cardSelected mode for a hand card (playUnit/playSpell/playGear) */
function enterHandCardSelected(cardId) {
  const playMoves = availableMoves.filter(m =>
    (m.moveId === "playUnit" || m.moveId === "playSpell" || m.moveId === "playGear") &&
    m.params?.cardId === cardId
  );

  // rule 723 (Hidden): "Hide at <battlefield>" is a second way to use the card;
  // it rides along in targeting mode (banner buttons) and in the play-options modal.
  const hideMoves = hideMovesFor(cardId);

  // Targeted spells/gear: never auto-pick a target — enter targeting mode.
  if (playMoves.length > 0 && beginTargetingIfNeeded(playMoves, cardId, hideMoves)) {
    return;
  }

  // Single-click play: the engine already lists a legal play (cost is paid
  // from the pool the player tapped). Multiple non-target variants (Accelerate /
  // sacrifice / destination / hide) open the play-options modal instead of
  // silently picking one.
  if (playMoves.length > 0 || hideMoves.length > 0) {
    if (playMoves.length + hideMoves.length > 1 && typeof openPlayCostModal === "function") {
      openPlayCostModal(cardId);
    } else {
      const m = playMoves[0] ?? hideMoves[0];
      executeMove(m.moveId, m.params, m.playerId);
    }
    return;
  }

  if (playMoves.length === 0) {
    const card = findCard(cardId);


    // Fall back to the existing manual cost-payment mode (users who prefer clicking
    // runes manually still get the old flow).
    const needed = payableEnergyCost(card);
    if (card && needed > 0) {
      const pool = gameState?.runePools?.[viewingPlayer];
      const totalEnergy = pool?.energy ?? 0;
      if (totalEnergy < needed) {
        const runeExhaustMoves = availableMoves.filter(m =>
          m.moveId === "exhaustRune" || m.moveId === "recycleRune"
        );
        if (runeExhaustMoves.length > 0) {
          enterCostPaymentMode(cardId, card, totalEnergy);
          return;
        }
        showToast(`Not enough energy (${totalEnergy}/${needed}) — no runes available`);
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
    pendingCardCost: payableEnergyCost(card),
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
  const cost = payableEnergyCost(card) || interaction.pendingCardCost;
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

// Ability buttons rendered into the on-card action bar, in render order; the
// click handler needs the whole move list (targets are chosen after the click),
// which an inline onclick string cannot carry.
let abilityBarGroups = [];

/** activateAbility moves whose source is this card (rule 331). */
function abilityMovesFor(cardId) {
  return availableMoves.filter(m => m.moveId === "activateAbility" && m.params?.cardId === cardId);
}

/** rule 476.1: equipCard variants that attach this Equipment (one per unit). */
function equipMovesFor(cardId) {
  return availableMoves.filter(m => m.moveId === "equipCard" && m.params?.equipmentId === cardId);
}

/** True when the card offers anything on its own action bar (abilities / Equip). */
function hasCardBarActions(cardId) {
  if (abilityMovesFor(cardId).length > 0 || equipMovesFor(cardId).length > 0) return true;
  const card = findCard(cardId);
  return !!card && card.owner === viewingPlayer && typeof activatedAbilitySegments === "function" && activatedAbilitySegments(card).length > 0;
}

/**
 * Buttons for a card's own activated abilities, labelled with the printed
 * "COST: effect" text so [Empower] / [Exhaust] abilities are discoverable where
 * the card is, not only in the sidebar. Printed abilities with no legal move
 * right now render greyed out with the reason; an Equipment's [Equip] gets a
 * button that enters targeting over the units it may attach to.
 */
function abilityBarHtml(cardId) {
  abilityBarGroups = [];
  const moves = abilityMovesFor(cardId);
  const equips = equipMovesFor(cardId);
  const groups = {};
  for (const m of moves) {
    const key = `${m.params?.abilityIndex ?? ""}#${m.params?.sourceCardId ?? ""}`;
    (groups[key] ??= []).push(m);
  }
  let html = "";
  for (const variants of Object.values(groups)) {
    const p = variants[0].params ?? {};
    const src = findCard(p.sourceCardId && p.sourceCardId !== cardId ? p.sourceCardId : cardId);
    const segs = typeof activatedAbilitySegments === "function" ? activatedAbilitySegments(src) : [];
    const seg = segs.length === 1 ? segs[0] : segs[Number.isInteger(p.abilityIndex) ? p.abilityIndex : 0];
    const label = seg || "Activate Ability";
    html += `<button class="action-bar-btn" style="background:#2a2050;border-color:#b080e0;color:#d0b0f0;"
      data-ability-group="${abilityBarGroups.length}" title="${esc(label)}">${esc(label)}</button>`;
    abilityBarGroups.push({ moves: variants, sourceCardId: cardId });
  }
  if (equips.length > 0) {
    const cost = typeof equipCostText === "function" ? equipCostText(cardId) : "Equip";
    const label = `${cost || "Equip"} → choose a unit`;
    html += `<button class="action-bar-btn" style="background:#203a30;border-color:#60c090;color:#a0f0c0;"
      data-ability-group="${abilityBarGroups.length}" data-equip title="${esc(label)}">${esc(label)}</button>`;
    abilityBarGroups.push({ moves: equips, sourceCardId: cardId });
  }
  if (moves.length === 0) {
    const card = findCard(cardId);
    // An Equipment's only printed "COST:" segment is its [Equip]; don't echo it greyed out next to a live Equip button.
    if (!(equips.length > 0 && card && (card.cardType === "equipment" || card.cardType === "gear"))) {
      html += disabledAbilityButtonsHtml(card);
    }
  }
  return html;
}

/** Attach handlers for the ability buttons written by abilityBarHtml. */
function wireAbilityBarButtons(container) {
  if (!container) return;
  container.querySelectorAll("[data-ability-group]").forEach(el => {
    el.addEventListener("click", () => {
      const g = abilityBarGroups[Number(el.dataset.abilityGroup)];
      if (g && typeof beginTargetingOrPlay === "function") beginTargetingOrPlay(g.moves, g.sourceCardId);
    });
  });
}

/** Enter cardSelected mode for a base card (standardMove to battlefield) */
function enterBaseCardSelected(cardId) {
  // Find standardMove entries that include this card
  const moveMoves = availableMoves.filter(m =>
    m.moveId === "standardMove" &&
    (m.params?.unitIds?.includes(cardId) || m.params?.unitId === cardId)
  );

  if (moveMoves.length === 0 && !hasCardBarActions(cardId)) {
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
  const kind = card?.cardType === "unit" ? "Unit" : card?.cardType === "equipment" ? "Equipment" : card?.cardType === "gear" ? "Gear" : "Card";
  showActionBar(
    card?.name || cardId,
    moveMoves,
    moveMoves.length ? "Move to battlefield" : `${kind}: ${String(card?.name || cardId).replace(/^player-[12]-/, "")}`,
  );
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
  if (allMoves.length === 0 && !hasCardBarActions(cardId)) {
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

  if (interaction.action === "chooseTarget") {
    applyChooseTargetHighlights();
  } else if (interaction.action === "playCard") {
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
      if (moveId === "playFromChampionZone") {
        // One button per destination; ≥2 cost variants for a destination open the play-options modal.
        const byLoc = {};
        for (const m of movesOfType) (byLoc[String(m.params?.location ?? "base")] ??= []).push(m);
        for (const [loc, variants] of Object.entries(byLoc)) {
          const where = loc === "base" ? "Base" : getBattlefieldName(loc.replace(/^battlefield-/, ""));
          const onclick = variants.length > 1
            ? `openPlayCostModal(${JSON.stringify(interaction.sourceCardId)})`
            : `executeMove("playFromChampionZone", ${JSON.stringify(variants[0].params)}, ${JSON.stringify(variants[0].playerId)}); cancelInteraction();`;
          html += `<button class="action-bar-btn" data-champion-play="${esc(loc)}" onclick='${onclick}'>${esc(`Play Champion to ${where}`)}${variants.length > 1 ? "…" : ""}</button>`;
        }
        continue;
      }
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
  html += abilityBarHtml(interaction.sourceCardId);

  btns.innerHTML = html;
  wireAbilityBarButtons(btns);
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
  html += abilityBarHtml(interaction.sourceCardId);

  btns.innerHTML = html;
  wireAbilityBarButtons(btns);
  bar.classList.remove("hidden");
}

/** Owner ("player-1"/"player-2") encoded in a battlefield instance id, if any */
function battlefieldOwner(bfId, card) {
  const m = /^(player-[12])-/.exec(String(bfId));
  return m ? m[1] : (card?.owner ?? card?.controller ?? null);
}

/**
 * Get a display name for a battlefield. Both players can hold a battlefield
 * printed from the same card (e.g. two copies of Back-Alley Bar), and the
 * printed name alone then labels two distinct move destinations identically —
 * so an ambiguous name is qualified with whose side it is on.
 */
function getBattlefieldName(bfId) {
  if (!gameState?.zones) return bfId;
  const bfRowCards = gameState.zones["battlefieldRow"] || [];
  const self = bfRowCards.find(c => c.id === bfId);
  if (self) {
    const name = self.name || bfId;
    const ambiguous = bfRowCards.some(c => c.id !== bfId && (c.name || c.id) === name);
    if (!ambiguous) return name;
    const owner = battlefieldOwner(bfId, self);
    if (!owner) return name;
    return `${name} (${owner === viewingPlayer ? "yours" : "opponent's"})`;
  }
  return bfId.replace(/^ogn-|^sfd-|^unl-/g, "").replace(/-\d+$/, "");
}

/** Execute a move matching the current interaction by moveId (and optionally abilityIndex) */
function executeInteractionMove(moveId, abilityIndex) {
  const moves = interaction.matchingMoves.filter(m =>
    m.moveId === moveId && (abilityIndex == null || m.params?.abilityIndex === abilityIndex)
  );
  if (moves.length === 0) return;
  // Per-target variants → targeting mode instead of silently taking the first.
  if (beginTargetingIfNeeded(moves, interaction.sourceCardId)) return;
  const move = moves[0];
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
