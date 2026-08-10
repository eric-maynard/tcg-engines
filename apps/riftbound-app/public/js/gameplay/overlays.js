// overlays.js — UI overlays: card preview, zoom, leave game, disconnect banner

const ICON_TOKENS = ["rainbow", "fury", "mind", "body", "calm", "chaos", "order", "might", "t"];

// Cost / domain tokens become coloured pills that KEEP their printed text
// ("[2]", "[fury]") — the same spelling the action bar and buttons use, so a
// title never reads "equip X for  less?" and textContent stays the rules text.
function iconify(text) {
  let html = esc(text || "");
  html = html.replace(/\[(\d+)\]/g, '<span class="ico ico-num">[$1]</span>');
  for (const tok of ICON_TOKENS) {
    const re = new RegExp("\\[(" + tok + ")\\]", "gi");
    html = html.replace(re, `<span class="ico ico-${tok}">[$1]</span>`);
  }
  return html;
}

// ============================================================================
// Hover preview — ONE floating panel (#cardPreview: position:fixed,
// pointer-events:none, above every overlay) for every card surface: hand,
// base and battlefield units, the battlefield cards themselves (.bf-art),
// legend/champion, runes, the top of a trash pile, showdown/mulligan cards
// and the card tiles inside prompts. It shows the large art PLUS the full
// rules text, is placed beside (never over) the hovered element, appears on
// mouseover and hides on mouseout. Driven by one delegated listener so every
// element carrying data-card-id / data-def-id gets it — the inline
// onmouseenter="showPreview(event, this)" attributes are the same call.
// ============================================================================
let _previewEl = null;      // element the panel currently describes
let _previewHideTimer = null;
const PREVIEW_HIDE_DELAY_MS = 60; // bridge the gap between two adjacent cards without a flash

/** The hover-able card surface for a DOM node (or null). */
function previewSurface(node) {
  if (!node || typeof node.closest !== "function") return null;
  if (node.closest("#cardPreview, #hover-preview")) return null;
  return node.closest(".card[data-card-id], .card[data-def-id], .bf-art[data-card-id], .choice-modal-card[data-card-id], .prompt-source[data-card-id], .deck-stack[data-card-id], .showdown-card[data-card-id], .zone-viewer-card[data-card-id]");
}

/** Card snapshot for an element: any zone (battlefieldRow included), else a def-only stub. */
function previewCardFor(el) {
  const cardId = el.dataset.cardId || "";
  let card = null;
  if (cardId && gameState?.zones) {
    for (const zoneCards of Object.values(gameState.zones)) {
      const found = (zoneCards || []).find(c => c && c.id === cardId);
      if (found) { card = found; break; }
    }
  }
  if (card) return card;
  const defId = el.dataset.defId || "";
  if (!defId && !cardId) return null;
  const name = el.querySelector?.(".card-name, .sc-name, .fallback-name")?.textContent || el.getAttribute("title") || el.getAttribute("aria-label") || "";
  return { id: cardId, definitionId: defId || cardId, name, cardType: el.classList.contains("bf-art") ? "battlefield" : "" };
}

function _previewCostText(card) {
  const energy = typeof card.effectiveEnergyCost === "number" ? card.effectiveEnergyCost : card.energyCost;
  const power = Array.isArray(card.effectivePowerCost) ? card.effectivePowerCost : (Array.isArray(card.powerCost) ? card.powerCost : []);
  const parts = [];
  if (energy != null) parts.push(`Cost ${energy}${power.length ? " + " + power.map(p => `[${p}]`).join("") : ""}`);
  if (card.might != null) {
    const eff = Math.max(0, card.might + (card.meta?.mightModifier ?? 0) + (card.meta?.staticMightBonus ?? 0) + (card.meta?.buffed ? 1 : 0) + (card.meta?.extraBuffs ?? 0) + (card.meta?.equipmentMightBonus ?? 0));
    parts.push(eff !== card.might ? `Might ${eff} (printed ${card.might})` : `Might ${card.might}`);
  }
  return parts.join(" · ");
}

function _previewStateText(card, el) {
  const bits = [];
  if (card.cardType === "battlefield") {
    const bf = gameState?.battlefields?.[card.id];
    if (bf) bits.push(bf.controller ? `Held by ${bf.controller === viewingPlayer ? "you" : pName(bf.controller)}` : "Uncontrolled", ...(bf.contested ? ["contested"] : []));
  }
  if (card.meta?.exhausted) bits.push(card.cardType === "rune" ? "Exhausted (tapped)" : "Exhausted");
  if (card.meta?.damage > 0) bits.push(`Damage ${card.meta.damage}`);
  if (card.meta?.stunned) bits.push("Stunned");
  if (card.meta?.buffed) bits.push("Buffed");
  if (typeof card.meta?.namedCard === "string" && card.meta.namedCard) bits.push(`Named: ${card.meta.namedCard}`); // rule 762
  const zone = el.dataset.zone || "";
  if (zone === "runePool" && card.owner === viewingPlayer) bits.push("click: exhaust for 1 energy · right-click: recycle for 1 power");
  return bits.join(" · ");
}

function showPreview(eventOrEl, maybeEl) {
  const el = maybeEl || (eventOrEl && eventOrEl.nodeType === 1 ? eventOrEl : null);
  if (!el) return;
  const previewEl = document.getElementById("cardPreview");
  if (!previewEl) return;
  const card = previewCardFor(el);
  if (!card) return;

  // Refuse to preview cards in the opponent's hidden zones outside sandbox
  // mode — even if the thumbnail were a card back, this handler would leak.
  if (!isSandboxGame) {
    const zone = el.dataset.zone || el.closest("[data-zone]")?.dataset.zone;
    const owner = el.dataset.owner || el.closest("[data-owner]")?.dataset.owner || card.owner;
    if (owner && owner !== viewingPlayer && (zone === "hand" || zone === "mainDeck" || zone === "runeDeck")) return;
  }
  if (el.classList.contains("facedown") && !el.dataset.defId) return;

  if (_previewHideTimer !== null) { clearTimeout(_previewHideTimer); _previewHideTimer = null; }
  _previewEl = el;

  const imgId = String(card.definitionId || el.dataset.defId || card.id || "").replace(/^player-[12]-(?:(?:main|rune)-\d+-|legend-|champion-|bf-)?/, "");
  const img = document.getElementById("previewImg");
  const nextSrc = imgId ? `/card-image/${encodeURIComponent(imgId)}` : "";
  if (img.getAttribute("data-current") !== nextSrc) {
    img.setAttribute("data-current", nextSrc);
    img.style.display = nextSrc ? "block" : "none";
    img.onerror = function() { this.style.display = "none"; };
    img.onload = function() { this.style.display = "block"; };
    if (nextSrc) img.src = nextSrc; else img.removeAttribute("src");
  }
  img.alt = card.name || "";
  const landscape = card.cardType === "battlefield";
  previewEl.classList.toggle("card-preview--landscape", landscape);

  const domain = Array.isArray(card.domain) ? card.domain.join(" / ") : (card.domain || "");
  document.getElementById("previewName").textContent = card.name || "";
  document.getElementById("previewType").textContent = [card.cardType || "", domain].filter(Boolean).join(" — ");
  // Printed tokens ([2], [fury], [Exhaust]) stay literal — same spelling as the action bar.
  const textEl = document.getElementById("previewText");
  textEl.textContent = card.rulesText || "";
  textEl.style.display = card.rulesText ? "" : "none";
  const stats = [_previewCostText(card), _previewStateText(card, el)].filter(Boolean);
  const statsEl = document.getElementById("previewStats");
  statsEl.innerHTML = stats.map(s => `<span>${esc(s)}</span>`).join("");
  statsEl.style.display = stats.length ? "" : "none";

  // Reveal before measuring so offsetHeight/Width reflect the populated panel.
  previewEl.classList.add("visible");
  positionPreview(el, previewEl);
}

/**
 * Beside the hovered thing, never over it (and never over the rest of a rune
 * fan / hand row): right of it if there is room, else left; hand & mulligan
 * cards get it above the row. Always clamped inside the viewport.
 */
function positionPreview(el, previewEl) {
  const anchor = el.closest(".rune-pool-grid") || el.closest(".rune-stack") || el;
  const rect = anchor.getBoundingClientRect();
  const w = previewEl.offsetWidth || 300;
  const h = previewEl.offsetHeight || 420;
  const vw = window.innerWidth, vh = window.innerHeight, gap = 14, pad = 8;
  const inRow = !!el.closest(".hand-zone, .mulligan-hand");
  let left, top;
  if (inRow && rect.top - h - gap >= pad) {
    left = rect.left + rect.width / 2 - w / 2;
    top = rect.top - h - gap;
  } else if (rect.right + gap + w <= vw - pad) {
    left = rect.right + gap;
    top = rect.top + rect.height / 2 - h / 2;
  } else if (rect.left - gap - w >= pad) {
    left = rect.left - gap - w;
    top = rect.top + rect.height / 2 - h / 2;
  } else {
    left = rect.left + rect.width / 2 - w / 2;
    top = rect.top - h - gap >= pad ? rect.top - h - gap : rect.bottom + gap;
  }
  left = Math.max(pad, Math.min(left, vw - w - pad));
  top = Math.max(pad, Math.min(top, vh - h - pad));
  previewEl.style.left = Math.round(left) + "px";
  previewEl.style.top = Math.round(top) + "px";
}

function hidePreview(immediate) {
  const previewEl = document.getElementById("cardPreview");
  if (!previewEl) return;
  if (_previewHideTimer !== null) { clearTimeout(_previewHideTimer); _previewHideTimer = null; }
  const doHide = () => { _previewHideTimer = null; _previewEl = null; previewEl.classList.remove("visible"); };
  if (immediate === true || typeof immediate === "undefined") { doHide(); return; }
  _previewHideTimer = setTimeout(doHide, PREVIEW_HIDE_DELAY_MS);
}

// Delegated driver: mouseover/mouseout bubble, so one listener covers every
// surface rendered now or later (battlefields, prompt tiles, trash…).
(function wireHoverPreview() {
  function over(e) {
    const el = previewSurface(e.target);
    if (!el) return;
    if (el === _previewEl && document.getElementById("cardPreview")?.classList.contains("visible")) {
      if (_previewHideTimer !== null) { clearTimeout(_previewHideTimer); _previewHideTimer = null; }
      return;
    }
    showPreview(el);
  }
  function out(e) {
    const el = previewSurface(e.target);
    if (!el) return;
    const to = e.relatedTarget;
    if (to && el.contains(to)) return; // still inside the same card
    hidePreview(previewSurface(to) ? false : true);
  }
  function go() {
    if (document.body.dataset.cardPreviewWired === "1") return;
    document.body.dataset.cardPreviewWired = "1";
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    // The element under a stationary cursor can be replaced by a re-render or
    // scrolled away; drop the panel when its subject is gone.
    document.addEventListener("scroll", () => hidePreview(true), true);
    window.addEventListener("blur", () => hidePreview(true));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
  else go();
})();

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
        return `<div class="zone-viewer-card" data-card-id="${esc(c.id || "")}" data-def-id="${esc(defId)}" data-zone="${esc(zoneName)}" style="width:96px; text-align:center;">
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
