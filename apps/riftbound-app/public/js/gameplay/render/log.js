// render/log.js — Game log rendering, rewind sentinel handling, undo/redo
// requests. Classic script: everything is global. Split out of renderer.js.

const LOG_MOVE_NAMES = {
  exhaustRune: "exhausted a rune",
  playUnit: "played a unit",
  playSpell: "cast a spell",
  playGear: "played gear",
  standardMove: "moved a unit",
  gankingMove: "ganked",
  passChainPriority: "passed priority",
  passShowdownFocus: "passed focus",
  endTurn: "ended their turn",
  channelRunes: "channeled runes",
  drawCard: "drew a card",
  activateAbility: "activated an ability",
  conquerBattlefield: "conquered a battlefield",
  contestBattlefield: "contested a battlefield",
  recycleRune: "recycled a rune",
  readyAll: "readied all cards",
  emptyRunePool: "emptied rune pool",
  advancePhase: "advanced phase",
  scorePoint: "scored a point",
  recallUnit: "recalled a unit",
  moveUnit: "moved a unit",
  hideCard: "hid a card",
  revealHidden: "revealed a hidden card",
  resolveChain: "resolved the chain",
  resolveFullCombat: "resolved combat",
  startShowdown: "started a showdown",
  endShowdown: "ended the showdown",
  concede: "conceded",
  sandboxAutoPlay: "auto-played",
};

function formatLogEntry(raw) {
  let text = raw;
  // Replace player IDs with display names
  text = text.replace(/player-1/g, pName(P1));
  text = text.replace(/player-2/g, pName(P2));
  // Humanize move IDs
  for (const [id, label] of Object.entries(LOG_MOVE_NAMES)) {
    text = text.replace(new RegExp(":\\s*" + id, "g"), ": " + label);
  }
  // Resolve card IDs in log text
  text = text.replace(/(?:main|rune)-\d+-[a-z][\w-]*/g, match => {
    const card = findCard(match) || findCard("player-1-" + match) || findCard("player-2-" + match);
    return card?.name || match;
  });
  return text;
}

/**
 * Normalize a log entry into a consistent shape.
 *
 * The server may emit either plain strings (legacy callers) or structured
 * LogEntry objects with `{ text, timestamp, rewindable, key }`. This helper
 * shields the render path from that variance.
 */
function normalizeLogEntry(entry) {
  if (typeof entry === "string") {
    return { text: entry, timestamp: "", rewindable: false };
  }
  return {
    text: entry?.text ?? "",
    timestamp: entry?.timestamp ?? "",
    rewindable: Boolean(entry?.rewindable),
    key: entry?.key,
  };
}

/**
 * Build the inner HTML for a single log entry. Returns a row with a
 * monospaced timestamp gutter, the narration text, and an optional
 * clickable rewind (↺) marker. Rewind wiring lands in Workstream 8.
 */
function renderLogEntryRow(entry) {
  const normalized = normalizeLogEntry(entry);
  // vs-Claude: "🤖 Sonnet: Play Yasuo to Base — 'rationale'" carries MODEL-produced
  // text. Build the row with DOM nodes / textContent only — never innerHTML.
  if (typeof normalized.text === "string" && normalized.text.startsWith("\u{1F916}")) {
    return renderAiLogEntryRow(normalized);
  }
  let text = esc(formatLogEntry(normalized.text));
  text = text.replace(/\bP1\b/g, '<span class="log-player">P1</span>');
  text = text.replace(/\bP2\b/g, '<span class="log-player" style="color:#e09060">P2</span>');

  const timestamp = normalized.timestamp
    ? `<span class="log-timestamp" style="opacity:0.55;font-size:0.8em;margin-right:6px;font-variant-numeric:tabular-nums">${esc(normalized.timestamp)}</span>`
    : "";
  const rewindMark = normalized.rewindable
    ? ` <span class="log-rewind" role="button" tabindex="0" title="Rewind to this point" style="cursor:pointer;opacity:0.55;margin-left:4px" onclick="handleRewindClick(event)">&#x21BA;</span>`
    : "";

  return `<div class="log-entry">${timestamp}<span class="log-text">${text}</span>${rewindMark}</div>`;
}

/** Row for an AI-seat line: timestamp gutter + text, all via textContent. */
function renderAiLogEntryRow(normalized) {
  const row = document.createElement("div");
  row.className = "log-entry log-ai";
  if (normalized.timestamp) {
    const ts = document.createElement("span");
    ts.className = "log-timestamp";
    ts.style.cssText = "opacity:0.55;font-size:0.8em;margin-right:6px;font-variant-numeric:tabular-nums";
    ts.textContent = normalized.timestamp;
    row.appendChild(ts);
  }
  const span = document.createElement("span");
  span.className = "log-text";
  span.textContent = normalized.text;
  row.appendChild(span);
  return row.outerHTML;
}

function renderLog() {
  const log = gameState.log || [];
  const logEl = document.getElementById("gameLog");
  // Preserve user scroll position if they've scrolled back to review older entries.
  // The log renders newest-at-top, so "near the top" means scrollTop is small.
  const wasAtNewest = !logEl || logEl.scrollTop < 32;

  document.getElementById("logEntries").innerHTML = log
    .slice()
    .reverse()
    .map(renderLogEntryRow)
    .join("");

  // Auto-scroll log to top (newest entries) only when the user was already there
  if (logEl && wasAtNewest) logEl.scrollTop = 0;

  // Update undo/redo button state from the engine's history cursor
  // (snapshot.canUndo / snapshot.canRedo — server/snapshot.ts).
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if (undoBtn) undoBtn.disabled = !gameState.canUndo;
  if (redoBtn) redoBtn.disabled = gameState.canRedo === undefined ? false : !gameState.canRedo;
}

function addLogEntry(text) {
  const el = document.getElementById("logEntries");
  el.innerHTML = renderLogEntryRow({ text, timestamp: formatNowForLog(), rewindable: false }) + el.innerHTML;
}

/** Format "now" as HH:MM in local time for optimistic client-side log rows. */
function formatNowForLog() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Click handler for the ↺ marker on rewindable log entries.
 *
 * W8 fallback: every rewindable marker performs a single-step rewind
 * regardless of which entry was clicked. Full "jump to this point" wiring
 * (looping N undo steps server-side) is a follow-up — see
 * .ai_memory/riftatlas-gap-closure-sequenced-plan.md Section 6.
 */
function handleRewindClick(event) {
  event.stopPropagation();
  if (typeof requestUndo === "function") {
    requestUndo();
  }
}

/**
 * Text of the server-emitted log line that marks a successful rewind. Must
 * stay in sync with server.ts's undo paths — the client uses this as a
 * sentinel to clear in-progress interaction state and flash the board.
 */
const REWIND_LOG_SENTINEL = "Rewound their last action.";

/** Track the last-seen rewind entry (its unique key, else HH:MM) so we only react to new rewinds. */
let lastSeenRewindTimestamp = null;

/**
 * Detect whether a new state frame's newest log entry is the canonical
 * "Rewound their last action." line and, if so, clear any in-progress UI
 * interaction (target cursor, armed hotkey modes) and flash the board.
 *
 * Called from render() after gameState has been updated for the new frame.
 */
function clearInteractionStateOnRewind() {
  const log = gameState?.log;
  if (!Array.isArray(log) || log.length === 0) return;
  const newest = log[log.length - 1];
  if (!newest || newest.text !== REWIND_LOG_SENTINEL) return;

  // Dedupe: only react if this is a different rewind than the one we
  // already processed. The server keys every rewind line uniquely
  // (`after-replay-<i>~<serial>-rw<epoch>`); fall back to HH:MM for legacy frames.
  const stamp = newest.key || newest.timestamp || "";
  if (stamp === lastSeenRewindTimestamp) return;
  lastSeenRewindTimestamp = stamp;

  try {
    if (typeof cancelInteraction === "function") cancelInteraction();
  } catch (err) {
    console.warn("[renderer] cancelInteraction threw during rewind", err);
  }
  try {
    if (typeof disarmAll === "function") disarmAll();
  } catch (err) {
    console.warn("[renderer] disarmAll threw during rewind", err);
  }

  // Brief visual flash on the scale wrapper — purely cosmetic.
  const wrapper = document.getElementById("game-scale-wrapper");
  if (wrapper) {
    wrapper.classList.remove("rewind-flash");
    // Force reflow so the animation restarts if two rewinds happen quickly.
    void wrapper.offsetWidth;
    wrapper.classList.add("rewind-flash");
    setTimeout(() => wrapper.classList.remove("rewind-flash"), 320);
  }
}

function requestUndo() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "undo" }));
}

function requestRedo() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "redo" }));
}
