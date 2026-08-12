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

/**
 * True if the card should display the summoning-sick overlay (entered this turn
 * AND still exhausted). rule 143.4 — a unit enters exhausted unless something
 * (paid Accelerate, an enters-ready replacement or static) says otherwise; a
 * ready unit can act the turn it arrives, so it must not get the "can't act"
 * overlay just because it entered this turn.
 */
function isCardSummoningSick(card, zone) {
  if (!card?.id) return false;
  if (!isBoardZone(zone)) return false;
  // Runes don't get sick — only units played to base/battlefields
  if (card.cardType === "rune") return false;
  if (!card.meta?.exhausted) return false;
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
    return `<div class="card facedown"><div class="card-back card-back-art card-back-art--main"></div></div>`;
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
  // rule 357.1.a / 429.3 — a card the engine says is ONE Reaction [Add] away
  // (tap a rune, recycle one for its Domain, crack a Gold) is not playable YET
  // but must not read as inert: mark it so it is visibly one step short, and
  // clicking it opens the Pay step (see interactions.js reachablePlayFor).
  const oneAddAway =
    isOwned &&
    !isPlayable &&
    typeof reachablePlayFor === "function" &&
    !!reachablePlayFor(card.id);
  if (oneAddAway) classes.push("needs-add");
  if (isLegendZone && isPlayable) classes.push("legend-playable");

  // Legend cards with moves are interactive; an own legend with a printed
  // activated ability still takes the click when it has no move, so its action
  // bar can say WHY (exhausted / can't pay / not your turn) instead of nothing.
  // A refusal carries its cause: when the engine withholds this card for a
  // STATE reason (timing, a rider, a forbidding static) it ships the reason on
  // the snapshot, so an un-playable card explains itself on hover instead of
  // reading as inert (see interactions.js engineBlockReason).
  const blockedWhy =
    isOwned && !isPlayable && typeof engineBlockReason === "function" ? engineBlockReason(card.id) : "";
  // The STATE reason wins over the pay line: when the engine refuses the card
  // for its timing or a rider, tapping a rune will not help, and "needs [1] —
  // tap a rune first" would send the player down the wrong path. Same order the
  // click handler uses (interactions.js: state reason before the Pay step).
  const addHint =
    blockedWhy || (oneAddAway && typeof reachablePlayHint === "function" ? reachablePlayHint(card.id) : "");
  if (blockedWhy) classes.push("blocked-play");
  const hasPrintedAbility = isLegendZone && isOwned && typeof activatedAbilitySegments === "function" && activatedAbilitySegments(card).length > 0;
  const pointerAttr = (isLegendZone && !isPlayable && !hasPrintedAbility)
    ? ""
    : `onpointerdown="onPointerDown(event, '${esc(card.id)}')"`;

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

  // rule 1004 (sfd-008-221): an attached Equipment and its holder are one
  // physical unit on the table. The snapshot already carries the link
  // (`meta.attachedTo` on the gear, `meta.equippedWith` on the unit) but the
  // board renders both as loose cards, so name the partner on each side.
  const attachedToId = card.meta?.attachedTo || "";
  const equippedWith = Array.isArray(card.meta?.equippedWith) ? card.meta.equippedWith : [];
  const shortName = (id) => {
    const found = typeof findCard === "function" ? findCard(id) : null;
    return String(found?.name || id).replace(/^player-[12]-/, "");
  };
  let attachBadge = "";
  if (attachedToId) {
    classes.push("card--attached");
    const holder = shortName(attachedToId);
    attachBadge = `<div class="card-attach" title="Attached to ${esc(holder)}">&#128279; ${esc(holder)}</div>`;
  } else if (equippedWith.length > 0) {
    classes.push("card--equipped");
    const names = equippedWith.map(shortName).join(", ");
    attachBadge = `<div class="card-attach card-attach--holder" title="Equipped with ${esc(names)}">&#128279; ${esc(names)}</div>`;
  }

  // rule 762: a card that named another card (Fallen Feline) keeps that name for
  // as long as it is on the board, and the name drives its ongoing restriction —
  // so it must be readable on the card, not only in the log.
  const namedCard = typeof card.meta?.namedCard === "string" ? card.meta.namedCard : "";
  const namedBadge = namedCard
    ? `<div class="card-named" title="Named: ${esc(namedCard)}">&#128172; ${esc(namedCard)}</div>`
    : "";

  const imgLoad = _cardImgLoadAttrs(imgId); // [rule:design-no-blank-cards]

  return `
    <div class="${classes.join(" ")}"
         ${addHint ? `title="${esc(addHint)}"` : ""}
         ${attachedToId ? `data-attached-to="${esc(attachedToId)}"` : ""}
         ${equippedWith.length ? `data-equipped-with="${esc(equippedWith.join(" "))}"` : ""}
         data-card-id="${esc(card.id)}"
         data-def-id="${esc(defId)}"
         data-zone="${esc(zone)}"
         ${pointerAttr}
         ondblclick="openZoom('${esc(card.id)}')"
         style="${isLegendZone && !isPlayable && !hasPrintedAbility ? "cursor:default;" : ""}">
      <img class="card-img" src="/card-image/${esc(imgId)}" alt="${esc(card.name)}" ${imgLoad.img}
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div class="card-fallback"${imgLoad.fallbackStyle}>
        <div class="fallback-cost">${(() => {
          // rule 402.4 (sfd-103-221): show the cost the engine will charge —
          // the server prices hand cards with static reductions applied.
          const cost = typeof card.effectiveEnergyCost === "number" ? card.effectiveEnergyCost : card.energyCost;
          return cost != null ? esc(cost) : "&mdash;";
        })()}</div>
        <div class="fallback-name">${esc(card.name || "")}</div>
        <div class="fallback-type">${esc(card.cardType || "")}</div>
      </div>
      ${card.meta?.damage > 0 ? `<div class="card-damage">${card.meta.damage}</div>` : ""}
      ${mightBadge}
      ${effMight != null && !mightBadge ? `<div class="card-might-chip" aria-hidden="true">${effMight}</div>` : ""}
      ${attachBadge}
      ${namedBadge}
      <div class="card-name">${esc(card.name || "")}</div>
    </div>
  `;
}

/**
 * rule 723 (Hidden) — a facedown card at a battlefield renders as a card BACK
 * for every seat (tilted, HIDDEN badge, owner-coloured edge). What the hover
 * preview may show is decided by the SERVER: the per-seat snapshot carries the
 * real definitionId only for the controller (or a seat holding a rule 127 look
 * grant) and an opaque `hidden-…` stand-in otherwise, so `data-def-id` is
 * simply whatever this seat was sent — the client never knows more.
 */
function renderFacedownCard(card, zone) {
  const mine = card.owner === viewingPlayer;
  const known = !!card.definitionId;
  const classes = ["card", "facedown", "card--bf-hidden", mine ? "card--bf-hidden-mine" : "card--bf-hidden-theirs"];
  if (selectedCard === card.id) classes.push("selected");
  if (mine && hasMovesForCard(card.id, zone)) classes.push("playable");
  const who = mine ? "you" : pName(card.controller || card.owner);
  const title = known
    ? (mine ? "Your hidden card — hover to peek, click for actions" : `Hidden card controlled by ${who} — revealed to you`)
    : `Facedown card — controlled by ${who}`;
  return `
    <div class="${classes.join(" ")}"
         data-card-id="${esc(card.id)}"
         ${known ? `data-def-id="${esc(card.definitionId)}"` : ""}
         data-zone="${esc(zone)}"
         data-owner="${esc(card.owner || "")}"
         data-facedown="1"
         title="${esc(title)}"
         ${mine ? `onpointerdown="onPointerDown(event, '${esc(card.id)}')"` : ""}>
      <div class="card-back card-back-art card-back-art--main"></div>
      <div class="card-hidden-badge">HIDDEN</div>
      ${known ? `<div class="card-hidden-peek" aria-hidden="true">&#128065;</div>` : ""}
    </div>
  `;
}

/**
 * rule 434.4 — an attached Equipment is wherever its holder is: group each
 * unit with the gear attached to it (same zone list) so the pair renders as one
 * stack. Gear whose holder is not in this list stays a loose card.
 */
function groupAttachments(cards) {
  const byId = new Map(cards.map(c => [c.id, c]));
  const gearOf = new Map();
  const nested = new Set();
  for (const c of cards) {
    const host = c.meta?.attachedTo;
    if (host && byId.has(host) && host !== c.id) {
      if (!gearOf.has(host)) gearOf.set(host, []);
      gearOf.get(host).push(c);
      nested.add(c.id);
    }
  }
  return cards.filter(c => !nested.has(c.id)).map(c => ({ host: c, gear: gearOf.get(c.id) || [] }));
}

/** One board slot: the unit, with any attached gear tucked under it (peeking edge stays hoverable/clickable). */
function renderUnitSlot(entry, zone) {
  const { host, gear } = entry;
  if (!gear.length) return renderCardElement(host, false, zone);
  return `<div class="unit-stack" data-stack-host="${esc(host.id)}" style="--gear-n:${gear.length}">${
    gear.map((g, i) => `<div class="unit-stack-gear" style="--i:${i}" title="${esc(`${g.name || "Gear"} — attached to ${host.name || ""}`)}">${renderCardElement(g, false, zone)}</div>`).join("")
  }${renderCardElement(host, false, zone)}</div>`;
}

/** A row of board cards (base / one side of a battlefield) with attachments grouped. */
function renderUnitRow(cards, zone) {
  return groupAttachments(cards).map(e => renderUnitSlot(e, zone)).join("");
}

/**
 * A face-down pile: the MAIN deck shows the main card back, the RUNE deck the
 * rune back (CSS-drawn, see .card-back-art), each with a count badge; an empty
 * pile is a dashed placeholder. `label` picks the back ("Rune" → rune back).
 */
function renderDeckStack(zoneCards, label, options = {}) {
  const count = zoneCards?.length ?? 0;
  // W12: right-clicking the viewing player's main deck opens the
  // enriched peek dialog. We also add a title hint so users discover
  // the interaction. Opponent decks and rune decks stay inert.
  const peekable = options.peekable === true;
  const kind = options.kind || (/rune/i.test(label) ? "rune" : "main");
  const attrs = peekable
    ? ' oncontextmenu="event.preventDefault(); if (typeof openPeekDialog === \'function\') openPeekDialog(1); return false;" title="Right-click to peek at the top card"'
    : ` title="${esc(label)} deck: ${count}"`;
  const cls = ["deck-stack", `deck-stack--${kind}`, count > 0 ? "deck-stack--has-cards" : "deck-stack--empty", peekable ? "deck-stack--peekable" : ""].filter(Boolean).join(" ");
  return `
    <div class="${cls}" data-pile="${esc(kind)}" data-count="${count}"${attrs}>
      ${count > 0 ? `<div class="card-back-art card-back-art--${esc(kind)}" aria-hidden="true"></div>` : ""}
      <div class="deck-count">${count}</div>
      <div class="deck-label">${esc(label)}</div>
    </div>
  `;
}

/**
 * Trash pile for one player: shows the FACE of the most recent (top) card.
 * rule 108.2.d / 355.10.a.1: cards in a Trash are Public Information, so both
 * players' trashes must always show a count and be openable for inspection.
 */
function renderTrashStack(zoneCards, pid, label = "Trash") {
  const count = zoneCards?.length ?? 0;
  const top = count > 0 ? zoneCards[count - 1] : null;
  const topImgId = top ? String(top.definitionId || top.id || "").replace(/^player-[12]-/, "") : "";
  // Hovering the pile previews its top card (overlays.js delegated preview).
  const attrs = count > 0
    ? ` data-card-id="${esc(top?.id ?? "")}" data-def-id="${esc(top?.definitionId ?? "")}" data-zone="trash" onclick="if (typeof openZoneViewer === 'function') openZoneViewer('trash', '${esc(String(pid))}')" title="${esc(`Top: ${top?.name ?? ""} — click to view all ${count}`)}"`
    : ' title="Trash (empty)"';
  const cls = count > 0 ? "deck-stack deck-stack--trash deck-stack--has-cards deck-stack--viewable" : "deck-stack deck-stack--trash deck-stack--empty";
  return `
    <div class="${cls}" data-pile="trash" data-count="${count}"${attrs}>
      ${top ? `<img class="deck-stack-top" src="/card-image/${esc(topImgId)}" alt="${esc(top.name || "")}" onerror="this.style.display='none'"><div class="deck-stack-top-name">${esc(top.name || "")}</div>` : ""}
      <div class="deck-count">${count}</div>
      <div class="deck-label">${esc(label)}</div>
    </div>
  `;
}

// Zones whose membership follows control, not ownership: a card whose control
// changed (take-control effects keep `owner`, only `controller` moves) sits in
// its controller's base, so it must render on that player's row.
const CONTROLLER_SCOPED_ZONES = new Set(["base"]);

/** Filter zone cards by owner (by controller for control-scoped zones) */
function zoneForPlayer(zoneName, pid) {
  const zones = gameState.zones || {};
  const all = zones[zoneName] || [];
  if (CONTROLLER_SCOPED_ZONES.has(zoneName)) {
    // snapshot emits controller: "" when the instance has no explicit
    // controller — fall back to owner so the card still renders.
    return all.filter(c => (c.controller || c.owner) === pid);
  }
  return all.filter(c => c.owner === pid);
}
