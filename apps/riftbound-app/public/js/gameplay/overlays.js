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

  // Runes: suppress the zoom popout — the stacked rune pool is dense and the
  // hover preview obscures neighbouring runes. Checked both by cardType and
  // by container so opponent-owned runes (whose cardType may be redacted)
  // are covered too.
  if (card.cardType === "rune" || el.closest(".rune-stack")) {
    return;
  }

  const preview = document.getElementById("cardPreview");
  const img = document.getElementById("previewImg");
  img.src = `/card-image/${imgId}`;
  img.onerror = function() { this.style.display = "none"; };
  img.onload = function() { this.style.display = "block"; };

  // rule 762: the card this one named (Fallen Feline) is game state that lives
  // only on meta — the printed image cannot show it.
  const statsEl = document.getElementById("previewStats");
  if (statsEl) {
    const named = typeof card.meta?.namedCard === "string" ? card.meta.namedCard : "";
    statsEl.textContent = named ? `Named: ${named}` : "";
  }

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
  // Reveal before measuring so offsetHeight/Width reflect the populated panel.
  previewEl.classList.add("visible");
  const previewH = previewEl.offsetHeight || 420;
  const previewW = previewEl.offsetWidth || 236;
  // Mulligan/coin overlay: place the detail panel above the hand row so it
  // never covers the instruction line / Keep Hand button that sit below it,
  // and never runs off the bottom viewport edge.
  let left = Math.max(8, Math.min(rect.left, window.innerWidth - previewW - 8));
  let top = rect.top - previewH - 12;
  // Viewport clamp — keep the whole panel on-screen.
  if (top + previewH > window.innerHeight - 8) top = window.innerHeight - previewH - 8;
  if (top < 8) top = 8;

  previewEl.style.left = left + "px";
  previewEl.style.top = top + "px";
  previewEl.classList.add("visible");
}

function hidePreview() {
  document.getElementById("cardPreview").classList.remove("visible");
}

function openZoom(cardId) {
  // A modal (chain / pending choice / play-cost) owns the screen; the zoom overlay
  // sits above it in z-order and would trap the user, so refuse to open.
  if (document.querySelector(".chain-overlay.visible")) return;
  if (typeof isChoosingTarget === "function" && isChoosingTarget()) return;
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
  document.getElementById("cardZoom")?.classList.remove("visible");
}

// Backdrop click closes the zoom (gameplay.html also wires an inline onclick;
// this keeps it working if that attribute is ever dropped).
(function wireZoomBackdrop() {
  function go() {
    const zoom = document.getElementById("cardZoom");
    if (zoom && !zoom.dataset.wired) {
      zoom.dataset.wired = "1";
      zoom.addEventListener("click", closeZoom);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", go, { once: true });
  } else {
    go();
  }
})();

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

/**
 * Public-zone viewer (trash, banishment).
 * rule 108.2.d / 130.6: every card in a Trash is Public Information even while
 * buried in the pile, so the viewer lists the whole zone for either player.
 */
function openZoneViewer(zoneName, pid) {
  if (document.querySelector(".chain-overlay.visible")) return;
  if (typeof isChoosingTarget === "function" && isChoosingTarget()) return;
  const cards = (gameState?.zones?.[zoneName] || []).filter(c => c.owner === pid);
  let overlay = document.getElementById("zoneViewer");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "zoneViewer";
    overlay.className = "card-zoom-overlay";
    overlay.addEventListener("click", closeZoneViewer);
    document.body.appendChild(overlay);
  }
  const self = typeof viewingPlayer !== "undefined" && pid === viewingPlayer;
  const title = `${self ? "Your" : "Opponent's"} ${zoneName === "trash" ? "Trash" : zoneName} (${cards.length})`;
  const items = cards.length === 0
    ? '<div style="color:#8a80a8; font-size:13px;">Empty</div>'
    : cards.map(c => {
        const defId = String(c.definitionId || "").replace(/^player-[12]-/, "");
        return `<div class="zone-viewer-card" style="width:96px; text-align:center;">
          <img src="/card-image/${esc(defId)}" alt="${esc(c.name || "")}" style="width:96px; border-radius:6px;">
          <div style="font-size:11px; color:#cfc6e8;">${esc(c.name || "")}</div>
        </div>`;
      }).join("");
  overlay.innerHTML = `
    <div class="card-zoom-content" style="max-width:640px;" onclick="event.stopPropagation()">
      <div class="zoom-name" style="margin-bottom:8px;">${esc(title)}</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; max-height:60vh; overflow-y:auto;">${items}</div>
      <button class="action-bar-btn" style="margin-top:10px;" onclick="closeZoneViewer()">Close</button>
    </div>
  `;
  overlay.classList.add("visible");
  hidePreview();
}

function closeZoneViewer() {
  document.getElementById("zoneViewer")?.classList.remove("visible");
}
