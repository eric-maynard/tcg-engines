// overlays.js — UI overlays: card preview, zoom, leave game, disconnect banner

const ICON_TOKENS = ["rainbow", "fury", "mind", "body", "calm", "chaos", "order", "might", "t"];

function iconify(text) {
  let html = esc(text || "");
  html = html.replace(/\[(\d+)\]/g, '<span class="ico ico-num">$1</span>');
  for (const tok of ICON_TOKENS) {
    const re = new RegExp("\\[" + tok + "\\]", "gi");
    html = html.replace(re, `<span class="ico ico-${tok}"></span>`);
  }
  return html;
}

function showPreview(event, el) {
  const defId = el.dataset.defId || "";
  const imgId = defId.replace(/^player-[12]-/, "");
  const cardId = el.dataset.cardId || "";

  // Find card data in game state
  let card = null;
  if (gameState?.zones) {
    for (const zoneCards of Object.values(gameState.zones)) {
      const found = zoneCards.find(c => c.id === cardId);
      if (found) { card = found; break; }
    }
  }

  if (!card) return;

  const preview = document.getElementById("cardPreview");
  const img = document.getElementById("previewImg");
  img.src = `/card-image/${imgId}`;
  img.onerror = function() { this.style.display = "none"; };
  img.onload = function() { this.style.display = "block"; };

  document.getElementById("previewName").textContent = card.name || cardId;
  document.getElementById("previewType").textContent = card.cardType || "";
  document.getElementById("previewText").innerHTML = iconify(card.rulesText || "");

  let stats = "";
  if (card.energyCost != null) stats += `<span>Cost: ${card.energyCost}</span>`;
  if (card.might != null) stats += `<span>Might: ${card.might}</span>`;
  if (card.meta?.damage > 0) stats += `<span style="color:#d04040">Damage: ${card.meta.damage}</span>`;
  if (card.meta?.exhausted) stats += `<span style="color:#d08030">Exhausted</span>`;
  if (card.meta?.stunned) stats += `<span style="color:#d04040">Stunned</span>`;
  if (card.meta?.buffed) stats += `<span style="color:#f0c040">Buffed</span>`;
  document.getElementById("previewStats").innerHTML = stats;

  // Refuse to preview cards in the opponent's hidden zones outside sandbox
  // mode — even if the thumbnail were a card back, this handler would leak.
  if (!isSandboxGame) {
    const zone = el.dataset.zone || el.closest("[data-zone]")?.dataset.zone;
    const owner = el.dataset.owner || el.closest("[data-owner]")?.dataset.owner;
    if (owner && owner !== viewingPlayer && (zone === "hand" || zone === "mainDeck" || zone === "runeDeck")) {
      return;
    }
  }

  // Position
  const rect = el.getBoundingClientRect();
  const previewEl = document.getElementById("cardPreview");
  const pregameVisible =
    document.getElementById("pregameOverlay")?.classList.contains("visible") ||
    document.getElementById("coinOverlay")?.classList.contains("visible");
  let left = rect.right + 8;
  let top = rect.top;
  // Anchor far-left when the tooltip would land over the board center
  // (pregame overlay, or hovering the opponent-hand row at the top —
  // otherwise it drops onto the phase tracker and centre battlefields).
  if (pregameVisible || rect.top < 220) {
    left = 20;
    top = Math.max(60, rect.bottom + 8);
  } else if (left + 230 > window.innerWidth) {
    left = rect.left - 230;
  }
  // Reserve space for hand zone at bottom
  const handZoneTop = window.innerHeight - 180;
  if (top + 300 > handZoneTop) top = handZoneTop - 310;
  if (top < 8) top = 8;

  previewEl.style.left = left + "px";
  previewEl.style.top = top + "px";
  previewEl.classList.add("visible");
}

function hidePreview() {
  document.getElementById("cardPreview").classList.remove("visible");
}

function openZoom(cardId) {
  let card = null;
  if (gameState?.zones) {
    for (const zoneCards of Object.values(gameState.zones)) {
      const found = zoneCards.find(c => c.id === cardId);
      if (found) { card = found; break; }
    }
  }
  if (!card) return;

  const defId = (card.definitionId || "").replace(/^player-[12]-/, "");
  document.getElementById("zoomImg").src = `/card-image/${defId}`;
  document.getElementById("zoomName").textContent = card.name || cardId;
  document.getElementById("zoomType").textContent = `${card.cardType || ""}${card.domain ? " — " + card.domain : ""}`;
  document.getElementById("zoomText").innerHTML = iconify(card.rulesText || "");

  let stats = "";
  if (card.energyCost != null) stats += `<span>Cost: ${card.energyCost}</span>`;
  if (card.might != null) stats += `<span>Might: ${card.might}</span>`;
  if (card.meta?.damage > 0) stats += `<span style="color:#d04040">Dmg: ${card.meta.damage}</span>`;
  document.getElementById("zoomStats").innerHTML = stats;

  document.getElementById("cardZoom").classList.add("visible");
  hidePreview();
}

function closeZoom() {
  document.getElementById("cardZoom").classList.remove("visible");
}

/** Handle clicks on battlefield containers (for movement targets) */
function onBattlefieldClick(e, bfId) {
  // Only handle if the click is directly on the battlefield container or its non-card children
  // (card clicks are handled by onPointerDown/onCardClick which stops at the card level)
  if (e.target.closest("[data-card-id]")) return;

  if (interaction.mode === "cardSelected" && interaction.validTargets.includes(bfId)) {
    onZoneClick(bfId);
  }
}

// Leave Game & Disconnect Handling

function showLeaveConfirm() {
  const msg = document.getElementById("confirmLeaveMsg");
  if (lobbyRole === "host") {
    msg.textContent = "As the host, leaving will end the game for both players.";
  } else {
    msg.textContent = "You can rejoin this game later if it's still active.";
  }
  document.getElementById("confirmLeave").classList.add("visible");
}

function cancelLeaveGame() {
  document.getElementById("confirmLeave").classList.remove("visible");
}

function confirmLeaveGame() {
  document.getElementById("confirmLeave").classList.remove("visible");

  // Send leave event to server
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "leave_game", role: lobbyRole }));
  }

  // Disconnect and return to lobby
  disconnectWs();
  gameId = null;
  gameState = null;
  availableMoves = [];
  pregameState = null;
  clearSession();

  // Reset UI to lobby
  document.getElementById("gameSidebar")?.classList.add("hidden");
  document.getElementById("pregameOverlay")?.classList.remove("visible");
  document.getElementById("startScreen").classList.remove("hidden");

  // Show the menu
  document.getElementById("lobbyMenu")?.classList.remove("hidden");
  document.getElementById("lobbyRoom")?.classList.add("hidden");
  document.getElementById("joinForm")?.classList.add("hidden");
}

function showDisconnectBanner(playerName) {
  const banner = document.getElementById("disconnectBanner");
  if (!banner) return;
  banner.textContent = `${playerName} disconnected — waiting for reconnect...`;
  banner.classList.add("visible");
  opponentDisconnected = true;
}

function hideDisconnectBanner() {
  const banner = document.getElementById("disconnectBanner");
  if (banner) banner.classList.remove("visible");
  opponentDisconnected = false;
}
