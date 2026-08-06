/**
 * JavaScript evaluated inside the web client. Kept as source strings so the
 * engine package needs no DOM lib and Playwright serialisation is trivial.
 *
 * Everything hangs off `window.__rbHarness` (installed by TAP_SCRIPT):
 *   frames[]  — {type, seq, requestId, error, errorCode, moveId, playerId, at} per inbound WS frame
 *   last      — the most recent frame
 *   sent[]    — outbound {type:"move"} frames ({moveId, params, requestId})
 *   tap(ws)   — attach to a socket (auto for every `new WebSocket("/ws/game/…")`)
 *
 * The client itself may also set `window.__rbLastFrame` (websocket.js hook);
 * readers fall back to it when the tap is absent.
 */

export function call(fn: string, ...args: unknown[]): string {
  return `(${fn})(${args.map((a) => JSON.stringify(a ?? null)).join(",")})`;
}

/** Idempotent: wraps window.WebSocket so every game socket is tapped; taps an already-open `ws`. */
export const TAP_SCRIPT = `(() => {
  if (window.__rbHarness) { try { if (typeof ws !== "undefined" && ws) window.__rbHarness.tap(ws); } catch (e) {} return true; }
  const H = { frames: [], last: null, sent: [], installedAt: Date.now() };
  window.__rbHarness = H;
  const record = (data) => {
    try {
      const m = JSON.parse(data);
      const f = { type: m.type, seq: m.seq, requestId: m.requestId, error: m.error, errorCode: m.errorCode, moveId: m.moveId, playerId: m.playerId, at: Date.now() };
      H.last = f; H.frames.push(f);
      if (H.frames.length > 300) H.frames.splice(0, H.frames.length - 300);
    } catch (e) {}
  };
  const recordSent = (data) => {
    try {
      const m = JSON.parse(data);
      if (m && m.type === "move") {
        H.sent.push({ moveId: m.moveId, params: m.params, requestId: m.requestId, at: Date.now() });
        if (H.sent.length > 100) H.sent.splice(0, H.sent.length - 100);
      }
    } catch (e) {}
  };
  H.tap = (sock) => {
    if (!sock || sock.__rbTapped) return;
    sock.__rbTapped = true;
    sock.addEventListener("message", (e) => record(e.data));
    const send = sock.send.bind(sock);
    sock.send = (d) => { recordSent(d); return send(d); };
  };
  const Orig = window.WebSocket;
  function W(url, protocols) {
    const sock = protocols === undefined ? new Orig(url) : new Orig(url, protocols);
    try { if (String(url).indexOf("/ws/game/") >= 0) H.tap(sock); } catch (e) {}
    return sock;
  }
  W.prototype = Orig.prototype;
  W.CONNECTING = Orig.CONNECTING; W.OPEN = Orig.OPEN; W.CLOSING = Orig.CLOSING; W.CLOSED = Orig.CLOSED;
  window.WebSocket = W;
  try { if (typeof ws !== "undefined" && ws) H.tap(ws); } catch (e) {}
  return true;
})()`;

/**
 * Init script: kill CSS animations/transitions (the board has ~10 infinite
 * ones). Saves renderer CPU on a shared box and lets Playwright's
 * "element stable" check pass immediately for visual-mode clicks.
 */
export const CALM_SCRIPT = `(() => {
  const install = () => {
    try {
      if (!document.head || document.getElementById("__rbCalm")) return;
      const st = document.createElement("style");
      st.id = "__rbCalm";
      st.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }";
      document.head.appendChild(st);
    } catch (e) {}
  };
  install();
  document.addEventListener("DOMContentLoaded", install);
  return true;
})()`;

/** Read the client's latest frame: state, moves, seq, identity, last WS frame meta. */
export const READ_FRAME = `(() => {
  const gs = window.__rbGameState;
  if (!gs) return null;
  const H = window.__rbHarness;
  return {
    seq: (typeof lastSeq !== "undefined" ? lastSeq : -1),
    state: gs,
    moves: window.__rbAvailableMoves || [],
    viewingPlayer: window.__rbViewingPlayer,
    gameId: window.__rbGameId,
    sandbox: (typeof isSandboxGame !== "undefined" ? !!isSandboxGame : false),
    last: H && H.last ? H.last : (window.__rbLastFrame || null),
    frameCount: H ? H.frames.length : 0,
    requestCounter: (typeof requestCounter !== "undefined" ? requestCounter : 0),
    wsOpen: (typeof ws !== "undefined" && !!ws && ws.readyState === 1),
    pregame: (typeof pregameState !== "undefined" && pregameState ? (pregameState.phase || true) : null),
    interactionMode: (typeof interaction !== "undefined" && interaction ? interaction.mode : null)
  };
})()`;

/** executeMove(moveId, params, playerId) and report the requestId it used (null when it went via REST). */
export const DISPATCH_FN = `(moveId, params, pid) => {
  const before = (typeof requestCounter !== "undefined" ? requestCounter : 0);
  executeMove(moveId, params, pid);
  const after = (typeof requestCounter !== "undefined" ? requestCounter : 0);
  return { requestId: after > before ? "req-" + after : null, before: before, after: after };
}`;

/**
 * Poll predicate: has the outcome for {requestId} (or any seq advance past
 * beforeSeq when requestId is null) arrived? Returns the frame meta or false.
 */
export const OUTCOME_FN = `(a) => {
  const H = window.__rbHarness;
  const frames = H ? H.frames : (window.__rbLastFrame ? [window.__rbLastFrame] : []);
  if (a.requestId) {
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i];
      if (f.requestId === a.requestId) return f;
    }
    // Fallback for an untapped socket: the client hook only keeps the last frame.
    if (!H && typeof lastSeq !== "undefined" && lastSeq > a.beforeSeq) return { type: "move_accepted", seq: lastSeq, requestId: a.requestId, inferred: true };
    return false;
  }
  if (typeof lastSeq !== "undefined" && lastSeq > a.beforeSeq) return { type: "seq", seq: lastSeq };
  return false;
}`;

/** Poll predicate: a frame with seq > a.seq whose moveId === a.moveId (e.g. "sandboxAutoPlay"). */
export const FRAME_AFTER_FN = `(a) => {
  const H = window.__rbHarness;
  if (!H) return (typeof lastSeq !== "undefined" && lastSeq > a.seq) ? { seq: lastSeq } : false;
  for (let i = H.frames.length - 1; i >= 0; i--) {
    const f = H.frames[i];
    if (typeof f.seq === "number" && f.seq > a.seq && (!a.moveId || f.moveId === a.moveId)) return f;
  }
  return false;
}`;

/** Board readiness: playing, no pregame overlay, WS open, moves known. */
export const READY_FN = `() => {
  const gs = window.__rbGameState;
  if (!gs || gs.status !== "playing") return false;
  if (typeof pregameState !== "undefined" && pregameState && pregameState.phase) return false;
  const ov = document.querySelector("#pregameOverlay.visible, #coinOverlay.visible");
  if (ov) return false;
  return (typeof ws !== "undefined" && !!ws && ws.readyState === 1);
}`;

// ---- visual-mode helpers ---------------------------------------------------

/** Index of the pending-choice modal element matching `params` ({kind:"card"|"other", idx} or null). */
export const PENDING_PICK_INDEX_FN = `(params) => {
  const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x)) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x);
  const picks = (window.__rbAvailableMoves || []).filter((m) => m.moveId === "resolvePendingChoice");
  const cardPicks = picks.filter((m) => m.params && m.params.pickedCardId);
  const otherPicks = picks.filter((m) => !(m.params && m.params.pickedCardId));
  const want = canon(params);
  let i = cardPicks.findIndex((m) => canon(m.params) === want);
  if (i >= 0) return { kind: "card", idx: i };
  i = otherPicks.findIndex((m) => canon(m.params) === want);
  if (i >= 0) return { kind: "other", idx: i };
  return null;
}`;

/** Index of the play-cost modal variant matching `params` for `cardId`, or -1. */
export const PLAY_VARIANT_INDEX_FN = `(cardId, params) => {
  const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x)) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x);
  const variants = (window.__rbAvailableMoves || []).filter((m) =>
    (m.moveId === "playUnit" || m.moveId === "playFromChampionZone") && ((m.params && m.params.cardId) || "__champion") === cardId);
  const want = canon(params);
  return variants.findIndex((m) => canon(m.params) === want);
}`;

/** Text-matched action-list button click (e.g. "End Turn"). Returns true if clicked. */
export const CLICK_ACTION_BUTTON_FN = `(text) => {
  const btns = Array.from(document.querySelectorAll("#actionsList .action-btn"));
  const b = btns.find((el) => (el.textContent || "").trim().toLowerCase().startsWith(text.toLowerCase()));
  if (!b) return false;
  b.click();
  return true;
}`;
