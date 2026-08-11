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
  // Sideboarding step styles (public/css/sideboard.css) — own sheet so the step never depends on gameplay.css edits.
  if (document.head && !document.querySelector('link[data-sb-css]')) {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = "/css/sideboard.css"; l.dataset.sbCss = "1";
    document.head.appendChild(l);
  }
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

// Pregame "sideboard" step: dense two-column Main | Side lists,
// one row per distinct card with quantity steppers, stable row order, ghost
// incoming rows, swap summary + validation, keyboard (↑/↓ select, −/+ ←/→ adjust).

/* ============================================================
   Server contract (server/pregame.ts §Sideboarding — assumed OP
   policy, not Core Rules): between games of a match, after the
   reveal and BEFORE hands are drawn, each player may swap cards
   1-for-1 between main deck and sideboard, privately, then lock in.
     pregame.phase === "sideboard"
     pregame.you      = { main:[{id,defId,name,cardType,energyCost}], side:[…],
                          locked, mainSize, sideSize, sideMax, championName }
     pregame.opponent = { name, legend, champion, battlefields:[{id,name}], status:"choosing"|"locked" }
   Instance ids encode origin: "<pid>-main-<i>-<defId>" / "<pid>-side-<i>-<defId>".
   Client → server (at lock time, one frame):
     {type:"sideboard_lock", swaps:[{out:<id now in main>, in:<id now in side>}, …]}
   The server applies the batch atomically then locks ({type:"sideboard_swap", out, in}
   per swap still exists). Quantities are edited locally; nothing is sent until Lock in.

   MODEL. One entry per distinct defId: m0 = registered copies in main, s0 = in side
   (from the origin tags, so a reconnect after earlier swaps still knows the baseline);
   delta = net copies moved side→main (+) / main→side (−), −m0 ≤ delta ≤ s0.
   Row order is fixed when the step starts (type, cost, name) and NEVER changes:
   Main column = every card with m0>0, Side column = every card with s0>0; copies
   arriving in a column that has no row for that card show as GHOST rows appended
   at the bottom ("+2 Frigid Touch ← main"). Main must return to its size (Σdelta = 0)
   before Lock in is enabled.
   ============================================================ */

const SB_SKIP_KEY = "rb-skip-sideboarding";
const SB_TYPE_ORDER = { unit: 0, champion: 0, spell: 1, gear: 2, equipment: 2 };

let _sb = null;            // Step model — persists across sync re-renders; rebuilt when the step identity changes
let _sbLast = null;        // { pregame, container } for local re-renders
let _sbLockSent = false;
let _sbAutoSkipped = false;
let _sbSendImpl = null;    // Test seam (sbSetTransport)

function sideboardSkipPreferred() {
  try { return localStorage.getItem(SB_SKIP_KEY) === "1"; } catch { return false; }
}
function setSideboardSkipPreferred(on) {
  try { localStorage.setItem(SB_SKIP_KEY, on ? "1" : "0"); } catch { /* private mode */ }
}

function sbEsc(s) {
  if (typeof esc === "function") return esc(String(s));
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sbSend(msg) {
  if (_sbSendImpl) return _sbSendImpl(msg) !== false;
  if (typeof ws === "undefined" || !ws || ws.readyState !== 1) return false;
  ws.send(JSON.stringify(msg));
  return true;
}
function sbSetTransport(fn) { _sbSendImpl = fn; }

/* ---------------- model ---------------- */

function sbOrigin(card, currentCol) {
  const id = String(card.id || "");
  if (id.includes("-side-")) return "side";
  if (id.includes("-main-")) return "main";
  return currentCol;
}

function sbHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function sbStepKey(you, gid) {
  const ids = [...(you.main || []), ...(you.side || [])].map((c) => c.id).sort();
  return `${gid || "g"}:${ids.length}:${sbHash(ids.join(","))}`;
}

function sbCompare(a, b) {
  const ta = SB_TYPE_ORDER[a.cardType] ?? 9;
  const tb = SB_TYPE_ORDER[b.cardType] ?? 9;
  return ta - tb || (a.energyCost ?? 99) - (b.energyCost ?? 99) || String(a.name).localeCompare(String(b.name)) || String(a.defId).localeCompare(String(b.defId));
}

/**
 * Build the step model from the server's `you` section. `rules` = /api/config deckRules
 * (sideboardMax fallback). Row order is computed here once and kept for the whole step.
 */
function sbBuildModel(you, rules, gid) {
  const cards = new Map();
  const note = (c, origin) => {
    let e = cards.get(c.defId);
    if (!e) {
      e = { cardType: c.cardType, defId: c.defId, energyCost: c.energyCost, m0: 0, name: c.name || c.defId, s0: 0 };
      cards.set(c.defId, e);
    }
    if (origin === "main") e.m0++; else e.s0++;
  };
  for (const c of you.main || []) note(c, sbOrigin(c, "main"));
  for (const c of you.side || []) note(c, sbOrigin(c, "side"));
  const curM = new Map();
  for (const c of you.main || []) curM.set(c.defId, (curM.get(c.defId) || 0) + 1);
  const sorted = [...cards.values()].sort(sbCompare);
  const delta = {};
  for (const e of sorted) delta[e.defId] = (curM.get(e.defId) || 0) - e.m0;
  return {
    cards,
    delta,
    key: sbStepKey(you, gid),
    mainRows: sorted.filter((e) => e.m0 > 0).map((e) => e.defId),
    mainSize: you.mainSize ?? (you.main || []).length,
    sel: null, // { col: "main"|"side", defId }
    sideMax: you.sideMax ?? rules?.sideboardMax ?? 10,
    sideRows: sorted.filter((e) => e.s0 > 0).map((e) => e.defId),
    sideSize: you.sideSize ?? (you.side || []).length,
  };
}

function sbMainCount(model, defId) { const e = model.cards.get(defId); return e ? e.m0 + (model.delta[defId] || 0) : 0; }
function sbSideCount(model, defId) { const e = model.cards.get(defId); return e ? e.s0 - (model.delta[defId] || 0) : 0; }

/** dir +1 = one copy side→main, −1 = one copy main→side. */
function sbCanAdjust(model, defId, dir) {
  const e = model.cards.get(defId);
  if (!e) return false;
  const d = model.delta[defId] || 0;
  return dir > 0 ? d < e.s0 : e.m0 + d > 0;
}
function sbAdjust(model, defId, dir) {
  if (!sbCanAdjust(model, defId, dir)) return false;
  model.delta[defId] = (model.delta[defId] || 0) + (dir > 0 ? 1 : -1);
  return true;
}
function sbReset(model) { for (const k of Object.keys(model.delta)) model.delta[k] = 0; }

function sbNet(model) { let n = 0; for (const k of Object.keys(model.delta)) n += model.delta[k] || 0; return n; }
function sbTotals(model) { const net = sbNet(model); return { main: model.mainSize + net, net, side: model.sideSize - net }; }

/** { ok, reason, warn } — Lock in is enabled only when ok. */
function sbValidity(model) {
  const t = sbTotals(model);
  if (t.net > 0) return { ok: false, reason: `Main deck is ${t.main}/${model.mainSize} — send ${t.net} more card${t.net === 1 ? "" : "s"} to the sideboard (swaps are 1-for-1)`, warn: null };
  if (t.net < 0) return { ok: false, reason: `Main deck is ${t.main}/${model.mainSize} — bring ${-t.net} more card${t.net === -1 ? "" : "s"} in from the sideboard (swaps are 1-for-1)`, warn: null };
  const warn = t.side > model.sideMax ? `Sideboard ${t.side}/${model.sideMax} is over the cap (not tournament-legal)` : null;
  return { ok: true, reason: null, warn };
}

/** Outs (main→side) / ins (side→main) by card, in fixed row order, plus the swap count. */
function sbSummary(model) {
  const order = [...model.mainRows, ...model.sideRows.filter((d) => !model.mainRows.includes(d))];
  const outs = [];
  const ins = [];
  for (const defId of order) {
    const d = model.delta[defId] || 0;
    const name = model.cards.get(defId).name;
    if (d < 0) outs.push({ count: -d, defId, name });
    if (d > 0) ins.push({ count: d, defId, name });
  }
  const nOut = outs.reduce((s, x) => s + x.count, 0);
  const nIn = ins.reduce((s, x) => s + x.count, 0);
  let text = "No swaps";
  if (nOut || nIn) {
    const parts = [];
    if (outs.length) parts.push(outs.map((x) => `−${x.count} ${x.name}`).join(", "));
    if (ins.length) parts.push(ins.map((x) => `+${x.count} ${x.name}`).join(", "));
    text = parts.join(" · ");
  }
  return { ins, nIn, nOut, outs, swaps: Math.max(nIn, nOut), text };
}

/**
 * Turn the quantity deltas into concrete 1-for-1 swaps against the server's CURRENT
 * lists (`you`): for each card, desired copies in main = m0 + delta; move instances
 * to make it so (preferring to send back cards that already crossed, so an undo
 * restores the registered instances). Balanced ⇔ Σdelta = 0.
 */
function sbComputeSwaps(model, you) {
  const inMain = new Map();
  const inSide = new Map();
  for (const c of you.main || []) { if (!inMain.has(c.defId)) inMain.set(c.defId, []); inMain.get(c.defId).push(c); }
  for (const c of you.side || []) { if (!inSide.has(c.defId)) inSide.set(c.defId, []); inSide.get(c.defId).push(c); }
  const outgoing = []; // Ids now in main that must end in side
  const incoming = []; // Ids now in side that must end in main
  for (const [defId, e] of model.cards) {
    const want = e.m0 + (model.delta[defId] || 0);
    const have = (inMain.get(defId) || []).length;
    if (want < have) {
      const pool = [...(inMain.get(defId) || [])].sort((a, b) => (sbOrigin(a, "main") === "side" ? 0 : 1) - (sbOrigin(b, "main") === "side" ? 0 : 1));
      outgoing.push(...pool.slice(0, have - want).map((c) => c.id));
    } else if (want > have) {
      const pool = [...(inSide.get(defId) || [])].sort((a, b) => (sbOrigin(a, "side") === "main" ? 0 : 1) - (sbOrigin(b, "side") === "main" ? 0 : 1));
      incoming.push(...pool.slice(0, want - have).map((c) => c.id));
    }
  }
  const n = Math.min(outgoing.length, incoming.length);
  const swaps = [];
  for (let i = 0; i < n; i++) swaps.push({ in: incoming[i], out: outgoing[i] });
  return { balanced: outgoing.length === incoming.length, incoming, outgoing, swaps };
}

/** The frame(s) Lock in sends: one `sideboard_lock` carrying the batch of swaps. */
function sbLockMessages(model, you) {
  const { swaps } = sbComputeSwaps(model, you);
  return [{ swaps, type: "sideboard_lock" }];
}

/** Visible rows of one column in DOM order: fixed real rows, then ghost rows (other column's order). */
function sbColumnRows(model, col) {
  const own = col === "main" ? model.mainRows : model.sideRows;
  const other = col === "main" ? model.sideRows : model.mainRows;
  const rows = own.map((defId) => ({ col, defId, ghost: false }));
  for (const defId of other) {
    if (own.includes(defId)) continue;
    const arriving = col === "main" ? (model.delta[defId] || 0) : -(model.delta[defId] || 0);
    if (arriving > 0) rows.push({ col, defId, ghost: true });
  }
  return rows;
}
function sbAllRows(model) { return [...sbColumnRows(model, "main"), ...sbColumnRows(model, "side")]; }

/* ---------------- persistence (reload mid-step keeps pending quantities) ---------------- */

function sbPersist(model) {
  try { sessionStorage.setItem(`rb-sb:${model.key}`, JSON.stringify(model.delta)); } catch { /* private mode */ }
}
function sbRestore(model) {
  let raw = null;
  try { raw = sessionStorage.getItem(`rb-sb:${model.key}`); } catch { /* private mode */ }
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    for (const [defId, e] of model.cards) {
      const d = Number(saved?.[defId]);
      if (Number.isInteger(d)) model.delta[defId] = Math.max(-e.m0, Math.min(e.s0, d));
    }
  } catch { /* corrupt */ }
}

/* ---------------- rendering (pure → HTML strings) ---------------- */

function sbRowHtml(model, row, opts) {
  const { col, defId, ghost } = row;
  const e = model.cards.get(defId);
  const d = model.delta[defId] || 0;
  const readOnly = Boolean(opts && opts.readOnly);
  const selected = !readOnly && model.sel && model.sel.col === col && model.sel.defId === defId;
  const cost = e.energyCost != null ? sbEsc(String(e.energyCost)) : "&ndash;";
  // Column semantics: "−" sends one copy to the OTHER column, "+" pulls one copy in.
  const minusDir = col === "main" ? -1 : +1;
  const plusDir = -minusDir;
  const steps = readOnly ? "" : `
      <span class="sb-row__steps">
        <button type="button" class="sb-step" data-sb-dir="${minusDir}" ${sbCanAdjust(model, defId, minusDir) ? "" : "disabled"} title="${col === "main" ? "Send one copy to the sideboard" : "Bring one copy into the main deck"}" aria-label="minus">&minus;</button>
        <button type="button" class="sb-step" data-sb-dir="${plusDir}" ${sbCanAdjust(model, defId, plusDir) ? "" : "disabled"} title="${col === "main" ? "Pull one copy back / in from the sideboard" : "Pull one copy back / in from the main deck"}" aria-label="plus">+</button>
      </span>`;
  if (ghost) {
    const n = col === "main" ? d : -d;
    return `
    <div class="sideboard-overlay__row sb-row sb-row--ghost${selected ? " sb-row--sel" : ""}" data-sb-col="${col}" data-sb-def="${sbEsc(defId)}" data-def-id="${sbEsc(defId)}" data-sb-ghost="1" title="${sbEsc(e.name)}">
      <span class="sb-row__cost">${cost}</span>
      <span class="sb-row__name"><span class="sb-badge sb-badge--in">+${n}</span> ${sbEsc(e.name)} <span class="sb-row__from">&larr; ${col === "main" ? "side" : "main"}</span></span>
      <span class="sb-row__qty">&times;${n}</span>${steps}
    </div>`;
  }
  const base = col === "main" ? e.m0 : e.s0;
  const now = col === "main" ? sbMainCount(model, defId) : sbSideCount(model, defId);
  const changed = now !== base;
  let qty = `&times;${base}`;
  let note = "";
  if (changed) {
    qty = `&times;${base} &rarr; &times;${now}`;
    note = now < base
      ? `<span class="sb-row__delta sb-badge sb-badge--out">${base - now} &rarr; ${col === "main" ? "side" : "main"}</span>`
      : `<span class="sb-row__delta sb-badge sb-badge--in">+${now - base} &larr; ${col === "main" ? "side" : "main"}</span>`;
  }
  return `
    <div class="sideboard-overlay__row sb-row${changed ? " sb-row--changed" : ""}${selected ? " sb-row--sel" : ""}${now === 0 ? " sb-row--zero" : ""}" data-sb-col="${col}" data-sb-def="${sbEsc(defId)}" data-def-id="${sbEsc(defId)}" ${readOnly ? "" : 'draggable="true"'} title="${sbEsc(e.name)}">
      <span class="sb-row__cost">${cost}</span>
      <span class="sb-row__name">${sbEsc(e.name)}</span>
      ${note}<span class="sb-row__qty">${qty}</span>${steps}
    </div>`;
}

function sbColumnHtml(model, col, opts) {
  const rows = sbColumnRows(model, col);
  const t = sbTotals(model);
  const readOnly = Boolean(opts && opts.readOnly);
  const head = col === "main"
    ? `Main <b id="sbMainCount" class="${t.main !== model.mainSize ? "sb-count--bad" : ""}">${t.main}</b>/${model.mainSize}${opts && opts.championName ? ` <span class="sb-sub">+ ${sbEsc(opts.championName)}</span>` : ""}`
    : `Side <b id="sbSideCount" class="${t.side > model.sideMax ? "sb-count--bad" : ""}">${t.side}</b>/${model.sideMax}`;
  const empty = col === "main" ? "No cards in main deck." : "Sideboard is empty.";
  return `
      <div class="sideboard-overlay__col sb-col" data-sb-drop="${col}">
        <div class="sideboard-overlay__list sb-list" id="${col === "main" ? "sbMainList" : "sbSideList"}">
          <div class="sideboard-overlay__col-header sb-col__head">${head}${readOnly ? "" : `<span class="sb-col__hint">${col === "main" ? "&minus; to side &middot; + back" : "&minus; to main &middot; + back"}</span>`}</div>
          ${rows.map((r) => sbRowHtml(model, r, opts)).join("") || `<div class="sideboard-overlay__empty">${empty}</div>`}
        </div>
      </div>`;
}

/** Columns + summary strip + validation + Lock/Reset (the interactive body of the step). */
function sbBodyHtml(model, opts) {
  const readOnly = Boolean(opts && opts.readOnly);
  const sum = sbSummary(model);
  const v = sbValidity(model);
  const lockSent = Boolean(opts && opts.lockSent);
  const lockLabel = lockSent ? "Locking in&hellip;" : sum.swaps === 0 ? "Lock in (no changes)" : `Lock in (${sum.swaps} swap${sum.swaps === 1 ? "" : "s"})`;
  let html = `
    <div class="sideboard-overlay__columns sb-columns sb2${readOnly ? " sb-locked" : ""}" id="sbColumns">
      ${sbColumnHtml(model, "main", opts)}
      ${sbColumnHtml(model, "side", opts)}
    </div>
    <div class="sb-summary" id="sbSwaps">
      <span class="sb-swaps-label">Swaps (<b id="sbSwapCount">${sum.swaps}</b>):</span>
      <span class="sb-summary__text" id="sbSummaryText">${sum.outs.map((x) => `<span class="sb-swap-chip sb-swap-chip--out">&minus;${x.count} ${sbEsc(x.name)}</span>`).join(" ")}${sum.outs.length && sum.ins.length ? ' <span class="sb-summary__sep">&middot;</span> ' : ""}${sum.ins.map((x) => `<span class="sb-swap-chip sb-swap-chip--in">+${x.count} ${sbEsc(x.name)}</span>`).join(" ")}${sum.swaps === 0 && sum.nIn === 0 && sum.nOut === 0 ? '<span class="sb-summary__none">none yet &mdash; use &minus; / + on a row</span>' : ""}</span>
      ${readOnly ? "" : `<button type="button" class="sb-reset" id="sbResetBtn" ${sum.nIn === 0 && sum.nOut === 0 ? "disabled" : ""} title="Back to the registered configuration">Reset</button>`}
    </div>`;
  if (!readOnly) {
    html += `
    <div id="sbValidity" class="sb-validity${v.ok ? (v.warn ? " sb-validity--warn" : " sb-validity--ok") : " sb-validity--bad"}">${sbEsc(v.ok ? (v.warn || "Sizes OK — main deck returns to " + model.mainSize) : v.reason)}</div>
    <div class="mulligan-actions sb-actions" id="sbActions">
      <button class="start-btn sideboard-lock-btn" id="sbLockBtn" type="button" ${!v.ok || lockSent ? "disabled" : ""} title="${sbEsc(v.ok ? "Apply these swaps and lock in" : v.reason)}">${lockLabel}</button>
    </div>
    <div id="sbStatus" class="pregame-info">&uarr;/&darr; select a row &middot; &minus;/+ or &larr;/&rarr; adjust &middot; drag a row across &middot; decks are shuffled and hands drawn once both players lock in</div>`;
  }
  return html;
}

function sbHeaderHtml(pregame) {
  const opp = pregame.opponent || {};
  const oppBits = [];
  if (opp.legend) oppBits.push(`Legend <b>${sbEsc(opp.legend.name)}</b>`);
  if (opp.champion) oppBits.push(`Champion <b>${sbEsc(opp.champion.name)}</b>`);
  if ((opp.battlefields || []).length) oppBits.push(`Battlefield <b>${opp.battlefields.map((b) => sbEsc(b.name)).join(", ")}</b>`);
  const oppStatus = opp.status === "locked"
    ? `<span class="sb-status sb-status--locked">Locked in</span>`
    : `<span class="sb-status sb-status--choosing">Sideboarding&hellip;</span>`;
  const myBf = pregame.battlefieldSelectedName
    ? ` <span class="sb-mybf">&middot; Your battlefield: <b>${sbEsc(pregame.battlefieldSelectedName)}</b>${pregame.battlefieldRandom ? " (random)" : ""}</span>`
    : "";
  return `
    <div class="pregame-title sb-title">Sideboarding</div>
    <div class="pregame-subtitle sb-subtitle">Swap cards 1-for-1 between main deck and sideboard before opening hands are drawn. Your opponent only sees when you lock in.</div>
    <div class="sb-opponent" id="sbOpponent">
      <span class="sb-opp-name">${sbEsc(opp.name || "Opponent")}</span> revealed: ${oppBits.join(" &middot; ") || "&mdash;"} ${oppStatus}${myBf}
    </div>`;
}

/** Whole step HTML for a pregame frame + model (pure; the DOM entry point is renderSideboardStep). */
function sbStepHtml(pregame, model, opts) {
  const you = pregame.you;
  const opp = pregame.opponent || {};
  let html = sbHeaderHtml(pregame);
  if (!you) {
    return html + `<div class="pregame-waiting">Spectating &mdash; waiting for both players to lock in&hellip;</div>`;
  }
  if (you.locked) {
    html += sbBodyHtml(model, { championName: you.championName, readOnly: true });
    html += `<div class="pregame-waiting" id="sbWaiting">${opp.status === "locked" ? "Both locked in &mdash; shuffling&hellip;" : "Locked in. Waiting for opponent&hellip;"}</div>`;
  } else {
    html += sbBodyHtml(model, { championName: you.championName, lockSent: Boolean(opts && opts.lockSent), readOnly: false });
  }
  if (pregame.sandbox) {
    html += `<label class="sb-skip"><input type="checkbox" id="sbSkipToggle" ${sideboardSkipPreferred() ? "checked" : ""}> Skip sideboarding in practice games</label>`;
  }
  return html;
}

/* ---------------- DOM: render + wire ---------------- */

function renderSideboardStep(pregame, container) {
  if (!container) return;
  const you = pregame.you;
  _sbLast = { container, pregame };

  // Practice games: honour "Skip sideboarding" — lock in immediately, once.
  if (pregame.sandbox && you && !you.locked && !_sbAutoSkipped && sideboardSkipPreferred()) {
    _sbAutoSkipped = true;
    _sbLockSent = true;
    sbSend({ swaps: [], type: "sideboard_lock" });
  }

  let model = null;
  if (you) {
    const gid = typeof gameId !== "undefined" ? gameId : null;
    const rules = typeof window !== "undefined" ? window.deckRules : null;
    if (you.locked) {
      // Read-only view of what the server holds (our swaps applied), same fixed order.
      model = sbBuildModel(you, rules, gid);
      if (_sb && _sb.key === model.key) { model.mainRows = _sb.mainRows; model.sideRows = _sb.sideRows; }
    } else {
      const key = sbStepKey(you, gid);
      if (!_sb || _sb.key !== key) {
        _sb = sbBuildModel(you, rules, gid);
        sbRestore(_sb);
        _sbLockSent = false;
      }
      model = _sb;
    }
  }

  // Preserve list scroll across re-renders (row order is stable, so this is enough).
  const scroll = {};
  for (const id of ["sbMainList", "sbSideList"]) { const el = container.querySelector(`#${id}`); if (el) scroll[id] = el.scrollTop; }
  container.innerHTML = sbStepHtml(pregame, model, { lockSent: _sbLockSent });
  for (const id of Object.keys(scroll)) { const el = container.querySelector(`#${id}`); if (el) el.scrollTop = scroll[id]; }
  wireSideboardStep(container, pregame, model);
}

function sbRerender() {
  if (_sbLast) renderSideboardStep(_sbLast.pregame, _sbLast.container);
}

function sbApply(defId, dir, col) {
  if (!_sb || !sbAdjust(_sb, defId, dir)) return false;
  _sb.sel = { col: col || (_sb.mainRows.includes(defId) ? "main" : "side"), defId };
  // A ghost row that just emptied: keep the selection on the card's real row.
  const rows = sbAllRows(_sb);
  if (!rows.some((r) => r.col === _sb.sel.col && r.defId === defId)) {
    const real = rows.find((r) => r.defId === defId);
    _sb.sel = real ? { col: real.col, defId } : null;
  }
  sbPersist(_sb);
  sbRerender();
  const selEl = _sbLast && _sb.sel ? _sbLast.container.querySelector(`.sb-row[data-sb-col="${_sb.sel.col}"][data-sb-def="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(_sb.sel.defId) : _sb.sel.defId}"]`) : null;
  if (selEl && selEl.scrollIntoView) selEl.scrollIntoView({ block: "nearest" });
  return true;
}

function sbLockNow() {
  if (!_sb || !_sbLast || _sbLockSent) return;
  const you = _sbLast.pregame.you;
  if (!you || !sbValidity(_sb).ok) return;
  const [msg] = sbLockMessages(_sb, you);
  _sbLockSent = sbSend(msg);
  sbRerender();
}

function wireSideboardStep(container, pregame, model) {
  const skip = container.querySelector("#sbSkipToggle");
  if (skip) skip.addEventListener("change", () => setSideboardSkipPreferred(skip.checked));
  container.querySelectorAll(".sb-row").forEach((row) => {
    row.addEventListener("mouseenter", () => sbShowPreview(row));
    row.addEventListener("mouseleave", () => { if (typeof hidePreview === "function") hidePreview(); });
  });
  if (!model || !pregame.you || pregame.you.locked) return;

  const lockBtn = container.querySelector("#sbLockBtn");
  if (lockBtn) lockBtn.addEventListener("click", sbLockNow);
  const resetBtn = container.querySelector("#sbResetBtn");
  if (resetBtn) resetBtn.addEventListener("click", () => { sbReset(_sb); sbPersist(_sb); sbRerender(); });

  container.querySelectorAll(".sb-step").forEach((btn) => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const row = btn.closest(".sb-row");
    if (row) sbApply(row.dataset.sbDef, Number(btn.dataset.sbDir), row.dataset.sbCol);
  }));
  container.querySelectorAll(".sb-row").forEach((row) => {
    row.addEventListener("click", () => { _sb.sel = { col: row.dataset.sbCol, defId: row.dataset.sbDef }; sbRerender(); });
    // Drag a row onto the OTHER column = send one copy across (same as its "−").
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", JSON.stringify({ col: row.dataset.sbCol, defId: row.dataset.sbDef }));
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("sb-dragging");
    });
    row.addEventListener("dragend", () => row.classList.remove("sb-dragging"));
  });
  container.querySelectorAll("[data-sb-drop]").forEach((colEl) => {
    colEl.addEventListener("dragover", (e) => { e.preventDefault(); colEl.classList.add("sb-drop-target"); });
    colEl.addEventListener("dragleave", () => colEl.classList.remove("sb-drop-target"));
    colEl.addEventListener("drop", (e) => {
      e.preventDefault();
      colEl.classList.remove("sb-drop-target");
      let src = null;
      try { src = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
      if (!src || src.col === colEl.dataset.sbDrop) return;
      sbApply(src.defId, colEl.dataset.sbDrop === "main" ? +1 : -1);
    });
  });
}

/** Keyboard: ↑/↓ select a row, −/← send one across ("−" of that column), +/=/→ pull one back. */
function sbHandleKeydown(e) {
  if (!_sb || !_sbLast || !_sbLast.pregame.you || _sbLast.pregame.you.locked) return false;
  if (typeof pregameState !== "undefined" && (!pregameState || pregameState.phase !== "sideboard")) return false;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const rows = sbAllRows(_sb);
  if (rows.length === 0) return false;
  const idx = _sb.sel ? rows.findIndex((r) => r.col === _sb.sel.col && r.defId === _sb.sel.defId) : -1;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const next = idx === -1 ? 0 : Math.max(0, Math.min(rows.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)));
    _sb.sel = { col: rows[next].col, defId: rows[next].defId };
    sbRerender();
    const selEl = _sbLast.container.querySelector(`.sb-row.sb-row--sel`);
    if (selEl && selEl.scrollIntoView) selEl.scrollIntoView({ block: "nearest" });
    e.preventDefault();
    return true;
  }
  if (idx === -1) return false;
  const sel = rows[idx];
  const minusDir = sel.col === "main" ? -1 : +1;
  if (e.key === "-" || e.key === "ArrowLeft" || e.key === "Subtract") { sbApply(sel.defId, minusDir, sel.col); e.preventDefault(); return true; }
  if (e.key === "+" || e.key === "=" || e.key === "ArrowRight" || e.key === "Add") { sbApply(sel.defId, -minusDir, sel.col); e.preventDefault(); return true; }
  if (e.key === "Escape" && _sb.sel) { _sb.sel = null; sbRerender(); return true; }
  return false;
}
if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => { sbHandleKeydown(e); }, true);
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

/**
 * Entry point from handlePregameSync: sync the sideboarding UI to the current
 * phase. Safe to call on every frame.
 */
function maybeRenderSideboardOverlay(state, pregame) {
  const legacyMount = document.getElementById("sideboard-overlay-mount");
  if (legacyMount && legacyMount.classList.contains("visible")) hideSideboardOverlay();
  if (!pregame || pregame.phase !== "sideboard") {
    _sb = null;
    _sbLast = null;
    _sbAutoSkipped = false;
    return;
  }
  const overlay = document.getElementById("pregameOverlay");
  const content = document.getElementById("pregameContent");
  if (!overlay || !content) return;
  overlay.classList.add("visible");
  content.classList.add("sideboard-step");
  // A refused lock (error frame; websocket.js re-renders us right after recording it) re-arms the button.
  const last = typeof window !== "undefined" ? window.__rbLastFrame : null;
  if (last && last.type === "error" && last.errorCode === "SIDEBOARD_LOCK" && Date.now() - (last.at || 0) < 1500) _sbLockSent = false;
  renderSideboardStep(pregame, content);
}

/** Clears the legacy in-wrapper mount (#sideboard-overlay-mount); the live UI is the pregame overlay step. */
function hideSideboardOverlay() {
  const mount = document.getElementById("sideboard-overlay-mount");
  if (!mount) return;
  mount.innerHTML = "";
  mount.classList.remove("visible");
}

/**
 * Dev/test hook: `/play?debugSideboard=1` renders the step from a synthetic
 * pregame frame (no server, nothing is sent) so the layout can be eyeballed
 * without playing to game 2 of a Bo3.
 */
function sbDebugMount() {
  if (typeof location === "undefined" || !/[?&]debugSideboard=1\b/.test(location.search)) return;
  const mk = (col, defs) => defs.flatMap(([defId, name, cardType, energyCost, n], j) => Array.from({ length: n }, (_, i) => ({ cardType, defId, energyCost, id: `player-1-${col}-${j * 4 + i}-${defId}`, name })));
  const main = mk("main", [
    ["ogn-004-298", "Cleave", "spell", 1, 3], ["ogn-169-298", "Gust", "spell", 1, 2], ["ogn-009-298", "Hextech Ray", "spell", 1, 3],
    ["ogn-006-298", "Flame Chompers", "unit", 3, 3], ["ogn-016-298", "Dangerous Duo", "unit", 3, 3], ["ogn-018-298", "Noxus Saboteur", "unit", 3, 3],
    ["ogn-037-298", "Immortal Phoenix", "unit", 3, 2], ["ogn-165-298", "Cemetery Attendant", "unit", 3, 3], ["ogn-185-298", "Traveling Merchant", "unit", 2, 3],
    ["ogn-199-298", "Tideturner", "unit", 2, 3], ["sfd-007-221", "Gem Jammer", "unit", 2, 3], ["sfd-013-221", "Blast Corps Cadet", "unit", 2, 2],
    ["sfd-122-221", "Called Shot", "spell", 0, 2], ["ogn-040-298", "Seal of Rage", "gear", 0, 2], ["sfd-009-221", "Serrated Dirk", "equipment", 1, 2], ["unl-002-219", "Inferna", "unit", 2, 1],
  ]);
  const side = mk("side", [["ogn-005-298", "Disintegrate", "spell", 4, 3], ["ogn-008-298", "Get Excited!", "spell", 2, 2], ["ogn-022-298", "Thermo Beam", "spell", 5, 2], ["ogn-004-298", "Cleave", "spell", 1, 0], ["ogn-169-298", "Gust", "spell", 1, 1], ["ogn-014-298", "Sky Splitter", "spell", 8, 1]]);
  const pregame = {
    battlefieldSelectedName: "Zaun Warrens", opponent: { battlefields: [{ id: "x", name: "Targon's Peak" }], champion: { id: "c", name: "Jinx, Loose Cannon" }, legend: { id: "l", name: "Jinx" }, name: "Goldfish", status: "locked" },
    phase: "sideboard", sandbox: false, you: { championName: "Jinx, Loose Cannon", locked: false, main, mainSize: main.length, side, sideMax: 10, sideSize: side.length },
  };
  if (typeof pregameState !== "undefined") { try { pregameState = pregame; } catch { /* const elsewhere */ } }
  sbSetTransport((msg) => { console.log("[debugSideboard] would send", msg); if (typeof showToast === "function") showToast(`debugSideboard: ${msg.type} (${(msg.swaps || []).length} swaps)`); return true; });
  document.getElementById("startScreen")?.classList.add("hidden");
  maybeRenderSideboardOverlay(null, pregame);
}
if (typeof document !== "undefined" && typeof location !== "undefined" && /[?&]debugSideboard=1\b/.test(location.search)) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(sbDebugMount, 50), { once: true });
  else setTimeout(sbDebugMount, 50);
}

const SideboardUI = {
  adjust: sbAdjust, allRows: sbAllRows, buildModel: sbBuildModel, canAdjust: sbCanAdjust, columnRows: sbColumnRows, computeSwaps: sbComputeSwaps,
  handleKeydown: sbHandleKeydown, lockMessages: sbLockMessages, mainCount: sbMainCount, reset: sbReset, setTransport: sbSetTransport, sideCount: sbSideCount,
  stepHtml: sbStepHtml, summary: sbSummary, totals: sbTotals, validity: sbValidity,
};
if (typeof window !== "undefined") {
  window.SideboardUI = SideboardUI;
  window.hideSideboardOverlay = hideSideboardOverlay;
  window.setSideboardSkipPreferred = setSideboardSkipPreferred;
  window.maybeRenderSideboardOverlay = maybeRenderSideboardOverlay;
}
if (typeof module !== "undefined" && module && module.exports) module.exports = SideboardUI;
