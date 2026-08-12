// render/board.js — Zones (hand/base/legend/champion/decks) and battlefields.
// Classic script: everything is global. Split out of renderer.js.
// Rune stack rendering (renderRuneStacks/renderRuneCard) lives in runes.js.

function renderZones() {
  const opponent = viewingPlayer === P1 ? P2 : P1;

  // Player hand (face up, draggable)
  const playerHand = zoneForPlayer("hand", viewingPlayer);
  document.getElementById("player-hand").innerHTML =
    playerHand.map(c => renderCardElement(c, false, "hand")).join("") ||
    "";

  // Opponent hand — face up in goldfish mode so player can control both sides;
  // a Claude seat is a real opponent (the server redacts its hand too).
  const opponentHand = zoneForPlayer("hand", opponent);
  const showOppHand = isSandboxGame && !(typeof isVsAiGame === "function" && isVsAiGame());
  document.getElementById("opponent-hand").innerHTML =
    opponentHand.map(c => showOppHand ? renderCardElement(c, false, "hand") : renderCardElement({}, true)).join("") ||
    "";

  // Player base (drop target for hand cards, draggable for movement)
  const playerBase = zoneForPlayer("base", viewingPlayer);
  const baseEl = document.getElementById("player-base");
  baseEl.innerHTML = renderUnitRow(playerBase, "base");

  // W10a: attach the per-zone token panel to the viewing player's base.
  // Base gets the full token set including Gold (the economy token).
  if (typeof renderTokenPanel === "function") {
    renderTokenPanel(baseEl, "base", "base");
  }

  // Opponent base
  const opponentBase = zoneForPlayer("base", opponent);
  document.getElementById("opponent-base").innerHTML = renderUnitRow(opponentBase, "base");

  // Rune pools — the player's pile fans out to whatever height its row really
  // has (never clipped, never over the Legend/Champion); the opponent's is compact.
  // [rule:ui-rune-row-stable] patched in place (keyed by card id), not rebuilt,
  // so the rune under the cursor keeps its node, :hover and tap animation.
  const myPool = document.getElementById("player-runePool");
  patchInnerHTML(myPool, renderRuneStacks(zoneForPlayer("runePool", viewingPlayer), {
    maxHeight: typeof runePoolRoom === "function" ? runePoolRoom(myPool) : undefined,
  }));
  patchInnerHTML(document.getElementById("opponent-runePool"), renderRuneStacks(zoneForPlayer("runePool", opponent), { compact: true }));

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
  // rule 108.4.d / 128.3: a deck's ORDER is Secret to every player, its owner
  // included, so the server ships this seat its own deck as faceless entries
  // (no definitionId) in every real mode. The peek is a SANDBOX tool: offer it
  // only where the deck actually came through readable, or right-click opens
  // an empty dialog.
  const myMainDeck = zoneForPlayer("mainDeck", viewingPlayer);
  const deckReadable = myMainDeck.some(c => c && c.definitionId);
  // rule 108.2.d: the trash is Public Information — render it beside the decks
  // for both players so discarded cards never vanish from the board.
  document.getElementById("player-decks").innerHTML =
    renderDeckStack(myMainDeck, "Main", { peekable: deckReadable }) +
    renderDeckStack(zoneForPlayer("runeDeck", viewingPlayer), "Rune") +
    renderTrashStack(zoneForPlayer("trash", viewingPlayer), viewingPlayer);
  document.getElementById("opponent-decks").innerHTML =
    renderDeckStack(zoneForPlayer("mainDeck", opponent), "Main") +
    renderDeckStack(zoneForPlayer("runeDeck", opponent), "Rune") +
    renderTrashStack(zoneForPlayer("trash", opponent), opponent);
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
    // rule 425.1 — which half of a battlefield an object sits in is a question
    // about its CONTROLLER, not its owner: a unit taken with Hostile Takeover
    // (sfd-202-221) keeps its owner but fights for its new controller, so
    // splitting by owner left it rendered among the enemy's units. Fall back to
    // owner only for rows a snapshot shipped without a controller.
    const sideOf = c => c.controller || c.owner;
    const opponentUnits = unitsAtBf.filter(c => sideOf(c) === opponent);
    const playerUnits = unitsAtBf.filter(c => sideOf(c) === viewingPlayer);

    // rule-id: ogn-197-298 — Rule 723 (Hidden): the engine parks hidden cards
    // in a sibling `facedown-${bfId}` zone, not `battlefield-${bfId}`, so they
    // must be read separately or they never appear on the board. Every seat
    // sees a card BACK; the per-seat snapshot decides whose hover may peek.
    const fdZoneId = `facedown-${bfId}`;
    const facedownAtBf = zones[fdZoneId] || [];
    const opponentFacedownHtml = facedownAtBf.filter(c => sideOf(c) === opponent).map(c => `<div class="bf-facedown">${renderFacedownCard(c, fdZoneId)}</div>`).join("");
    const playerFacedownHtml = facedownAtBf.filter(c => sideOf(c) === viewingPlayer).map(c => `<div class="bf-facedown">${renderFacedownCard(c, fdZoneId)}</div>`).join("");
    const oppSlots = groupAttachments(opponentUnits);
    const mySlots = groupAttachments(playerUnits);
    const oppN = oppSlots.length + facedownAtBf.filter(c => sideOf(c) === opponent).length;
    const myN = mySlots.length + facedownAtBf.filter(c => sideOf(c) === viewingPlayer).length;
    const crowded = Math.max(oppN, myN) >= BF_CROWDED_AT;

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
      <div class="battlefield ${isContested ? "contested" : ""} ${controlClass} ${showdownClass} ${crowded ? "battlefield--crowded" : ""}" data-bf-id="${esc(bfId)}"
           data-drop-zone="${esc(bfId)}"
           onclick="onBattlefieldClick(event, '${esc(bfId)}')"
           style="--bf-img: url('/card-image/${esc(bfImgId)}');">
        <div class="bf-art"
             data-card-id="${esc(bfId)}"
             data-def-id="${esc(bfCard?.definitionId || bfId)}"
             ondblclick="openZoom('${esc(bfId)}')"></div>
        ${hasShowdown ? `<div class="bf-showdown-badge">${activeShowdown.isCombatShowdown ? "COMBAT" : "SHOWDOWN"}</div>` : ""}
        <div class="bf-body">
          <div class="bf-header">
            <div class="bf-name">${esc(bfName)}</div>
            <div class="bf-control">${controlLabel}${isContested ? " (Contested)" : ""}${hasShowdown ? " — " + (activeShowdown.isCombatShowdown ? "Combat" : "Showdown") : ""}</div>
          </div>
          ${renderBfSide("opponent-side", bfId, oppSlots, opponentFacedownHtml, oppN, bfZoneId)}
          <div class="bf-divider"></div>
          ${renderBfSide("player-side", bfId, mySlots, playerFacedownHtml, myN, bfZoneId)}
        </div>
      </div>
    `;
  }
  const rowEl = document.getElementById("battlefieldRow");
  rowEl.innerHTML = html;
  renderBfSpread(); // keep an open spread view in sync with the new state

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

// ============================================================================
// Crowded battlefield sides
// ----------------------------------------------------------------------------
// One horizontal row per side, never a second row and never a scrollbar: the
// cards first SHRINK to fit (down to a legible minimum) and past that OVERLAP
// like a fanned hand (later cards on top; hover lifts one clear of its
// neighbours; each keeps a visible, clickable strip). The row carries its slot
// count as --n so gameplay.css can size/overlap without measuring. A crowded
// side also gets a "⤢ N" chip that opens the SPREAD view: every unit on that
// side at full size in a grid, each tile forwarding hover (preview) and click
// (select / target) to the real board card, closed by outside click or Esc.
// ============================================================================
const BF_CROWDED_AT = 4;      // slots on one side before compact badges + the spread chip appear
let _bfSpread = null;         // { bfId, side } while the spread view is open

function renderBfSide(sideClass, bfId, slots, facedownHtml, n, bfZoneId) {
  const crowded = n >= BF_CROWDED_AT;
  const stacks = slots.filter(e => e.gear.length).length;
  const chip = crowded
    ? `<button type="button" class="bf-spread-chip" data-bf-spread="${esc(bfId)}:${esc(sideClass)}" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); openBfSpread('${esc(bfId)}', '${esc(sideClass)}')" title="Spread out all ${n} cards on this side">&#10530; ${n}</button>`
    : "";
  return `<div class="bf-units ${sideClass} ${crowded ? "bf-units--crowded" : ""}" data-n="${n}" style="--n:${Math.max(n, 1)};--stacks:${stacks}">${slots.map(e => renderUnitSlot(e, bfZoneId)).join("")}${facedownHtml}${chip}</div>`;
}

function openBfSpread(bfId, side) {
  _bfSpread = { bfId, side };
  if (typeof hidePreview === "function") hidePreview(true);
  renderBfSpread();
}

function closeBfSpread() {
  _bfSpread = null;
  document.getElementById("bfSpread")?.remove();
}

/** (Re)build the spread popover from the CURRENT board DOM for the open side; closes itself when that side empties. */
function renderBfSpread() {
  if (!_bfSpread) { document.getElementById("bfSpread")?.remove(); return; }
  const { bfId, side } = _bfSpread;
  const sideEl = document.querySelector(`.battlefield[data-bf-id="${CSS.escape(bfId)}"] .bf-units.${CSS.escape(side)}`);
  const cards = sideEl ? Array.from(sideEl.querySelectorAll(".card[data-card-id]")) : [];
  if (!sideEl || cards.length === 0) { closeBfSpread(); return; }
  let pop = document.getElementById("bfSpread");
  if (!pop) {
    pop = document.createElement("div");
    pop.id = "bfSpread";
    pop.className = "bf-spread";
    pop.addEventListener("pointerdown", (e) => e.stopPropagation());
    pop.addEventListener("click", (e) => {
      const tile = e.target.closest("[data-spread-for]");
      if (!tile) return;
      e.stopPropagation();
      const real = document.querySelector(`#battlefieldRow .card[data-card-id="${CSS.escape(tile.dataset.spreadFor)}"]`);
      if (!real) return;
      // Same path as clicking the board card: select it / pick it as a target.
      if (typeof onCardClick === "function") onCardClick(tile.dataset.spreadFor);
    });
    document.body.appendChild(pop);
  }
  const bfName = document.querySelector(`.battlefield[data-bf-id="${CSS.escape(bfId)}"] .bf-name`)?.textContent || bfId;
  const whose = side === "player-side" ? "Your" : "Opponent's";
  pop.innerHTML = `
    <div class="bf-spread-head"><span>${esc(whose)} side of ${esc(bfName)} — ${cards.length} card${cards.length === 1 ? "" : "s"}</span><button type="button" class="bf-spread-close" onclick="closeBfSpread()" title="Close (Esc)">&times;</button></div>
    <div class="bf-spread-grid">${cards.map(el => {
      const clone = el.cloneNode(true);
      clone.removeAttribute("onpointerdown");
      clone.removeAttribute("ondblclick");
      clone.classList.remove("dragging");
      // The tile is a hover-preview surface in its own right (same data-card-id /
      // data-def-id) and forwards clicks to the board card.
      return `<div class="bf-spread-tile" data-spread-for="${esc(el.dataset.cardId)}">${clone.outerHTML}</div>`;
    }).join("")}</div>`;
  // Sit over the battlefield row, clamped to the viewport.
  const row = document.getElementById("battlefieldRow")?.getBoundingClientRect();
  if (row) {
    pop.style.top = Math.max(8, Math.round(row.top + 8)) + "px";
    pop.style.maxHeight = Math.max(160, Math.round(window.innerHeight - row.top - 24)) + "px";
  }
}

// Outside click / Esc close the spread view.
document.addEventListener("pointerdown", (e) => {
  if (!_bfSpread) return;
  if (e.target.closest("#bfSpread, .bf-spread-chip, #actionBar, #targetBanner")) return;
  closeBfSpread();
}, true);
document.addEventListener("keydown", (e) => { if (_bfSpread && (e.key === "Escape" || e.key === "Esc")) closeBfSpread(); }, true);
