// render/card.js — Card element rendering + summoning-sick / just-played
// tracking + card-image load helpers. Classic script: everything is global.
// Split out of renderer.js; loaded before it (see gameplay.html).

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

// [rule:design-no-blank-cards] DESIGN.md: no blank card frames after t+1s and
// legend/champion always visible. While /card-image/ is still in flight (CDN
// redirect on a cold cache) the card must read as name/cost, not an empty
// frame — so the fallback face is shown until the <img> actually loads. Once
// an art id has loaded it is served from cache, so later re-renders skip the
// interim face to avoid a one-frame flicker.
const _loadedCardImgIds = new Set();
function _cardImgLoaded(img) {
  const id = img?.dataset?.imgId;
  if (id) _loadedCardImgIds.add(id);
  const fb = img?.nextElementSibling;
  if (fb && fb.classList?.contains("card-fallback")) fb.style.display = "";
}
/** Inline attrs for a card <img> + initial style for its .card-fallback sibling. */
function _cardImgLoadAttrs(imgId) {
  const pending = imgId && !_loadedCardImgIds.has(imgId);
  return {
    img: `data-img-id="${esc(imgId)}" onload="_cardImgLoaded(this)"`,
    fallbackStyle: pending ? ' style="display:flex"' : "",
  };
}

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

/**
 * rule 432.1.a — Shield N raises a DEFENDER's current Might and Assault N an
 * ATTACKER's while that unit is in combat, so the board card must show it.
 * The engine applies these only inside combat resolution (never on
 * meta.mightModifier), so the value is derived here from meta.combatRole.
 */
function combatRoleMightBonus(card) {
  const role = card?.meta?.combatRole;
  if (role !== "attacker" && role !== "defender") return 0;
  if (typeof getCardKeywords !== "function") return 0;
  const wanted = role === "attacker" ? "assault" : "shield";
  const kw = getCardKeywords(card).find((k) => k.name.toLowerCase() === wanted);
  return kw ? (kw.value || 1) : 0;
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
                title="Uncover this card (local view only)"
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
  // rule-827 (ven-021-166): surface Empowered state so `[Empowered]>` bonuses are visible
  if (card.meta?.empowered) classes.push("empowered");
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

  // Legend cards with moves are interactive; an own legend with a printed
  // activated ability still takes the click when it has no move, so its action
  // bar can say WHY (exhausted / can't pay / not your turn) instead of nothing.
  const hasPrintedAbility = isLegendZone && isOwned && typeof activatedAbilitySegments === "function" && activatedAbilitySegments(card).length > 0;
  const pointerAttr = (isLegendZone && !isPlayable && !hasPrintedAbility)
    ? ""
    : `onpointerdown="onPointerDown(event, '${esc(card.id)}')"`;

  // W13: per-card cover toggle on viewer-owned hand cards. Click replaces
  // the face with a card-back; state persists in localStorage.
  // rule 811.1: "Hide" is the Discretionary Action gated on the [Hidden]
  // keyword (engine move `hideCard`), so this purely cosmetic local toggle
  // must NOT be labelled "Hide" — it would read as that rules action on
  // every hand card, including cards without [Hidden].
  let hideBtn = "";
  if (zone === "hand" && isOwned && card.id) {
    hideBtn = `<button
      class="card-hide-btn"
      type="button"
      title="Cover this card in your own view only (local, persists via localStorage) — not the [Hidden] Hide action"
      onpointerdown="event.stopPropagation();"
      onclick="event.stopPropagation(); toggleHideHandCard('${esc(card.id)}');">Cover</button>`;
  }

  // rule-827 (ven-021-166): effective Might = base + mightModifier + staticMightBonus + buff.
  // (combat-role keyword bonus added below via combatRoleMightBonus)
  // Render a badge only when the effective value differs from the printed base so
  // Empower / modify-might effects are visible on the board card.
  // rule-buff-might (unl-162-219): Buff is a separate +1 term (engine: `meta.buffed ? 1 : 0`),
  // not folded into mightModifier, so it must be added here to show on the board.
  // rule 733 (ogn-078-298): buffs STACK — the engine keeps the extra ones in
  // `meta.extraBuffs` (first buff sets `buffed`, each further buff increments
  // `extraBuffs`), so effective Might is `buffed + extraBuffs`, not just +1.
  // rule-sfd-068-221: attached Equipment bonus is a separate term (server-computed
  // meta.equipmentMightBonus from equippedWith) and must be included too.
  // rule 432.1.a: while a unit is in combat in the matching role its CURRENT
  // Might already includes Shield (defender) / Assault (attacker); the engine
  // only applies those inside combat resolution, so fold them in for display.
  const baseMight = card.might;
  const effMight = baseMight != null
    ? Math.max(0, baseMight + (card.meta?.mightModifier ?? 0) + (card.meta?.staticMightBonus ?? 0) + (card.meta?.buffed ? 1 : 0) + (card.meta?.extraBuffs ?? 0) + (card.meta?.equipmentMightBonus ?? 0) + combatRoleMightBonus(card))
    : null;
  const mightBadge = (effMight != null && effMight !== baseMight)
    ? `<div class="card-might" title="Effective Might">${effMight}</div>`
    : "";

  const imgLoad = _cardImgLoadAttrs(imgId); // [rule:design-no-blank-cards]

  return `
    <div class="${classes.join(" ")}"
         data-card-id="${esc(card.id)}"
         data-def-id="${esc(defId)}"
         data-zone="${esc(zone)}"
         ${pointerAttr}
         onmouseenter="showPreview(event, this)"
         onmouseleave="hidePreview()"
         ondblclick="openZoom('${esc(card.id)}')"
         style="${isLegendZone && !isPlayable && !hasPrintedAbility ? "cursor:default;" : ""}">
      <img class="card-img" src="/card-image/${esc(imgId)}" alt="${esc(card.name)}" ${imgLoad.img}
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div class="card-fallback"${imgLoad.fallbackStyle}>
        <div class="fallback-cost">${card.energyCost != null ? esc(card.energyCost) : "&mdash;"}</div>
        <div class="fallback-name">${esc(card.name || "")}</div>
        <div class="fallback-type">${esc(card.cardType || "")}</div>
      </div>
      ${card.meta?.damage > 0 ? `<div class="card-damage">${card.meta.damage}</div>` : ""}
      ${mightBadge}
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
