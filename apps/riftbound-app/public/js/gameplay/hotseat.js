// hotseat.js — Goldfish — ACTIVE: one browser plays BOTH seats ("hot seat").
//
// The server marks such a session `hotSeat` (every sync frame + snapshot carry
// the flag), attaches NO driver to player-2 and lets this socket re-bind with
// `{type:"switch_seat", playerId}`; the reply is an ordinary per-seat `sync`
// (that seat's redacted view + pregame payload + moves). This module:
//   - follows the seat that owes the next decision (turn / priority / focus /
//     prompt owner while playing; battlefield pick / sideboard lock / mulligan
//     in the pregame) and switches to it automatically,
//   - shows a persistent banner "Acting as Player 2 (Goldfish — active)" with a
//     manual Switch seat button (also `Tab`),
//   - renders the OTHER seat's redacted hand cards as card backs (the server
//     already withholds their identity; this is presentation only).
// Classic script sharing globals with state.js / websocket.js / lobby.js.

/** Seat we asked the server to bind us to, until its sync arrives. */
let _hotSeatPending = null;
let _hotSeatPendingTimer = null;
/** After a MANUAL switch, don't auto-follow until the position actually changes (next move frame). */
let _hotSeatManualHold = false;
let _hotSeatReqCounter = 0;
/** Loop guard: automatic switches seen at the current server seq (both views disagreeing must never ping-pong). */
let _hotSeatAutoSeq = -1;
let _hotSeatAutoCount = 0;

function _hotSeatOther(pid) {
  return pid === P1 ? P2 : P1;
}

/**
 * The seat that owes the next decision, from THIS seat's frame. Pregame:
 * battlefield pick → sideboard lock → mulligan (mine first, then the other
 * seat's if it is still owed). Playing: prompt owner → chain priority →
 * showdown focus → turn player (same cursor as the sidebar header). null when
 * nobody is owed anything we can tell (game over / no state yet).
 */
function hotSeatActingSeat() {
  const me = viewingPlayer;
  const other = _hotSeatOther(me);
  const pg = typeof pregameState !== "undefined" ? pregameState : null;
  if (pg && pg.phase) {
    if (pg.phase === "battlefield_select") {
      return pg.battlefieldSelected ? other : me;
    }
    if (pg.phase === "sideboard") {
      if (pg.you && !pg.you.locked) return me;
      if (pg.opponent && pg.opponent.status !== "locked") return other;
      return me;
    }
    if (pg.phase === "mulligan") {
      const done = Array.isArray(pg.mulliganComplete) ? pg.mulliganComplete : [];
      if (!done.includes(me)) return me;
      if (!done.includes(other)) return other;
      return me;
    }
    return me;
  }
  const gs = typeof gameState !== "undefined" ? gameState : null;
  if (!gs || gs.status !== "playing") return null;
  const ix = gs.interaction || {};
  const pc = gs.pendingChoice;
  if (pc) return pc.prompter || pc.playerId || null;
  if (ix.chain && ix.chain.active) return ix.chain.activePlayer || null;
  const sd = ix.showdown || (Array.isArray(ix.showdownStack) && ix.showdownStack.length ? ix.showdownStack[ix.showdownStack.length - 1] : null);
  if (sd && sd.active) return sd.focusPlayer || null;
  return (gs.turn && gs.turn.activePlayer) || null;
}

/**
 * Re-bind this socket (and the whole UI perspective) to `pid`. The server
 * answers with that seat's sync; render() then draws the board from its side
 * with ITS hand open and the other seat's hand face down.
 */
function hotSeatSwitchSeat(pid, opts) {
  const o = opts || {};
  if (!isHotSeatGame || !pid || (pid !== P1 && pid !== P2)) return false;
  if (pid === viewingPlayer && !_hotSeatPending && !o.force) return false;
  viewingPlayer = pid;
  if (typeof saveSession === "function") saveSession();
  if (typeof resetInteractionSilent === "function") resetInteractionSilent();
  if (o.manual) _hotSeatManualHold = true;
  if (typeof ws !== "undefined" && ws && ws.readyState === WebSocket.OPEN) {
    _hotSeatPending = pid;
    clearTimeout(_hotSeatPendingTimer);
    _hotSeatPendingTimer = setTimeout(() => { _hotSeatPending = null; }, 3000); // never wedge on a lost frame
    ws.send(JSON.stringify({ playerId: pid, requestId: `seat-${++_hotSeatReqCounter}`, type: "switch_seat" }));
  } else if (typeof connectWs === "function") {
    // No open socket: (re)connect — the URL carries ?player=<viewingPlayer>.
    connectWs();
  }
  hotSeatRenderBanner();
  if (!o.quiet && typeof showToast === "function") showToast(`Now acting as ${pName(pid)}`);
  return true;
}

/** Follow the seat that owes the next decision (unless a manual switch is being honoured). */
function hotSeatMaybeAutoSwitch() {
  if (!isHotSeatGame || _hotSeatPending || _hotSeatManualHold) return;
  const seat = hotSeatActingSeat();
  if (!seat || seat === viewingPlayer) return;
  const seq = typeof lastSeq !== "undefined" ? lastSeq : -1;
  if (seq === _hotSeatAutoSeq) {
    if (++_hotSeatAutoCount > 2) return; // the two seats' views disagree at this position — stay put, the banner's Switch seat still works
  } else {
    _hotSeatAutoSeq = seq;
    _hotSeatAutoCount = 1;
  }
  hotSeatSwitchSeat(seat, { auto: true, quiet: false });
}

/** websocket.js calls this for every parsed frame, after gameState / pregameState were updated. */
function hotSeatOnFrame(msg) {
  if (!msg) return;
  if (msg.hotSeat === true || (msg.state && msg.state.hotSeat === true)) {
    if (typeof setSandboxGame === "function" && !isSandboxGame) setSandboxGame(true);
    setHotSeatGame(true);
  } else if (msg.type === "sync" && msg.state && !msg.state.hotSeat && !msg.pregame) {
    // A live (post-pregame) snapshot without the flag: not a hot-seat game.
    setHotSeatGame(false);
  }
  if (!isHotSeatGame) { hotSeatRenderBanner(); return; }
  if (msg.type === "sync") {
    if (msg.seat || _hotSeatPending === viewingPlayer) { _hotSeatPending = null; clearTimeout(_hotSeatPendingTimer); }
  }
  if (msg.type === "move_accepted" || msg.type === "state_update") {
    // The position moved on: resume following the decision.
    _hotSeatManualHold = false;
  }
  if (msg.type === "sync" || msg.type === "move_accepted" || msg.type === "state_update") {
    hotSeatMaybeAutoSwitch();
  }
  hotSeatRenderBanner();
}

/** Persistent "Acting as …" strip with the manual switch. */
function hotSeatRenderBanner() {
  let el = document.getElementById("hotSeatBanner");
  const show = isHotSeatGame && typeof gameId !== "undefined" && Boolean(gameId);
  if (!show) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("div");
    el.id = "hotSeatBanner";
    el.className = "hotseat-banner";
    el.setAttribute("role", "status");
    const txt = document.createElement("span");
    txt.className = "hotseat-banner__text";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "hotSeatSwitchBtn";
    btn.className = "hotseat-banner__btn";
    btn.title = "Switch to the other seat (Tab)";
    btn.addEventListener("click", (e) => { e.stopPropagation(); hotSeatSwitchSeat(_hotSeatOther(viewingPlayer), { manual: true }); });
    el.appendChild(txt);
    el.appendChild(btn);
    document.body.appendChild(el);
  }
  el.dataset.seat = viewingPlayer;
  el.classList.toggle("hotseat-banner--p2", viewingPlayer === P2);
  const seatNo = viewingPlayer === P2 ? "2" : "1";
  const name = pName(viewingPlayer);
  const label = /^Player [12]$/.test(name) ? name : `Player ${seatNo} — ${name}`;
  el.querySelector(".hotseat-banner__text").innerHTML = `Acting as <b>${esc(label)}</b> <span class="hotseat-banner__mode">(Goldfish — active)</span>`;
  el.querySelector(".hotseat-banner__btn").innerHTML = `Switch seat <kbd>Tab</kbd>`;
}

// Leaving a game clears gameId without a frame: keep the strip honest.
setInterval(hotSeatRenderBanner, 1000);

// Tab = switch seat (hot seat only; never steals Tab from form fields).
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!isHotSeatGame || typeof gameId === "undefined" || !gameId) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
  e.preventDefault();
  hotSeatSwitchSeat(_hotSeatOther(viewingPlayer), { manual: true });
}, true);

(function hotSeatInjectStyles() {
  if (document.getElementById("hotSeatStyles")) return;
  const st = document.createElement("style");
  st.id = "hotSeatStyles";
  st.textContent = `
    .hotseat-banner { position:fixed; top:6px; left:50%; transform:translateX(-50%); z-index:2500; display:flex; align-items:center; gap:10px;
      padding:5px 8px 5px 12px; border-radius:999px; background:rgba(24,40,32,0.94); border:1px solid #3aa070; color:#cfeede; font-size:12px;
      box-shadow:0 4px 18px rgba(0,0,0,0.45); pointer-events:auto; white-space:nowrap; }
    .hotseat-banner--p2 { background:rgba(44,26,58,0.94); border-color:#9a6ae0; color:#e6d8fb; }
    .hotseat-banner b { color:#fff; }
    .hotseat-banner__mode { opacity:.7; }
    .hotseat-banner__btn { background:#1e1b30; border:1px solid #5a5480; border-radius:999px; color:#e0dced; cursor:pointer; font-size:11px; padding:3px 10px; }
    .hotseat-banner__btn:hover { border-color:#8a7ad0; color:#fff; }
    .hotseat-banner__btn kbd { font-family:inherit; font-size:10px; opacity:.7; margin-left:4px; border:1px solid #5a5480; border-radius:3px; padding:0 4px; }
    /* The other seat's private cards arrive as opaque "hidden-…" stand-ins: show a card back, never a blank face. */
    .card[data-card-id^="hidden-"] { pointer-events:none; }
    .card[data-card-id^="hidden-"] > * { display:none !important; }
    .card[data-card-id^="hidden-"]::after { content:""; position:absolute; inset:0; border-radius:inherit;
      background:
        url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 84'><g fill='none' stroke='%23c9d6ff' stroke-opacity='.75' stroke-width='1.6'><path d='M30 14 L46 42 L30 70 L14 42 Z'/><path d='M30 24 L40 42 L30 60 L20 42 Z'/><circle cx='30' cy='42' r='4.5' fill='%23c9d6ff' fill-opacity='.55'/></g><rect x='3.5' y='3.5' width='53' height='77' rx='5' fill='none' stroke='%23c9d6ff' stroke-opacity='.35' stroke-width='1.2'/></svg>") center / 78% auto no-repeat,
        radial-gradient(ellipse at 50% 40%, #26408a 0%, #142457 55%, #0b1533 100%); }
  `;
  document.head.appendChild(st);
})();
