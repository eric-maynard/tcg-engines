// pregame.js — Pregame phase: coin flip, battlefield selection, sideboarding, mulligan

/**
 * Every pregame screen (roll / choose-first, battlefield pick, waiting,
 * sideboard, mulligan) carries a persistent "Leave match" button so a player
 * can always abandon: it confirms, tells the server (leave_game on the game
 * socket → match abandoned for both seats; leave_lobby before a game exists)
 * and returns to the play menu. Injected once per overlay; idempotent.
 */
function ensurePregameLeaveButton() {
  for (const id of ["pregameOverlay", "coinOverlay"]) {
    const overlay = document.getElementById(id);
    if (!overlay || overlay.querySelector(".pregame-leave-btn")) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pregame-leave-btn";
    btn.id = id === "pregameOverlay" ? "pregameLeaveBtn" : "coinLeaveBtn";
    btn.textContent = "Leave match";
    btn.title = "Abandon this match and return to the menu";
    btn.addEventListener("click", (e) => { e.stopPropagation(); showPregameLeaveConfirm(); });
    overlay.appendChild(btn);
  }
}

function showPregameLeaveConfirm() {
  const msg = document.getElementById("confirmLeaveMsg");
  if (msg) {
    msg.textContent = isSandboxGame
      ? "Abandon this practice game and return to the menu?"
      : "Leaving now abandons the match for both players. Your opponent will be returned to the lobby.";
  }
  document.getElementById("confirmLeave")?.classList.add("visible");
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensurePregameLeaveButton, { once: true });
  else ensurePregameLeaveButton();
}

/* "Skip animations in practice games" (roll overlay + first-player reveal vs Goldfish / Claude).
   Default OFF: solo games show the d20 roll like a hosted game does. */
const PREGAME_SKIP_ANIM_KEY = "rb-skip-pregame-animations";
function pregameAnimationsSkipped() {
  let v = null;
  try { v = localStorage.getItem(PREGAME_SKIP_ANIM_KEY); } catch { /* private mode */ }
  if (v === "1") return true;
  if (v === "0") return false;
  // No explicit choice: unattended automation (navigator.webdriver — playtest drivers that never
  // answer a go-first prompt) keeps the instant start; people get the roll.
  return typeof navigator !== "undefined" && navigator.webdriver === true;
}
function setPregameAnimationsSkipped(on) {
  try { localStorage.setItem(PREGAME_SKIP_ANIM_KEY, on ? "1" : "0"); } catch { /* private mode */ }
}

/**
 * Show the d20 initiative roll (both dice, who won). Then:
 *  - `flip.firstPlayer` unknown and the viewer won → the go-first / go-second buttons;
 *  - `flip.firstPlayer` unknown and the other seat won → "Waiting for X to choose";
 *  - `flip.firstPlayer` known (the other seat — e.g. the Goldfish / Claude seat —
 *    already decided, or a reconnect) → says who goes first, then `onDone` after a
 *    short linger. A click anywhere on the overlay skips: first click settles the
 *    dice, the next proceeds (when there is nothing to choose).
 */
function showCoinFlip(flip, onDone) {
  // Don't re-trigger if already showing
  if (_coinFlipShown && !flip.firstPlayer) return;

  const overlay = document.getElementById("coinOverlay");
  if (!overlay) { if (onDone) onDone(); return; }
  ensurePregameLeaveButton();

  _coinFlipShown = true;
  let done = false;
  const finish = () => { if (done) return; done = true; overlay.onclick = null; if (onDone) onDone(); };
  _coinFlipOnDone = finish;

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
  overlay.dataset.stage = "rolling";

  let settled = false;
  let detailTimer = null;
  // Who goes first (once known): the other seat decided when it won (bots always elect to go first).
  const reveal = () => {
    if (detailTimer) { clearTimeout(detailTimer); detailTimer = null; }
    coinDetail.style.opacity = "1";
    coinDetail.style.transition = "opacity 0.3s";
    if (flip.firstPlayer) {
      const firstIsMe = flip.firstPlayer === viewingPlayer;
      const botDecided = !isMe && isSandboxGame;
      coinDetail.textContent = firstIsMe
        ? (isMe ? "You go first!" : `${winnerName} chose: you go first`)
        : botDecided ? `${winnerName} won the roll and chose to go first` : `${pName(flip.firstPlayer)} goes first`;
      overlay.dataset.stage = "decided";
      setTimeout(finish, 1500);
    } else if (isMe) {
      coinDetail.textContent = "Choose who goes first:";
      if (coinChoose) { coinChoose.style.display = "flex"; coinChoose.style.opacity = "1"; }
      overlay.dataset.stage = "choose";
    } else {
      coinDetail.textContent = `Waiting for ${winnerName} to choose...`;
      overlay.dataset.stage = "waiting";
    }
  };
  // Stop the dice on the server-rolled values and name the winner.
  const settle = (fast) => {
    if (settled) return;
    settled = true;
    if (_coinRollInterval) { clearInterval(_coinRollInterval); _coinRollInterval = null; }
    roll1El.textContent = p1Roll;
    roll2El.textContent = p2Roll;
    if (flip.winner === P1) avatar1.classList.add("winner"); else avatar2.classList.add("winner");
    coinResult.style.opacity = "1";
    coinResult.style.transition = "opacity 0.3s";
    const hi = flip.winner === P1 ? p1Roll : p2Roll;
    const lo = flip.winner === P1 ? p2Roll : p1Roll;
    coinResult.innerHTML = isMe
      ? `<span style="color:#50c878;font-weight:700;">You rolled higher!</span> <span style="opacity:0.5">(${hi} vs ${lo})</span>`
      : `<span style="color:#f0c040;">${esc(winnerName)}</span> <span style="opacity:0.5">rolled higher (${hi} vs ${lo})</span>`;
    overlay.dataset.stage = "settled";
    if (fast) reveal(); else detailTimer = setTimeout(reveal, 500);
  };
  // Click to skip: settle the dice at once; a further click proceeds when nothing is left to choose.
  overlay.onclick = (e) => {
    if (e.target.closest && e.target.closest("button")) return;
    if (!settled) { settle(true); return; }
    if (flip.firstPlayer) finish();
  };

  // Rolling number animation — 1.5s of random numbers then settle
  let rollCount = 0;
  _coinRollInterval = setInterval(() => {
    roll1El.textContent = Math.floor(Math.random() * 20) + 1;
    roll2El.textContent = Math.floor(Math.random() * 20) + 1;
    rollCount++;
    if (rollCount > 15) settle(false);
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
  ensurePregameLeaveButton();
  content.classList.toggle("sideboard-step", pregame.phase === "sideboard");
  content.classList.toggle("bf-step", pregame.phase === "battlefield_select");

  if (pregame.phase === "battlefield_select") {
    renderBattlefieldSelection(pregame, content);
  } else if (pregame.phase === "sideboard") {
    maybeRenderSideboardOverlay(state, pregame);
  } else if (pregame.phase === "mulligan") {
    renderMulliganUI(pregame, state, content);
  }
}

function renderBattlefieldSelection(pregame, container) {
  const options = pregame.battlefieldOptions || [];
  const selected = pregame.battlefieldSelected;
  const firstLabel = pregame.firstPlayer === viewingPlayer ? "You" : pName(pregame.firstPlayer);

  // Rule 486.5: the pick is final once sent (the server refuses a second one) —
  // after locking, the options are inert and the screen says what we wait for.
  const locked = Boolean(selected);
  _bfSelectPending = locked ? null : _bfSelectPending;
  let html = `
    <div class="pregame-title">Choose Your Battlefield</div>
    <div class="pregame-subtitle">Each player contributes 1 battlefield to the arena &mdash; hover a card for its full text</div>
    <div class="pregame-info">${esc(firstLabel)} will go first</div>
    <div class="bf-choices${locked ? " bf-choices--locked" : ""}" id="bfChoices" style="margin-top:16px;">
  `;

  for (const bf of options) {
    const isSelected = selected === bf.id;
    html += `
      <button type="button" class="bf-choice${isSelected ? " selected" : ""}${locked && !isSelected ? " bf-choice--dimmed" : ""}"
              data-bf-id="${esc(bf.id)}" data-def-id="${esc(bf.id)}" data-card-type="battlefield"
              data-rules-text="${esc(bf.rulesText || "")}" title="${esc(bf.name)}" aria-pressed="${isSelected}"
              ${locked ? "disabled" : `onclick="selectBattlefield('${esc(bf.id)}')"`}>
        <span class="bf-choice-art">
          <img class="bf-choice-img" src="/card-image/${encodeURIComponent(bf.id)}" alt="${esc(bf.name)}" draggable="false"
               onerror="this.parentElement.classList.add('bf-choice-art--missing')">
          <span class="bf-choice-fallback">${iconify(bf.rulesText || "")}</span>
        </span>
        <span class="bf-name">${esc(bf.name)}</span>
        ${isSelected ? '<span class="bf-choice-badge">Locked in</span>' : ""}
      </button>
    `;
  }

  html += `</div>`;

  if (locked) {
    const name = pregame.battlefieldSelectedName || (options.find((b) => b.id === selected) || {}).name || selected;
    html += `<div class="pregame-waiting" id="bfLockedStatus">Locked: <b>${esc(name)}</b> &mdash; waiting for opponent&hellip;</div>`;
  } else {
    html += `<div class="pregame-info" id="bfPickHint">Click a battlefield to lock it in &mdash; the choice is final.</div>`;
  }

  container.innerHTML = html;
}

let _bfSelectPending = null;
function selectBattlefield(bfId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  // Final once chosen: never send a second pick (the server refuses it anyway).
  if ((pregameState && pregameState.battlefieldSelected) || _bfSelectPending) return;
  _bfSelectPending = bfId;
  document.querySelectorAll("#bfChoices .bf-choice").forEach((el) => {
    el.disabled = true;
    el.classList.toggle("selected", el.dataset.bfId === bfId);
    el.classList.toggle("bf-choice--dimmed", el.dataset.bfId !== bfId);
  });
  ws.send(JSON.stringify({ type: "pregame_battlefield_select", battlefieldId: bfId }));
  // If the server refuses (error frame), the next sync re-renders the live options.
  setTimeout(() => { if (_bfSelectPending === bfId && !(pregameState && pregameState.battlefieldSelected)) { _bfSelectPending = null; if (pregameState) handlePregameSync(pregameState, gameState); } }, 4000);
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

  // rule 485.5 — Duel (Bo1): the game picked each battlefield at random; there
  // is no picker, so say which one (DESIGN.md §Pregame).
  let randomBfHtml = "";
  if (pregame.battlefieldRandom && pregame.battlefieldSelectedName) {
    const picks = pregame.battlefieldRandomSelections || {};
    const oppId = Object.keys(picks).find((pid) => pid !== viewingPlayer);
    const oppLine = oppId && picks[oppId]?.name
      ? ` &middot; ${esc(pName(oppId))}: <b>${esc(picks[oppId].name)}</b>`
      : "";
    randomBfHtml = `<div class="pregame-info" id="pregameRandomBattlefield" data-bf-id="${esc(pregame.battlefieldSelected || "")}">Battlefield selected at random: <b>${esc(pregame.battlefieldSelectedName)}</b>${oppLine}</div>`;
  }

  let html = `
    <div class="pregame-title">Opening Hand</div>
    <div class="pregame-subtitle">${esc(firstLabel)} first &mdash; tap up to 2 cards to send back</div>
    ${randomBfHtml}
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
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="card-fallback">
          <div class="fallback-cost">${card.energyCost != null ? esc(card.energyCost) : "&mdash;"}</div>
          <div class="fallback-name">${esc(card.name || "")}</div>
          <div class="fallback-type">${esc(card.cardType || "")}</div>
          <div class="fallback-text">${iconify(card.rulesText || "")}</div>
        </div>
        <div class="card-name">${esc(card.name || "")}</div>
      </div>
    `;
  }

  html += `</div>`;

  if (alreadyDone) {
    html += `<div class="pregame-waiting">Waiting for opponent...</div>`;
  } else {
    html += `
      <div id="mulliganStatus" style="color:#8a82a6;font-size:13px;margin-top:8px;">Select 0-2 cards to send back, then confirm &middot; hover a card for full rules text</div>
      <div class="mulligan-actions" id="mulliganBtns">
        <button class="start-btn mulligan-btn-keep" onclick="confirmMulligan()">Keep Hand</button>
      </div>
      <div class="pregame-info">Selected cards go to the bottom of your deck and are replaced with new draws</div>
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
   Sideboarding step (pregame phase "sideboard")
   ------------------------------------------------------------
   Server contract (server/pregame.ts §Sideboarding — assumed OP
   policy, not Core Rules): after legends / champions / this
   game's battlefields are revealed and BEFORE hands are drawn,
   each player may swap cards 1-for-1 between main deck and
   sideboard, privately, then lock in. Frames:
     pregame.phase === "sideboard"
     pregame.you      = { main:[{id,defId,name,cardType,energyCost}], side:[…],
                          locked, mainSize, sideSize, sideMax, swaps:{ins,outs}, championName }
     pregame.opponent = { name, legend, champion, battlefields:[{id,name}], status:"choosing"|"locked" }
   Client → server: {type:"sideboard_swap", out:<mainInstanceId>, in:<sideInstanceId>}
                    {type:"sideboard_lock"}
   Rendered into the regular pregame overlay (#pregameContent) so
   the "no other modal over the pregame overlay" guards apply.
   ============================================================ */

const SB_SKIP_KEY = "rb-skip-sideboarding";
let _sbPick = { main: null, side: null }; // Selected instance ids (click one column, then the other)
let _sbLockSent = false;
let _sbAutoSkipped = false;

function sideboardSkipPreferred() {
  try { return localStorage.getItem(SB_SKIP_KEY) === "1"; } catch { return false; }
}
function setSideboardSkipPreferred(on) {
  try { localStorage.setItem(SB_SKIP_KEY, on ? "1" : "0"); } catch { /* private mode */ }
}

function sendSideboardSwap(outId, inId) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !outId || !inId) return;
  ws.send(JSON.stringify({ type: "sideboard_swap", out: outId, in: inId }));
}

function sendSideboardLock() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  _sbLockSent = true;
  ws.send(JSON.stringify({ type: "sideboard_lock" }));
}

/** Group a card list by definition for "thumb + qty" rows, remembering the instance ids behind each row. */
function sbGroup(cards, originTag) {
  const groups = new Map();
  for (const c of cards) {
    let g = groups.get(c.defId);
    if (!g) {
      g = { defId: c.defId, name: c.name, energyCost: c.energyCost, cardType: c.cardType, ids: [], moved: 0 };
      groups.set(c.defId, g);
    }
    g.ids.push(c.id);
    if (c.id.includes(originTag)) g.moved++; // Cards that crossed over (side-origin in main / main-origin in side)
  }
  return [...groups.values()].sort((a, b) => (a.energyCost ?? 99) - (b.energyCost ?? 99) || a.name.localeCompare(b.name));
}

function sbRowHtml(g, column, selectedId) {
  const selected = selectedId && g.ids.includes(selectedId);
  // Prefer handing over a card that already crossed (so re-clicking undoes) — else the first instance.
  const crossedTag = column === "main" ? "-side-" : "-main-";
  const pickId = g.ids.find((id) => id.includes(crossedTag)) || g.ids[0];
  const badge = g.moved > 0
    ? `<span class="sb-badge sb-badge--${column === "main" ? "in" : "out"}">${column === "main" ? "+" : "&minus;"}${g.moved}</span>`
    : "";
  return `
    <div class="sideboard-overlay__row${selected ? " sb-selected" : ""}" draggable="true"
         data-sb-col="${column}" data-sb-id="${esc(pickId)}" data-def-id="${esc(g.defId)}"
         title="${esc(g.name)}">
      <div class="sideboard-overlay__thumb"><img src="/card-image/${esc(g.defId)}" alt="" onerror="this.style.display='none'"></div>
      <div class="sideboard-overlay__qty">x${g.ids.length}</div>
      <div class="sb-cost">${g.energyCost != null ? esc(String(g.energyCost)) : "&ndash;"}</div>
      <div class="sideboard-overlay__name">${esc(g.name)}</div>
      ${badge}
    </div>`;
}

function renderSideboardStep(pregame, container) {
  const you = pregame.you;
  const opp = pregame.opponent || {};
  if (!container) return;

  // Practice games: honour "Skip sideboarding" — lock in immediately, once.
  if (pregame.sandbox && you && !you.locked && !_sbAutoSkipped && sideboardSkipPreferred()) {
    _sbAutoSkipped = true;
    sendSideboardLock();
  }
  if (you && !you.locked) _sbLockSent = false;

  const oppBits = [];
  if (opp.legend) oppBits.push(`Legend <b>${esc(opp.legend.name)}</b>`);
  if (opp.champion) oppBits.push(`Champion <b>${esc(opp.champion.name)}</b>`);
  if ((opp.battlefields || []).length) oppBits.push(`Battlefield <b>${opp.battlefields.map((b) => esc(b.name)).join(", ")}</b>`);
  const oppStatus = opp.status === "locked"
    ? `<span class="sb-status sb-status--locked">Locked in</span>`
    : `<span class="sb-status sb-status--choosing">Sideboarding&hellip;</span>`;
  const myBf = pregame.battlefieldSelectedName
    ? `<div class="pregame-info">Your battlefield: <b>${esc(pregame.battlefieldSelectedName)}</b>${pregame.battlefieldRandom ? " (selected at random)" : ""}</div>`
    : "";

  let html = `
    <div class="pregame-title">Sideboarding</div>
    <div class="pregame-subtitle">Swap cards 1-for-1 between your main deck and sideboard before opening hands are drawn &mdash; click a main-deck card then a sideboard card (or drag one onto the other). Your opponent only sees when you lock in.</div>
    <div class="sb-opponent" id="sbOpponent">
      <span class="sb-opp-name">${esc(opp.name || "Opponent")}</span> revealed: ${oppBits.join(" &middot; ") || "&mdash;"} ${oppStatus}
    </div>
    ${myBf}
  `;

  if (!you) {
    html += `<div class="pregame-waiting">Spectating &mdash; waiting for both players to lock in&hellip;</div>`;
    container.innerHTML = html;
    return;
  }

  const mainGroups = sbGroup(you.main || [], "-side-");
  const sideGroups = sbGroup(you.side || [], "-main-");
  const locked = Boolean(you.locked);
  const sizesOk = (you.sideSize ?? (you.side || []).length) <= (you.sideMax ?? window.deckRules?.sideboardMax ?? 10);
  const k = (you.swaps?.ins || []).length;

  html += `
    <div class="sideboard-overlay__columns sb-columns${locked ? " sb-locked" : ""}" id="sbColumns">
      <div class="sideboard-overlay__col" data-sb-drop="main">
        <div class="sideboard-overlay__col-header">Main deck <span id="sbMainCount">${you.mainSize ?? you.main.length}</span>${you.championName ? ` <span class="sb-sub">+ ${esc(you.championName)}</span>` : ""}</div>
        <div class="sideboard-overlay__list" id="sbMainList">
          ${mainGroups.map((g) => sbRowHtml(g, "main", _sbPick.main)).join("") || '<div class="sideboard-overlay__empty">No cards in main deck.</div>'}
        </div>
      </div>
      <div class="sideboard-overlay__col" data-sb-drop="side">
        <div class="sideboard-overlay__col-header">Sideboard <span id="sbSideCount">${you.sideSize ?? you.side.length}</span> / ${you.sideMax ?? window.deckRules?.sideboardMax ?? 10}</div>
        <div class="sideboard-overlay__list" id="sbSideList">
          ${sideGroups.map((g) => sbRowHtml(g, "side", _sbPick.side)).join("") || '<div class="sideboard-overlay__empty">Sideboard is empty.</div>'}
        </div>
      </div>
    </div>
    <div class="sb-swaps" id="sbSwaps">
      <span class="sb-swaps-label">Swaps: <b id="sbSwapCount">${k}</b></span>
      ${(you.swaps?.ins || []).map((inId, i) => {
        const outId = you.swaps.outs[i];
        const inName = (you.main.find((c) => c.id === inId) || {}).name || "?";
        const outName = (you.side.find((c) => c.id === outId) || {}).name || "?";
        return `<span class="sb-swap-chip">&minus;${esc(outName)} / +${esc(inName)}${locked ? "" : ` <button type="button" class="sb-undo" data-sb-undo-in="${esc(inId)}" data-sb-undo-out="${esc(outId || "")}" title="Undo this swap">undo</button>`}</span>`;
      }).join("")}
    </div>
  `;

  if (locked) {
    html += `<div class="pregame-waiting" id="sbWaiting">${opp.status === "locked" ? "Both locked in &mdash; shuffling&hellip;" : "Locked in. Waiting for opponent&hellip;"}</div>`;
  } else {
    html += `
      <div class="mulligan-actions" id="sbActions">
        <button class="start-btn sideboard-lock-btn" id="sbLockBtn" type="button" ${!sizesOk || _sbLockSent ? "disabled" : ""}>${k === 0 ? "Lock in (no changes)" : `Lock in (${k} swap${k === 1 ? "" : "s"})`}</button>
      </div>
      <div id="sbStatus" class="pregame-info">${_sbPick.main || _sbPick.side ? "Now pick a card in the other column to complete the swap &middot; Esc to cancel" : "Decks are shuffled and hands drawn once both players lock in"}</div>
    `;
  }
  if (pregame.sandbox) {
    html += `<label class="sb-skip"><input type="checkbox" id="sbSkipToggle" ${sideboardSkipPreferred() ? "checked" : ""}> Skip sideboarding in practice games</label>`;
  }

  container.innerHTML = html;
  wireSideboardStep(container, you, locked);
}

function wireSideboardStep(container, you, locked) {
  const skip = container.querySelector("#sbSkipToggle");
  if (skip) skip.addEventListener("change", () => setSideboardSkipPreferred(skip.checked));
  const lockBtn = container.querySelector("#sbLockBtn");
  if (lockBtn) lockBtn.addEventListener("click", () => { lockBtn.disabled = true; lockBtn.textContent = "Locking in…"; sendSideboardLock(); });
  container.querySelectorAll(".sb-undo").forEach((btn) => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Undo = swap the pair back: the side-origin card leaves the main deck, the main-origin card returns.
    sendSideboardSwap(btn.dataset.sbUndoIn, btn.dataset.sbUndoOut);
  }));

  container.querySelectorAll(".sideboard-overlay__row").forEach((row) => {
    row.addEventListener("mouseenter", () => sbShowPreview(row));
    row.addEventListener("mouseleave", () => { if (typeof hidePreview === "function") hidePreview(); });
    if (locked) return;
    row.addEventListener("click", () => sbPickRow(row.dataset.sbCol, row.dataset.sbId, container));
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", JSON.stringify({ col: row.dataset.sbCol, id: row.dataset.sbId }));
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("sb-dragging");
    });
    row.addEventListener("dragend", () => row.classList.remove("sb-dragging"));
    row.addEventListener("dragover", (e) => { e.preventDefault(); row.classList.add("sb-drop-target"); });
    row.addEventListener("dragleave", () => row.classList.remove("sb-drop-target"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("sb-drop-target");
      let src = null;
      try { src = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
      if (!src || src.col === row.dataset.sbCol) return;
      const outId = src.col === "main" ? src.id : row.dataset.sbId;
      const inId = src.col === "side" ? src.id : row.dataset.sbId;
      _sbPick = { main: null, side: null };
      sendSideboardSwap(outId, inId);
    });
  });
}

function sbPickRow(col, id, container) {
  if (_sbPick[col] === id) {
    _sbPick[col] = null; // Toggle off
  } else {
    _sbPick[col] = id;
  }
  if (_sbPick.main && _sbPick.side) {
    const { main, side } = _sbPick;
    _sbPick = { main: null, side: null };
    sendSideboardSwap(main, side);
    return;
  }
  // Re-mark selection without a server round-trip.
  container.querySelectorAll(".sideboard-overlay__row").forEach((row) => {
    row.classList.toggle("sb-selected", _sbPick[row.dataset.sbCol] === row.dataset.sbId);
  });
  const status = container.querySelector("#sbStatus");
  if (status) status.textContent = _sbPick.main || _sbPick.side
    ? "Now pick a card in the other column to complete the swap · Esc to cancel"
    : "Decks are shuffled and hands drawn once both players lock in";
}

/** Hover = enlarged card image only (DESIGN.md), positioned beside the row and clamped to the viewport. */
function sbShowPreview(row) {
  const previewEl = document.getElementById("cardPreview");
  const img = document.getElementById("previewImg");
  if (!previewEl || !img) return;
  img.src = `/card-image/${row.dataset.defId}`;
  img.onerror = function() { this.style.display = "none"; };
  img.onload = function() { this.style.display = "block"; };
  for (const id of ["previewName", "previewType", "previewText", "previewStats"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  }
  previewEl.classList.add("visible");
  const rect = row.getBoundingClientRect();
  const w = previewEl.offsetWidth || 236;
  const h = previewEl.offsetHeight || 330;
  // Keep the image off the OTHER column: outside edge of the hovered column, else the far viewport edge.
  let left = row.dataset.sbCol === "main" ? rect.left - w - 12 : rect.right + 12;
  if (left < 8 || left + w > window.innerWidth - 8) left = row.dataset.sbCol === "main" ? window.innerWidth - w - 8 : 8;
  let top = rect.top + rect.height / 2 - h / 2;
  top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
  previewEl.style.left = left + "px";
  previewEl.style.top = top + "px";
}

// Esc cancels a half-made pick.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || (!_sbPick.main && !_sbPick.side)) return;
  if (!pregameState || pregameState.phase !== "sideboard") return;
  _sbPick = { main: null, side: null };
  document.querySelectorAll("#pregameContent .sideboard-overlay__row.sb-selected").forEach((r) => r.classList.remove("sb-selected"));
});

/**
 * Entry point (kept from the W14 scaffold): sync the sideboarding UI to the
 * current phase. Safe to call on every frame.
 */
function maybeRenderSideboardOverlay(state, pregame) {
  const legacyMount = document.getElementById("sideboard-overlay-mount");
  if (legacyMount && legacyMount.classList.contains("visible")) hideSideboardOverlay();
  if (!pregame || pregame.phase !== "sideboard") {
    _sbPick = { main: null, side: null };
    _sbAutoSkipped = false;
    return;
  }
  const overlay = document.getElementById("pregameOverlay");
  const content = document.getElementById("pregameContent");
  if (!overlay || !content) return;
  overlay.classList.add("visible");
  content.classList.add("sideboard-step");
  renderSideboardStep(pregame, content);
}

/** Clears the legacy in-wrapper mount (#sideboard-overlay-mount); the live UI is the pregame overlay step. */
function hideSideboardOverlay() {
  const mount = document.getElementById("sideboard-overlay-mount");
  if (!mount) return;
  mount.innerHTML = "";
  mount.classList.remove("visible");
}

if (typeof window !== "undefined") {
  window.hideSideboardOverlay = hideSideboardOverlay;
  window.setSideboardSkipPreferred = setSideboardSkipPreferred;
}
