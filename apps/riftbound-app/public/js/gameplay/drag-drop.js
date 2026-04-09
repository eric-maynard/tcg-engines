// drag-drop.js — Drag and drop: pointer events, ghost cards, drop zones, card fly animation

/** Handle clicks on zone containers (battlefields for movement targets) */
function onZoneClick(targetId) {
  if (interaction.mode !== "cardSelected") return;

  // Find source card element for animation
  const sourceEl = interaction.sourceCardId
    ? document.querySelector(`[data-card-id="${CSS.escape(interaction.sourceCardId)}"]`)
    : null;
  const destEl = document.querySelector(`[data-drop-zone="${CSS.escape(targetId)}"]`);

  // Find a matching move that targets this battlefield
  const move = interaction.matchingMoves.find(m =>
    m.params?.destination === targetId ||
    m.params?.toBattlefield === targetId ||
    m.params?.battlefieldId === targetId
  );
  if (move) {
    animateCardFly(sourceEl, destEl, () => {
      executeMove(move.moveId, move.params, move.playerId);
    });
    cancelInteraction();
    return;
  }

  // For playCard to base, check if target is the base zone
  if (interaction.action === "playCard" && targetId === "player-base") {
    const move = interaction.matchingMoves[0];
    if (move) {
      animateCardFly(sourceEl, destEl, () => {
        executeMove(move.moveId, move.params, move.playerId);
      });
      cancelInteraction();
    }
  }
}

// Pointer-Event Drag System

let dragState = null; // { cardId, zone, startX, startY, ghost, isDragging, sourceEl }
const DRAG_THRESHOLD = 6; // px before drag starts

/** Check if a card has any available moves from its zone */
function hasMovesForCard(cardId, zone) {
  if (!availableMoves) return false;
  return availableMoves.some(m => {
    if (m.params?.cardId === cardId) return true;
    if (m.params?.unitId === cardId) return true;
    if (m.params?.runeId === cardId) return true;
    if (m.params?.gearId === cardId) return true;
    if (m.params?.unitIds?.includes(cardId)) return true;
    return false;
  });
}

/** Get the moves and valid targets for a card being dragged from a zone */
function getDragContext(cardId, zone) {
  let action = null;
  let matchingMoves = [];
  let validTargets = [];

  if (zone === "hand") {
    matchingMoves = availableMoves.filter(m =>
      (m.moveId === "playUnit" || m.moveId === "playSpell" || m.moveId === "playGear") &&
      m.params?.cardId === cardId
    );
    if (matchingMoves.length > 0) {
      action = "playCard";
      validTargets = ["player-base"];
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
    }
  } else if (zone.startsWith("battlefield-")) {
    // Ganking moves
    const gankMoves = availableMoves.filter(m =>
      m.moveId === "gankingMove" &&
      (m.params?.unitIds?.includes(cardId) || m.params?.unitId === cardId)
    );
    if (gankMoves.length > 0) {
      matchingMoves = gankMoves;
      action = "moveUnit";
      for (const m of gankMoves) {
        const bfId = m.params?.toBattlefield || m.params?.battlefieldId;
        if (bfId && !validTargets.includes(bfId)) validTargets.push(bfId);
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
    if (dist < DRAG_THRESHOLD) return;

    // Check if this card can be dragged
    if (!dragState.isOwned) {
      dragState = null;
      return;
    }

    const ctx = getDragContext(dragState.cardId, dragState.zone);
    if (!ctx.action) {
      // No moves available — abort drag, will fall through to click
      dragState = null;
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
      action: ctx.action,
      validTargets: ctx.validTargets,
      matchingMoves: ctx.matchingMoves,
    };
    applyValidTargetHighlights();
    hidePreview();
  }

  // Update ghost position (centered on cursor)
  if (dragState.ghost) {
    const gw = dragState.ghost.offsetWidth;
    const gh = dragState.ghost.offsetHeight;
    dragState.ghost.style.left = (e.clientX - gw / 2) + "px";
    dragState.ghost.style.top = (e.clientY - gh / 2) + "px";

    // Check if we're over a valid drop zone
    const dropZone = findDropZoneAt(e.clientX, e.clientY);
    const isValid = dropZone && (
      dragState.validTargets.includes(dropZone) ||
      (dragState.action === "playCard" && dropZone === "player-base")
    );

    // Update ghost state
    dragState.ghost.classList.toggle("over-valid", !!isValid);
    dragState.ghost.classList.toggle("over-invalid", dropZone && !isValid);

    // Update drag-over highlights on zones
    document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
    if (isValid) {
      const zoneEl = document.querySelector(`[data-drop-zone="${CSS.escape(dropZone)}"]`);
      if (zoneEl) zoneEl.classList.add("drag-over");
    }
  }
});

document.addEventListener("pointerup", (e) => {
  if (!dragState) return;

  const wasDragging = dragState.isDragging;
  const cardId = dragState.cardId;

  if (wasDragging) {
    // Check for drop on a valid zone
    const dropZone = findDropZoneAt(e.clientX, e.clientY);
    const isValid = dropZone && (
      dragState.validTargets.includes(dropZone) ||
      (dragState.action === "playCard" && dropZone === "player-base")
    );

    if (isValid) {
      // Find the matching move and execute it
      let move = null;
      if (dragState.action === "playCard" && dropZone === "player-base") {
        move = dragState.matchingMoves[0];
      } else {
        move = dragState.matchingMoves.find(m =>
          m.params?.destination === dropZone ||
          m.params?.toBattlefield === dropZone ||
          m.params?.battlefieldId === dropZone
        );
      }

      if (move) {
        // Animate card flying to destination
        const destEl = document.querySelector(`[data-drop-zone="${CSS.escape(dropZone)}"]`);
        animateCardFly(dragState.sourceEl, destEl, () => {
          executeMove(move.moveId, move.params, move.playerId);
        });
      }
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

// Prevent native drag on card images
document.addEventListener("dragstart", (e) => {
  if (e.target.closest(".card")) e.preventDefault();
});

/** Animate a card element flying from source to destination */
function animateCardFly(sourceEl, destEl, onDone) {
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
