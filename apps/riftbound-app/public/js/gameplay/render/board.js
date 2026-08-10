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
  // rule 108.2.d: the trash is Public Information — render it beside the decks
  // for both players so discarded cards never vanish from the board.
  document.getElementById("player-decks").innerHTML =
    renderDeckStack(zoneForPlayer("mainDeck", viewingPlayer), "Main", { peekable: true }) +
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
    const opponentUnits = unitsAtBf.filter(c => c.owner === opponent);
    const playerUnits = unitsAtBf.filter(c => c.owner === viewingPlayer);

    // rule-id: ogn-197-298 — Rule 723 (Hidden): the engine parks hidden cards
    // in a sibling `facedown-${bfId}` zone, not `battlefield-${bfId}`, so they
    // must be read separately or they never appear on the board. The owner
    // sees the face (private info they already know); the opponent sees a back.
    const fdZoneId = `facedown-${bfId}`;
    const facedownAtBf = zones[fdZoneId] || [];
    const renderFacedown = (c) => (c.owner === viewingPlayer || (isSandboxGame && !(typeof isVsAiGame === "function" && isVsAiGame())))
      ? `<div class="bf-facedown" title="Hidden (facedown)">${renderCardElement(c, false, fdZoneId)}</div>`
      : renderCardElement({}, true);
    const opponentFacedownHtml = facedownAtBf.filter(c => c.owner === opponent).map(renderFacedown).join("");
    const playerFacedownHtml = facedownAtBf.filter(c => c.owner === viewingPlayer).map(renderFacedown).join("");

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
          <div class="bf-units opponent-side">
            ${opponentUnits.map(c => renderCardElement(c, false, bfZoneId)).join("") || ""}${opponentFacedownHtml}
          </div>
          <div class="bf-divider"></div>
          <div class="bf-units player-side">
            ${playerUnits.map(c => renderCardElement(c, false, bfZoneId)).join("") || ""}${playerFacedownHtml}
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
