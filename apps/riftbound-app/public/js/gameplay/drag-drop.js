// drag-drop.js — Drag and drop: pointer events, ghost cards, drop zones, card fly animation

/** Handle clicks on zone containers (battlefields for movement targets) */
function onZoneClick(targetId) {
  // rule 144.3 — a group of movers is assembled: this click picks their shared destination.
  if (typeof onGroupMoveZoneClick === "function" && onGroupMoveZoneClick(targetId)) return;
  if (interaction.mode !== "cardSelected") return;

  // Find source card element for animation
  const sourceEl = interaction.sourceCardId
    ? document.querySelector(`[data-card-id="${CSS.escape(interaction.sourceCardId)}"]`)
    : null;
  const destEl = document.querySelector(`[data-drop-zone="${CSS.escape(targetId)}"]`);

  // Find a matching move that targets this battlefield (a play names it as
  // `location: "battlefield-<id>"`).
  const toHere = preferSoloUnitMoves(interaction.matchingMoves.filter(m =>
    m.params?.destination === targetId ||
    (targetId === "player-base" && m.params?.destination === "base") ||
    m.params?.toBattlefield === targetId ||
    m.params?.battlefieldId === targetId ||
    m.params?.location === `battlefield-${targetId}`
  ), interaction.sourceCardId);
  if (toHere.length > 1 && interaction.action === "playCard" && typeof openPlayCostModal === "function") {
    // Same destination, different costs (Accelerate) → let the player choose.
    openPlayCostModal(interaction.sourceCardId);
    return;
  }
  const move = toHere[0];
  if (move) {
    animateCardFly(sourceEl, destEl, () => {
      executeMove(move.moveId, move.params, move.playerId);
    });
    cancelInteraction();
    return;
  }

  // For playCard to base, check if target is the base zone
  if (interaction.action === "playCard" && targetId === "player-base") {
    const moves = interaction.matchingMoves.filter(m => !m.params?.location || m.params.location === "base");
    if (beginTargetingIfNeeded(moves, interaction.sourceCardId)) return;
    if (moves.length > 1 && typeof openPlayCostModal === "function") {
      openPlayCostModal(interaction.sourceCardId);
      return;
    }
    const move = moves[0];
    if (move) {
      animateCardFly(sourceEl, destEl, () => {
        executeMove(move.moveId, move.params, move.playerId);
      });
      cancelInteraction();
    }
  }
}

/**
 * Movement moves enumerate every SUBSET of ready units (rule 144.4); a drag or
 * click acts on one card, so put the variants that move exactly that unit first.
 */
function preferSoloUnitMoves(moves, cardId) {
  const solo = (m) => Array.isArray(m.params?.unitIds) ? (m.params.unitIds.length === 1 && m.params.unitIds[0] === cardId) : true;
  return [...moves].sort((a, b) => Number(solo(b)) - Number(solo(a)));
}

/** Drop-zone id for a movement destination ("base" is the #player-base row). */
function moveDropZoneId(m) {
  const d = m.params?.destination || m.params?.toBattlefield || m.params?.battlefieldId;
  return d === "base" ? "player-base" : d;
}

/** Battlefield ids a hand card may be played / hidden to (rule 723, units to a held battlefield). */
function handCardBattlefieldTargets(moves) {
  const ids = [];
  for (const m of moves) {
    const loc = m.moveId === "hideCard" ? m.params?.battlefieldId : String(m.params?.location ?? "");
    const bf = loc && loc !== "base" ? String(loc).replace(/^battlefield-/, "") : null;
    if (bf && !ids.includes(bf)) ids.push(bf);
  }
  return ids;
}

// Pointer-Event Drag System

let dragState = null; // { cardId, zone, startX, startY, ghost, isDragging, sourceEl }
const DRAG_THRESHOLD = 6; // px before drag starts

/** Check if a card has any available moves from its zone */
function hasMovesForCard(cardId, zone) {
  if (!availableMoves) return false;
  const hasDirectMove = availableMoves.some(m => {
    if (m.params?.cardId === cardId) return true;
    if (m.params?.unitId === cardId && m.moveId !== "equipCard") return true;
    if (m.params?.runeId === cardId) return true;
    if (m.params?.gearId === cardId) return true;
    if (m.params?.equipmentId === cardId) return true;  // rule 476.1 [Equip]
    if (m.params?.unitIds?.includes(cardId)) return true;
    if (m.moveId === "playFromChampionZone" && zone === "championZone") return true;
    return false;
  });
  // DESIGN.md §Resource management: no auto-pay — a hand card is draggable
  // only when the engine already lists a legal play move for it.
  return hasDirectMove;
}

/** Get the moves and valid targets for a card being dragged from a zone */
function getDragContext(cardId, zone) {
  let action = null;
  let matchingMoves = [];
  let validTargets = [];

  if (zone === "hand") {
    matchingMoves = availableMoves.filter(m =>
      (m.moveId === "playUnit" || m.moveId === "playSpell" || m.moveId === "playGear" || m.moveId === "hideCard") &&
      m.params?.cardId === cardId
    );
    if (matchingMoves.length > 0) {
      action = "playCard";
      // Base, plus any battlefield the engine lets this card be played / hidden to.
      validTargets = matchingMoves.some(m => m.moveId !== "hideCard") ? ["player-base"] : [];
      validTargets.push(...handCardBattlefieldTargets(matchingMoves));
    }
  } else if (zone === "championZone") {
    matchingMoves = availableMoves.filter(m => m.moveId === "playFromChampionZone");
    if (matchingMoves.length > 0) {
      action = "playChampion";
      // Only destinations the engine actually offers light up.
      validTargets = ["player-base", ...handCardBattlefieldTargets(matchingMoves)];
    }
  } else if (zone === "base") {
    matchingMoves = availableMoves.filter(m =>
      m.moveId === "standardMove" &&
      (m.params?.unitIds?.includes(cardId) || m.params?.unitId === cardId)
    );
    if (matchingMoves.length > 0) {
      action = "moveUnit";
      for (const m of matchingMoves) {
        const bfId = m.params?.destination || m.params?.battlefieldId;
        if (bfId && !validTargets.includes(bfId)) validTargets.push(bfId);
      }
    } else {
      // rule 476.1: an Equipment on the board is dragged onto the unit it attaches to.
      const equips = availableMoves.filter(m => m.moveId === "equipCard" && m.params?.equipmentId === cardId);
      if (equips.length > 0) {
        matchingMoves = equips;
        action = "equip";
        validTargets = equips.map(m => m.params?.unitId).filter(Boolean);
      }
    }
  } else if (zone.startsWith("battlefield-")) {
    // Ganking moves (battlefield → battlefield) and rule 144.4.b standard
    // moves back to base (battlefield → base: drop on the base row).
    const unitMoves = availableMoves.filter(m =>
      (m.moveId === "gankingMove" || (m.moveId === "standardMove" && m.params?.destination === "base")) &&
      (m.params?.unitIds?.includes(cardId) || m.params?.unitId === cardId)
    );
    if (unitMoves.length > 0) {
      matchingMoves = preferSoloUnitMoves(unitMoves, cardId);
      action = "moveUnit";
      for (const m of matchingMoves) {
        const id = moveDropZoneId(m);
        if (id && !validTargets.includes(id)) validTargets.push(id);
      }
    }
  }

  return { action, matchingMoves, validTargets };
}

/** Find the drop zone element under the pointer */
function findDropZoneAt(x, y) {
  // Temporarily hide the ghost so elementFromPoint hits the real element
  if (dragState?.ghost) dragState.ghost.style.display = "none";
  const el = document.elementFromPoint(x, y);
  if (dragState?.ghost) dragState.ghost.style.display = "";

  if (!el) return null;
  // Walk up to find a [data-drop-zone] element
  const zone = el.closest("[data-drop-zone]");
  return zone ? zone.dataset.dropZone : null;
}

/**
 * Find a unit-drop target under the pointer, if any. Returns { unitId } when the
 * pointer is over a unit card that the viewing player controls (equipment target),
 * otherwise null.
 */
function findUnitDropAt(x, y) {
  if (dragState?.ghost) dragState.ghost.style.display = "none";
  const el = document.elementFromPoint(x, y);
  if (dragState?.ghost) dragState.ghost.style.display = "";
  if (!el) return null;
  const cardEl = el.closest("[data-card-id]");
  if (!cardEl) return null;
  const unitId = cardEl.dataset.cardId;
  if (!unitId || unitId === dragState?.cardId) return null;
  const unit = findCard(unitId);
  if (!unit || unit.controller !== viewingPlayer) return null;
  if (unit.cardType !== "unit" && unit.cardType !== "champion" && unit.cardType !== "legend") return null;
  return { unitId };
}

function onPointerDown(e, cardId) {
  // Only primary button (left click / touch)
  if (e.button !== 0) return;

  const card = findCard(cardId);
  if (!card) return;

  const zone = findCardZone(cardId);
  const sourceEl = e.currentTarget;

  dragState = {
    cardId,
    zone,
    startX: e.clientX,
    startY: e.clientY,
    ghost: null,
    isDragging: false,
    sourceEl,
    isOwned: card.owner === viewingPlayer,
    pointerId: e.pointerId,
  };

  // Capture pointer for smooth drag even outside the element
  sourceEl.setPointerCapture(e.pointerId);

  // Prevent text selection during drag
  e.preventDefault();
}

document.addEventListener("pointermove", (e) => {
  if (!dragState) return;

  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Haven't crossed the drag threshold yet
  if (!dragState.isDragging) {
    // A drag that already decided it cannot start stays parked so pointerup can
    // still treat the gesture as a click (see the noDrag branch below).
    if (dragState.noDrag) return;
    if (dist < DRAG_THRESHOLD) return;

    // Check if this card can be dragged
    if (!dragState.isOwned) {
      dragState = null;
      return;
    }

    const ctx = getDragContext(dragState.cardId, dragState.zone);
    if (!ctx.action) {
      // No moves available — never start the drag, but keep dragState alive so
      // pointerup falls through to onCardClick(). Nulling it here made pointerup
      // return at `if (!dragState)`, so the gesture ended with NO feedback at
      // all (no ghost, no toast, no cost-payment mode). DESIGN.md §Paying costs
      // requires the shortfall be surfaced, and the click path is what surfaces it.
      dragState.noDrag = true;
      // The gesture still travels across the board, and the hover panel re-raises
      // itself once the pointer moves >5px off the pointerdown latch — blanketing
      // the phase track / opposite battlefield. Gate it for the whole gesture; the
      // pointerup / pointercancel handlers release it.
      if (typeof setPreviewDragActive === "function") setPreviewDragActive(true);
      else hidePreview();
      return;
    }

    // Start the drag
    dragState.isDragging = true;
    dragState.action = ctx.action;
    dragState.matchingMoves = ctx.matchingMoves;
    dragState.validTargets = ctx.validTargets;

    // Mark source card as dragging
    dragState.sourceEl.classList.add("dragging");

    // Create ghost
    const ghost = dragState.sourceEl.cloneNode(true);
    ghost.className = "drag-ghost";
    ghost.style.width = dragState.sourceEl.offsetWidth + "px";
    ghost.style.height = dragState.sourceEl.offsetHeight + "px";
    document.body.appendChild(ghost);
    dragState.ghost = ghost;

    // Enter interaction mode for highlights
    interaction = {
      mode: "awaitTarget",
      sourceCardId: dragState.cardId,
      sourceZone: dragState.zone,
      // "equip" drags target unit CARDS, so borrow the card-glow highlighter.
      action: ctx.action === "equip" ? "chooseTarget" : ctx.action,
      validTargets: ctx.validTargets,
      matchingMoves: ctx.matchingMoves,
    };
    applyValidTargetHighlights();
    // A hand card / champion that can also go to a battlefield lights those up too.
    if (ctx.action === "playCard" || ctx.action === "playChampion") {
      for (const bfId of ctx.validTargets) {
        if (bfId === "player-base") continue;
        const bfEl = document.querySelector(`[data-bf-id="${CSS.escape(bfId)}"]`);
        if (bfEl) bfEl.classList.add("valid-target");
      }
    }
    // Gate the hover panel for the whole gesture: the surface under a drag IS the
    // drop zone, so a re-raised preview blankets the board you are aiming at.
    if (typeof setPreviewDragActive === "function") setPreviewDragActive(true);
    else hidePreview();
  }

  // Update ghost position (centered on cursor)
  if (dragState.ghost) {
    const gw = dragState.ghost.offsetWidth;
    const gh = dragState.ghost.offsetHeight;
    dragState.ghost.style.left = (e.clientX - gw / 2) + "px";
    dragState.ghost.style.top = (e.clientY - gh / 2) + "px";

    // Check if we're over a valid drop zone
    const dropZone = findDropZoneAt(e.clientX, e.clientY);
    const isValidZone = dropZone && (
      dragState.validTargets.includes(dropZone) ||
      (dragState.action === "playCard" && dropZone === "player-base") ||
      (dragState.action === "playChampion" && dropZone === "player-base")
    );

    // For equipment drag-onto-unit: allow dropping on a friendly unit card too
    // (from hand = play attached; from the board = [Equip], rule 476.1).
    let unitDrop = null;
    if (dragState.action === "equip") {
      const u = findUnitDropAt(e.clientX, e.clientY);
      unitDrop = u && dragState.validTargets.includes(u.unitId) ? u : null;
    } else if (!dropZone && dragState.zone === "hand") {
      const card = findCard(dragState.cardId);
      if (card && (card.cardType === "gear" || card.cardType === "equipment")) {
        unitDrop = findUnitDropAt(e.clientX, e.clientY);
      }
    }

    const isValid = isValidZone || !!unitDrop;

    // Update ghost state
    dragState.ghost.classList.toggle("over-valid", !!isValid);
    dragState.ghost.classList.toggle("over-invalid", !!dropZone && !isValidZone && !unitDrop);

    // Update drag-over highlights on zones and units
    document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
    if (isValidZone) {
      const zoneEl = document.querySelector(`[data-drop-zone="${CSS.escape(dropZone)}"]`);
      if (zoneEl) zoneEl.classList.add("drag-over");
    } else if (unitDrop) {
      const unitEl = document.querySelector(`[data-card-id="${CSS.escape(unitDrop.unitId)}"]`);
      if (unitEl) unitEl.classList.add("drag-over");
    }
  }
});

document.addEventListener("pointerup", (e) => {
  if (!dragState) return;

  const wasDragging = dragState.isDragging;
  const cardId = dragState.cardId;
  // Lift the drag gate, latched at the drop point so the panel does not pop up over
  // the board while the cursor rests on the card it was just dropped onto.
  if (typeof setPreviewDragActive === "function") setPreviewDragActive(false, e.clientX, e.clientY);
  // Set when the drop resolves to per-target variants; targeting mode is entered
  // after drag cleanup so its highlights survive clearValidTargetHighlights().
  let targetingMoves = null;
  let hideOnlyAfterDrop = null; // rule 723: hide needs an explicit confirm (see below)
  // A drop that hands off to a modal / targeting mode is NOT a dead end, so it must
  // not draw the "nothing happened" toast below.
  let deferredToUi = false;

  if (wasDragging) {
    // Check for drop on a valid zone first, then fall back to unit-drop for equipment.
    const dropZone = findDropZoneAt(e.clientX, e.clientY);
    const unitDrop = dragState.action === "equip"
      ? findUnitDropAt(e.clientX, e.clientY)
      : (dropZone ? null : findUnitDropAt(e.clientX, e.clientY));

    const isValid = dragState.action !== "equip" && dropZone && (
      dragState.validTargets.includes(dropZone) ||
      (dragState.action === "playCard" && dropZone === "player-base") ||
      (dragState.action === "playChampion" && dropZone === "player-base")
    );

    if (isValid) {
      // Find the matching move and execute it
      let move = null;
      if (dragState.action === "playChampion") {
        const location = dropZone === "player-base" ? "base" : `battlefield-${dropZone}`;
        const there = dragState.matchingMoves.filter(m => String(m.params?.location ?? "base") === location);
        if (there.length > 1 && typeof openPlayCostModal === "function") {
          openPlayCostModal(cardId);  // base vs paid variants for this destination
          deferredToUi = true;
          move = null;
        } else {
          move = there[0] ?? null;
        }
      } else if (dragState.action === "playCard" && dropZone === "player-base") {
        const baseMoves = dragState.matchingMoves.filter(m => m.moveId !== "hideCard" && (!m.params?.location || m.params.location === "base"));
        if (baseMoves.some(m => moveTargetId(m))) {
          // Per-target variants → targeting mode (entered after cleanup below).
          targetingMoves = baseMoves;
          move = null;
        } else if (baseMoves.length > 1 && typeof openPlayCostModal === "function") {
          // Multiple play variants (Accelerate / sacrifice) → open the choice
          // modal instead of silently picking the first.
          openPlayCostModal(cardId);
          deferredToUi = true;
          move = null;
        } else {
          move = baseMoves[0] ?? null;
        }
      } else if (dragState.action === "playCard") {
        // Hand card dropped on a battlefield: play it there (unit to a held
        // battlefield) or hide it there (rule 723). Several ways → ask.
        const there = dragState.matchingMoves.filter(m =>
          m.params?.location === `battlefield-${dropZone}` || (m.moveId === "hideCard" && m.params?.battlefieldId === dropZone));
        if (there.length > 1 && typeof openPlayCostModal === "function") {
          openPlayCostModal(cardId);
          deferredToUi = true;
          move = null;
        } else if (there.length === 1 && there[0].moveId === "hideCard") {
          // Dropping on a battlefield where the ONLY option is Hide: confirm it
          // explicitly ("Hide at …" button) rather than silently turning a drag
          // the player may have meant as "play here" into a face-down hide.
          hideOnlyAfterDrop = there;
          move = null;
        } else {
          move = there[0] ?? null;
        }
      } else {
        move = preferSoloUnitMoves(dragState.matchingMoves, cardId).find(m => moveDropZoneId(m) === dropZone);
      }

      if (move) {
        // Animate card flying to destination
        const destEl = document.querySelector(`[data-drop-zone="${CSS.escape(dropZone)}"]`);
        animateCardFly(dragState.sourceEl, destEl, () => {
          executeMove(move.moveId, move.params, move.playerId);
        });
      } else if (!deferredToUi && !targetingMoves && !hideOnlyAfterDrop && typeof showToast === "function") {
        // Dead-end drop: the zone was highlighted-legal for the action but no move
        // matched this destination. Never end a gesture in silence — DESIGN.md
        // §Paying costs wants the shortfall said out loud.
        showToast(dropZone === "player-base" ? "Can't play that there right now" : "No legal move to that zone");
      }
    } else if (unitDrop && dragState.action === "equip") {
      // rule 476.1: board Equipment dropped on a unit → [Equip] it there.
      const move = dragState.matchingMoves.find(m => m.params?.unitId === unitDrop.unitId);
      if (move) {
        executeMove(move.moveId, move.params, move.playerId);
      } else if (typeof showToast === "function") {
        showToast("Can't equip that unit");
      }
    } else if (unitDrop && dragState.zone === "hand") {
      // Equipment drag-onto-unit: play the gear with the unit as chosen target
      // if the engine lists that as a legal move. No auto-pay — the player must
      // have tapped runes first (DESIGN.md §Resource management).
      const card = findCard(cardId);
      if (card && (card.cardType === "gear" || card.cardType === "equipment")) {
        const gearMove = availableMoves.find(m =>
          m.moveId === "playGear" && m.params?.cardId === cardId &&
          (!m.params?.chosenTargetId || m.params.chosenTargetId === unitDrop.unitId));
        if (gearMove) {
          const destEl = document.querySelector(`[data-card-id="${CSS.escape(unitDrop.unitId)}"]`);
          const params = { ...gearMove.params, chosenTargetId: unitDrop.unitId };
          animateCardFly(dragState.sourceEl, destEl, () => {
            executeMove("playGear", params, gearMove.playerId);
          });
        } else if (typeof showToast === "function") {
          showToast("Tap runes to pay the cost first");
        }
      } else if (typeof showToast === "function") {
        showToast("Can't play that on a unit");
      }
    } else if (dropZone && typeof showToast === "function") {
      // DESIGN.md §Paying costs: never end a gesture in silence. The pointer was
      // released over a real zone this card has no legal move into (an unheld
      // battlefield, the opponent's base, …) — say so instead of doing nothing.
      showToast("No legal move to that zone");
    }

    // Clean up drag state
    if (dragState.ghost) {
      dragState.ghost.remove();
    }
    dragState.sourceEl.classList.remove("dragging");
    clearValidTargetHighlights();
    document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));

    // Reset interaction
    if (interaction.mode === "awaitTarget") {
      resetInteractionSilent();
    }
    if (targetingMoves) {
      beginTargetingOrPlay(targetingMoves, cardId);
    } else if (hideOnlyAfterDrop && typeof enterHideOnlySelected === "function") {
      enterHideOnlySelected(cardId, hideOnlyAfterDrop);
    }
  } else {
    // Was just a click (didn't cross drag threshold) — handle as card click
    onCardClick(cardId);
  }

  // Release pointer capture
  if (dragState?.sourceEl && dragState.pointerId != null) {
    try { dragState.sourceEl.releasePointerCapture(dragState.pointerId); } catch {}
  }

  dragState = null;
});

// A cancelled pointer (browser gesture, window focus loss) never reaches pointerup:
// release the preview gate so hovering keeps working.
document.addEventListener("pointercancel", (e) => {
  if (typeof setPreviewDragActive === "function") setPreviewDragActive(false, e.clientX, e.clientY);
});

// Prevent native drag on card images
document.addEventListener("dragstart", (e) => {
  if (e.target.closest(".card")) e.preventDefault();
});

/** Animate a card element flying from source to destination */
function animateCardFly(sourceEl, destEl, onDone) {
  // Zone-change animation disabled — invoke callback immediately.
  if (onDone) onDone();
  return;

  if (!sourceEl || !destEl) { if (onDone) onDone(); return; }

  const srcRect = sourceEl.getBoundingClientRect();
  const dstRect = destEl.getBoundingClientRect();

  // Create a clone to animate
  const flyer = sourceEl.cloneNode(true);
  flyer.className = "card-flying";
  flyer.style.left = dstRect.left + dstRect.width / 2 - srcRect.width / 2 + "px";
  flyer.style.top = dstRect.top + dstRect.height / 2 - srcRect.height / 2 + "px";
  flyer.style.width = srcRect.width + "px";
  flyer.style.height = srcRect.height + "px";

  // Compute distance for the animation start offset
  const dx = srcRect.left - (dstRect.left + dstRect.width / 2 - srcRect.width / 2);
  const dy = srcRect.top - (dstRect.top + dstRect.height / 2 - srcRect.height / 2);
  flyer.style.setProperty("--fly-dx", dx + "px");
  flyer.style.setProperty("--fly-dy", dy + "px");

  document.body.appendChild(flyer);

  // Remove after animation and trigger callback (guard against double-fire)
  let fired = false;
  function finish() {
    if (fired) return;
    fired = true;
    if (flyer.parentNode) flyer.remove();
    if (onDone) onDone();
  }
  flyer.addEventListener("animationend", finish);
  setTimeout(finish, 400);
}
