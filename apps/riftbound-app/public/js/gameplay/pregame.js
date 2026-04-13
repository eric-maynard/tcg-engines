// pregame.js — Pregame phase: coin flip, battlefield selection, mulligan

/** Show dice-roll turn order animation with choose-who-goes-first for the winner */
function showCoinFlip(flip, onDone) {
  // Don't re-trigger if already showing
  if (_coinFlipShown && !flip.firstPlayer) return;

  const overlay = document.getElementById("coinOverlay");
  if (!overlay) { if (onDone) onDone(); return; }

  _coinFlipShown = true;
  _coinFlipOnDone = onDone;

  const p1Name = pName(P1);
  const p2Name = pName(P2);
  const isMe = flip.winner === viewingPlayer;
  const winnerName = pName(flip.winner);

  // Set player avatars
  document.getElementById("duelAvatar1").textContent = p1Name.charAt(0).toUpperCase();
  document.getElementById("duelAvatar2").textContent = p2Name.charAt(0).toUpperCase();
  document.getElementById("duelName1").textContent = p1Name;
  document.getElementById("duelName2").textContent = p2Name;

  const p1Roll = flip.p1Roll || 1;
  const p2Roll = flip.p2Roll || 1;

  const roll1El = document.getElementById("duelRoll1");
  const roll2El = document.getElementById("duelRoll2");
  const avatar1 = document.getElementById("duelAvatar1");
  const avatar2 = document.getElementById("duelAvatar2");
  const coinResult = document.getElementById("coinResult");
  const coinDetail = document.getElementById("coinDetail");
  const coinChoose = document.getElementById("coinChoose");

  // Clear any previous rolling animation
  if (_coinRollInterval) { clearInterval(_coinRollInterval); _coinRollInterval = null; }

  roll1El.textContent = "";
  roll2El.textContent = "";
  avatar1.classList.remove("winner");
  avatar2.classList.remove("winner");
  coinResult.style.animation = "none"; coinResult.style.opacity = "0";
  coinDetail.style.animation = "none"; coinDetail.style.opacity = "0";
  if (coinChoose) { coinChoose.style.animation = "none"; coinChoose.style.opacity = "0"; coinChoose.style.display = "none"; }

  document.getElementById("startScreen").classList.add("hidden");
  overlay.classList.add("visible");

  // Rolling number animation — 1.5s of random numbers then settle
  let rollCount = 0;
  _coinRollInterval = setInterval(() => {
    roll1El.textContent = Math.floor(Math.random() * 20) + 1;
    roll2El.textContent = Math.floor(Math.random() * 20) + 1;
    rollCount++;
    if (rollCount > 15) {
      clearInterval(_coinRollInterval);
      _coinRollInterval = null;

      // Show final server-rolled values
      roll1El.textContent = p1Roll;
      roll2El.textContent = p2Roll;

      // Highlight winner
      if (flip.winner === P1) avatar1.classList.add("winner");
      else avatar2.classList.add("winner");

      // Fade in result text
      coinResult.style.opacity = "1";
      coinResult.style.transition = "opacity 0.3s";
      if (isMe) {
        coinResult.innerHTML = `<span style="color:#50c878;font-weight:700;">You rolled higher!</span>`;
      } else {
        coinResult.innerHTML = `<span style="color:#f0c040;">${esc(winnerName)}</span> <span style="opacity:0.5">rolled higher</span>`;
      }

      // After a beat, show the choose UI or waiting text
      setTimeout(() => {
        coinDetail.style.opacity = "1";
        coinDetail.style.transition = "opacity 0.3s";

        if (flip.firstPlayer) {
          // Game already started — just show who goes first
          const firstIsMe = flip.firstPlayer === viewingPlayer;
          coinDetail.textContent = firstIsMe ? "You go first!" : `${pName(flip.firstPlayer)} goes first`;
        } else if (isMe) {
          coinDetail.textContent = "Choose who goes first:";
          if (coinChoose) { coinChoose.style.display = "flex"; coinChoose.style.opacity = "1"; }
        } else {
          coinDetail.textContent = `Waiting for ${esc(winnerName)} to choose...`;
        }
      }, 500);
    }
  }, 100);
}

/** Winner sends their choice to the server */
function chooseTurnOrder(choice) {
  const coinChoose = document.getElementById("coinChoose");
  if (coinChoose) coinChoose.style.display = "none";

  const coinDetail = document.getElementById("coinDetail");
  if (coinDetail) {
    coinDetail.textContent = choice === "self" ? "You go first!" : "Opponent goes first";
  }

  console.log("[Lobby] Sending choose_first:", choice, "lobbyWs open:", lobbyWs?.readyState === WebSocket.OPEN);
  if (lobbyWs && lobbyWs.readyState === WebSocket.OPEN) {
    lobbyWs.send(JSON.stringify({ type: "choose_first", choice }));
  } else if (lobbyWs && lobbyWs.readyState === WebSocket.CONNECTING) {
    const pending = JSON.stringify({ type: "choose_first", choice });
    lobbyWs.addEventListener("open", () => {
      lobbyWs.send(pending);
    }, { once: true });
  } else {
    console.error("[Lobby] Cannot send choose_first — lobbyWs not open");
  }
}

/** Show a brief channel phase banner */
function showChannelBanner(runeCount) {
  const banner = document.getElementById("channelBanner");
  const detail = document.getElementById("channelDetail");
  if (!banner) return;
  detail.textContent = `${runeCount} runes channeled from Rune Deck`;
  banner.classList.add("visible");
  setTimeout(() => banner.classList.remove("visible"), 2000);
}

function handlePregameSync(pregame, state) {
  if (!pregame || !pregame.phase) {
    // Pregame is over — hide overlay and render the game
    hidePregame();
    return;
  }

  pregameState = pregame;
  gameState = state;

  const overlay = document.getElementById("pregameOverlay");
  const content = document.getElementById("pregameContent");
  overlay.classList.add("visible");

  if (pregame.phase === "battlefield_select") {
    renderBattlefieldSelection(pregame, content);
  } else if (pregame.phase === "mulligan") {
    renderMulliganUI(pregame, state, content);
  }
}

function renderBattlefieldSelection(pregame, container) {
  const options = pregame.battlefieldOptions || [];
  const selected = pregame.battlefieldSelected;
  const firstLabel = pregame.firstPlayer === viewingPlayer ? "You" : pName(pregame.firstPlayer);

  let html = `
    <div class="pregame-title">Choose Your Battlefield</div>
    <div class="pregame-subtitle">Each player contributes 1 battlefield to the arena</div>
    <div class="pregame-info">${esc(firstLabel)} will go first</div>
    <div class="bf-choices" style="margin-top:16px;">
  `;

  for (const bf of options) {
    const isSelected = selected === bf.id;
    html += `
      <div class="bf-choice ${isSelected ? "selected" : ""}" onclick="selectBattlefield('${esc(bf.id)}')">
        <div class="bf-name">${esc(bf.name)}</div>
        <div class="bf-text">${esc(bf.rulesText || "")}</div>
      </div>
    `;
  }

  html += `</div>`;

  if (selected) {
    html += `<div class="pregame-waiting">Waiting for opponent to choose...</div>`;
  }

  container.innerHTML = html;
}

function selectBattlefield(bfId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "pregame_battlefield_select", battlefieldId: bfId }));
}

function renderMulliganUI(pregame, state, container) {
  const alreadyDone = pregame.mulliganComplete?.includes(viewingPlayer);
  mulliganSelected = new Set();

  // Get hand cards from state
  const hand = [];
  if (state?.zones?.hand) {
    for (const card of state.zones.hand) {
      if (card.owner === viewingPlayer) hand.push(card);
    }
  }

  const firstLabel = pregame.firstPlayer === viewingPlayer ? "You go" : `${pName(pregame.firstPlayer)} goes`;

  let html = `
    <div class="pregame-title">Opening Hand</div>
    <div class="pregame-subtitle">${esc(firstLabel)} first &mdash; tap up to 2 cards to send back</div>
    <div class="mulligan-hand" id="mulliganHandCards">
  `;

  for (const card of hand) {
    const defId = (card.definitionId || "").replace(/^player-[12]-/, "");
    const imgId = defId.replace(/^player-[12]-/, "");
    html += `
      <div class="card" data-mulligan-id="${esc(card.id)}"
           data-card-id="${esc(card.id)}" data-def-id="${esc(card.definitionId || "")}"
           onclick="toggleMulliganCard('${esc(card.id)}')"
           onmouseenter="showPreview(event, this)" onmouseleave="hidePreview()"
           style="cursor:pointer;">
        <img class="card-img" src="/card-image/${esc(imgId)}" alt="${esc(card.name)}"
             onerror="this.style.background='linear-gradient(135deg,#201a38,#2a2248)';this.alt='${esc(card.name)}'">
        <div class="card-name">${esc(card.name || "")}</div>
      </div>
    `;
  }

  html += `</div>`;

  if (alreadyDone) {
    html += `<div class="pregame-waiting">Waiting for opponent...</div>`;
  } else {
    html += `
      <div id="mulliganStatus" style="color:#8a82a6;font-size:13px;margin-top:8px;">Select 0-2 cards to send back, then confirm</div>
      <div class="mulligan-actions" id="mulliganBtns">
        <button class="start-btn mulligan-btn-keep" onclick="confirmMulligan()">Keep Hand</button>
      </div>
      <div class="pregame-info">Selected cards are recycled to the bottom of your deck and replaced with new draws (Rule 117)</div>
    `;
  }

  container.innerHTML = html;
}

function toggleMulliganCard(cardId) {
  if (mulliganSelected.has(cardId)) {
    mulliganSelected.delete(cardId);
  } else if (mulliganSelected.size < 2) {
    mulliganSelected.add(cardId);
  } else {
    showToast("You can only send back up to 2 cards");
    return;
  }

  // Update visual selection state
  document.querySelectorAll("[data-mulligan-id]").forEach(el => {
    const id = el.dataset.mulliganId;
    el.classList.toggle("mulligan-selected", mulliganSelected.has(id));
  });

  // Update status text and button
  const status = document.getElementById("mulliganStatus");
  const btns = document.getElementById("mulliganBtns");
  const count = mulliganSelected.size;

  if (status) {
    status.textContent = count === 0
      ? "Select 0\u20132 cards to send back, then confirm"
      : `${count} card${count > 1 ? "s" : ""} selected to send back`;
  }
  if (btns) {
    btns.innerHTML = count === 0
      ? '<button class="start-btn mulligan-btn-keep" onclick="confirmMulligan()">Keep Hand</button>'
      : `<button class="start-btn mulligan-btn-redo" onclick="confirmMulligan()">Mulligan ${count}</button>`;
  }
}

function confirmMulligan() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const sendBack = [...mulliganSelected];
  ws.send(JSON.stringify({ type: "pregame_mulligan", sendBack }));

  // Immediate UI feedback
  const container = document.getElementById("pregameContent");
  if (container) {
    const btns = container.querySelector(".mulligan-actions");
    if (btns) btns.innerHTML = sendBack.length === 0
      ? '<div style="color:#50c878;font-size:14px;font-weight:600;">Hand kept!</div>'
      : `<div style="color:#d0a040;font-size:14px;font-weight:600;">Sent back ${sendBack.length}, drawing replacements...</div>`;
    const status = document.getElementById("mulliganStatus");
    if (status) status.textContent = "";
    const info = container.querySelector(".pregame-info");
    if (info) info.textContent = "";
    const waiting = document.createElement("div");
    waiting.className = "pregame-waiting";
    waiting.textContent = "Waiting for opponent...";
    container.appendChild(waiting);
  }
}

function hidePregame() {
  pregameState = null;
  document.getElementById("pregameOverlay")?.classList.remove("visible");
  document.getElementById("gameSidebar")?.classList.remove("hidden");
}

/* ============================================================
   W14 — Non-modal Sideboard Overlay
   ------------------------------------------------------------
   Renders a centered card inside #game-scale-wrapper so the
   live game board remains visible (dimmed) behind the overlay.
   MUST stay inside the wrapper so scale-to-fit applies.
   Do NOT use position: fixed.

   The server does not yet emit a `sideboard` phase (see
   server.ts pregame phases: battlefield_select | mulligan |
   ready). This is UI scaffolding — call
   window.showSideboardOverlayDebug() to preview it manually,
   or once the engine emits `gameState.phase === 'sideboard'`
   (or `pregame.phase === 'sideboard'`), maybeRenderSideboardOverlay
   will pick it up automatically.
   ============================================================ */

/**
 * Build a card row (thumbnail, qty, name, click-to-swap).
 * swapHandler is invoked with (cardEntry) when row is clicked,
 * or null to render as non-interactive.
 */
function buildSideboardRow(entry, swapHandler) {
  const row = document.createElement("div");
  row.className = "sideboard-overlay__row";
  if (swapHandler) {
    row.style.cursor = "pointer";
    row.addEventListener("click", () => swapHandler(entry));
  }

  const thumb = document.createElement("div");
  thumb.className = "sideboard-overlay__thumb";
  const defId = (entry.definitionId || entry.id || "").replace(/^player-[12]-/, "");
  if (defId) {
    const img = document.createElement("img");
    img.src = `/card-image/${defId}`;
    img.alt = entry.name || defId;
    img.onerror = () => {
      img.style.display = "none";
    };
    thumb.appendChild(img);
  }

  const qty = document.createElement("div");
  qty.className = "sideboard-overlay__qty";
  qty.textContent = `x${entry.qty ?? 1}`;

  const name = document.createElement("div");
  name.className = "sideboard-overlay__name";
  name.textContent = entry.name || defId || "Unknown";

  row.appendChild(thumb);
  row.appendChild(qty);
  row.appendChild(name);
  return row;
}

/**
 * Collect main-deck and sideboard entries for the viewing player.
 * Falls back to empty arrays if the server hasn't wired a sideboard
 * zone yet.
 */
function collectSideboardData(state) {
  const main = [];
  const side = [];
  if (!state || !state.zones) return { main, side };

  const groupByDef = (cards) => {
    const map = new Map();
    for (const c of cards) {
      if (c.owner && c.owner !== viewingPlayer) continue;
      const key = c.definitionId || c.id;
      const existing = map.get(key);
      if (existing) {
        existing.qty += 1;
      } else {
        map.set(key, {
          id: c.id,
          definitionId: c.definitionId,
          name: c.name || c.definitionId || "",
          qty: 1,
        });
      }
    }
    return [...map.values()];
  };

  if (Array.isArray(state.zones.deck)) {
    main.push(...groupByDef(state.zones.deck));
  }
  if (Array.isArray(state.zones.sideboard)) {
    side.push(...groupByDef(state.zones.sideboard));
  }
  return { main, side };
}

/**
 * Render the sideboard overlay into #sideboard-overlay-mount.
 * Pass opts.debug = true to render with demo data when no zones exist.
 */
function renderSideboardOverlay(state, opts = {}) {
  const mount = document.getElementById("sideboard-overlay-mount");
  if (!mount) return;

  // Tear down any previous render.
  mount.innerHTML = "";

  let { main, side } = collectSideboardData(state);

  if (opts.debug && main.length === 0 && side.length === 0) {
    main = [
      { id: "demo-main-1", definitionId: "demo-card-1", name: "Demo Main Card A", qty: 3 },
      { id: "demo-main-2", definitionId: "demo-card-2", name: "Demo Main Card B", qty: 2 },
      { id: "demo-main-3", definitionId: "demo-card-3", name: "Demo Main Card C", qty: 4 },
    ];
    side = [
      { id: "demo-sb-1", definitionId: "demo-card-4", name: "Demo Sideboard X", qty: 2 },
      { id: "demo-sb-2", definitionId: "demo-card-5", name: "Demo Sideboard Y", qty: 1 },
    ];
  }

  const overlay = document.createElement("div");
  overlay.className = "sideboard-overlay";

  const backdrop = document.createElement("div");
  backdrop.className = "sideboard-overlay__backdrop";
  overlay.appendChild(backdrop);

  const card = document.createElement("div");
  card.className = "sideboard-overlay__card";

  const title = document.createElement("div");
  title.className = "sideboard-overlay__title";
  title.textContent = "Sideboard";
  card.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.className = "sideboard-overlay__subtitle";
  subtitle.textContent =
    "Swap cards between your main deck and sideboard, then lock in your configuration.";
  card.appendChild(subtitle);

  const columns = document.createElement("div");
  columns.className = "sideboard-overlay__columns";

  // Swap handler: if a real engine move exists, dispatch it;
  // otherwise log and no-op. The engine move name is speculative
  // (`sideboard_swap`) — once the engine lands the phase, wire it here.
  const swap = (fromZone, entry) => {
    if (typeof ws !== "undefined" && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "sideboard_swap",
          fromZone,
          cardId: entry.id,
          definitionId: entry.definitionId,
        }),
      );
    } else {
      console.log("[W14] sideboard swap (no-op — ws closed)", fromZone, entry);
    }
  };

  const mainCol = document.createElement("div");
  mainCol.className = "sideboard-overlay__col";
  const mainHeader = document.createElement("div");
  mainHeader.className = "sideboard-overlay__col-header";
  mainHeader.textContent = `Main Deck (${main.reduce((s, e) => s + (e.qty ?? 1), 0)})`;
  mainCol.appendChild(mainHeader);
  const mainList = document.createElement("div");
  mainList.className = "sideboard-overlay__list";
  for (const entry of main) {
    mainList.appendChild(buildSideboardRow(entry, (e) => swap("deck", e)));
  }
  if (main.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sideboard-overlay__empty";
    empty.textContent = "No cards in main deck.";
    mainList.appendChild(empty);
  }
  mainCol.appendChild(mainList);

  const sideCol = document.createElement("div");
  sideCol.className = "sideboard-overlay__col";
  const sideHeader = document.createElement("div");
  sideHeader.className = "sideboard-overlay__col-header";
  sideHeader.textContent = `Sideboard (${side.reduce((s, e) => s + (e.qty ?? 1), 0)})`;
  sideCol.appendChild(sideHeader);
  const sideList = document.createElement("div");
  sideList.className = "sideboard-overlay__list";
  for (const entry of side) {
    sideList.appendChild(buildSideboardRow(entry, (e) => swap("sideboard", e)));
  }
  if (side.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sideboard-overlay__empty";
    empty.textContent = "Sideboard is empty.";
    sideList.appendChild(empty);
  }
  sideCol.appendChild(sideList);

  columns.appendChild(mainCol);
  columns.appendChild(sideCol);
  card.appendChild(columns);

  const lockBtn = document.createElement("button");
  lockBtn.className = "sideboard-overlay__lock-btn";
  lockBtn.type = "button";
  lockBtn.textContent = "Lock In Sideboard";
  lockBtn.addEventListener("click", () => {
    if (typeof ws !== "undefined" && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "sideboard_lock_in" }));
    } else {
      console.log("[W14] lock in sideboard (stub — no ws move available)");
    }
    hideSideboardOverlay();
  });
  card.appendChild(lockBtn);

  overlay.appendChild(card);
  mount.appendChild(overlay);
  mount.classList.add("visible");
}

function hideSideboardOverlay() {
  const mount = document.getElementById("sideboard-overlay-mount");
  if (!mount) return;
  mount.innerHTML = "";
  mount.classList.remove("visible");
}

/**
 * Call from the game_state message handler to sync overlay
 * visibility to the current phase. Safe to call on every tick.
 */
function maybeRenderSideboardOverlay(state, pregame) {
  const isSideboardPhase =
    (state && state.phase === "sideboard") ||
    (pregame && pregame.phase === "sideboard");
  if (isSideboardPhase) {
    renderSideboardOverlay(state);
  } else {
    const mount = document.getElementById("sideboard-overlay-mount");
    if (mount && mount.classList.contains("visible")) {
      hideSideboardOverlay();
    }
  }
}

// Debug entry point — lets us preview the overlay without a live
// server-side sideboard phase. Once the engine supports the phase,
// remove this or gate it behind a build flag.
if (typeof window !== "undefined") {
  window.showSideboardOverlayDebug = function () {
    const state = typeof gameState !== "undefined" ? gameState : null;
    renderSideboardOverlay(state, { debug: true });
  };
  window.hideSideboardOverlay = hideSideboardOverlay;
}
