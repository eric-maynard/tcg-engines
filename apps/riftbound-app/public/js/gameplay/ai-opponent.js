// ai-opponent.js — "VS Claude" client bits: opponent picker in the solo dialog,
// the Anthropic API key setting (localStorage only; sent once in the create
// request), the "Claude is thinking…" pill, and small vs-AI render flags.
// Classic script: everything is global.

const AI_KEY_STORAGE = "rb-anthropic-key";
const AI_OPPONENT_STORAGE = "rb-opponent";

/** Server-reported availability: { envKey, mock, models:[{key,label}] } */
let aiServerStatus = { envKey: false, mock: false, models: [
  { key: "haiku", label: "Claude Haiku 4.5" },
  { key: "sonnet", label: "Claude Sonnet 5" },
  { key: "opus", label: "Claude Opus 5" },
] };

/** True while the server says the AI seat is deciding (drives the pill near the opponent info). */
let aiThinking = false;
/** { kind, model, label } for the current game's solo opponent, from the snapshot. */
let aiOpponentInfo = null;

function isVsAiGame() {
  return Boolean((aiOpponentInfo && aiOpponentInfo.kind === "claude") || (gameState && gameState.ai && gameState.ai.kind === "claude"));
}

function getStoredApiKey() {
  try { return localStorage.getItem(AI_KEY_STORAGE) || ""; } catch { return ""; }
}
function setStoredApiKey(v) {
  try {
    if (v) localStorage.setItem(AI_KEY_STORAGE, v); else localStorage.removeItem(AI_KEY_STORAGE);
  } catch { /* storage unavailable */ }
}
function getStoredOpponent() {
  try { return localStorage.getItem(AI_OPPONENT_STORAGE) || "goldfish"; } catch { return "goldfish"; }
}
function setStoredOpponent(v) {
  try { localStorage.setItem(AI_OPPONENT_STORAGE, v); } catch { /* */ }
}

function aiKeyAvailable() {
  return Boolean(aiServerStatus.envKey || aiServerStatus.mock || getStoredApiKey());
}

/** Picker values for the two Goldfish flavours (everything else is a Claude model key). */
const GOLDFISH_PASSIVE = "goldfish";
const GOLDFISH_ACTIVE = "goldfish-active";
function isGoldfishValue(v) { return v === GOLDFISH_PASSIVE || v === GOLDFISH_ACTIVE; }

/** The `opponent` field for /api/lobby/create from the picker's current value. */
function buildOpponentRequest() {
  const sel = document.getElementById("soloOpponent");
  const value = sel ? sel.value : getStoredOpponent();
  if (!value || value === GOLDFISH_PASSIVE) return { kind: "goldfish", mode: "passive" };
  if (value === GOLDFISH_ACTIVE) return { kind: "goldfish", mode: "active" };
  const req = { kind: "claude", model: value };
  const key = getStoredApiKey();
  if (key) req.apiKey = key;
  return req;
}

function _aiInjectStyles() {
  if (document.getElementById("aiOpponentStyles")) return;
  const st = document.createElement("style");
  st.id = "aiOpponentStyles";
  st.textContent = `
    .ai-opp-row { display:flex; gap:8px; align-items:center; margin-top:14px; }
    .ai-opp-row label { color:#8a82a6; font-size:12px; }
    .ai-opp-row select { padding:8px 10px; font-size:13px; background:#1e1b30; border:2px solid #3a3560; border-radius:8px; color:#e0dced; }
    .ai-opp-row select option:disabled { color:#5a5478; }
    .ai-gear-btn { background:none; border:1px solid #3a3560; border-radius:6px; color:#a8a0c6; cursor:pointer; font-size:14px; padding:5px 8px; line-height:1; }
    .ai-gear-btn:hover { border-color:#6a50c0; color:#d4c0ff; }
    .ai-opp-hint { color:#6a6288; font-size:11px; margin-top:6px; min-height:14px; }
    .ai-key-field { width:100%; padding:9px 12px; font-size:13px; background:#1e1b30; border:2px solid #3a3560; border-radius:8px; color:#e0dced; margin:6px 0 4px; box-sizing:border-box; }
    .ai-key-saved { color:#8a82a6; font-size:12px; margin-bottom:12px; font-variant-numeric:tabular-nums; }
    .ai-thinking-pill { display:inline-flex; align-items:center; gap:6px; margin-left:6px; padding:2px 8px; border-radius:10px; background:rgba(140,110,220,0.18); border:1px solid #5a3a9a; color:#d4c0ff; font-size:11px; white-space:nowrap; }
    /* [rule:ui-opponent-strip-stable] Idle HIDES the pill without giving up its
       layout box. #opponentInfo is flex-shrink:0 next to a flex:1,
       centre-justified #opponent-hand, so a pill that leaves the flow widens
       the hand and slides every opponent card sideways — twice per AI turn. */
    .ai-thinking-pill.is-idle { visibility:hidden; }
    .ai-thinking-pill.is-idle .dot { animation:none; }
    .ai-thinking-pill .dot { width:6px; height:6px; border-radius:50%; background:#c4a0ff; animation:aiPulse 1s ease-in-out infinite; }
    @keyframes aiPulse { 0%,100% { opacity:.25 } 50% { opacity:1 } }
    .log-entry.log-ai .log-text { color:#c9b8f5; }
  `;
  document.head.appendChild(st);
}

/** Add the Opponent selector + gear to the solo deck picker (once). */
function _aiMountPicker() {
  const picker = document.getElementById("soloDeckPicker");
  if (!picker || document.getElementById("soloOpponent")) return;
  const row = document.createElement("div");
  row.className = "ai-opp-row";
  const label = document.createElement("label");
  label.setAttribute("for", "soloOpponent");
  label.textContent = "Opponent";
  const sel = document.createElement("select");
  sel.id = "soloOpponent";
  sel.addEventListener("change", () => { setStoredOpponent(sel.value); _aiSyncPickerTitle(); });
  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "ai-gear-btn";
  gear.title = "Settings — Anthropic API key";
  gear.setAttribute("aria-label", "Settings — Anthropic API key");
  gear.textContent = "⚙";
  gear.addEventListener("click", openAiSettings);
  row.appendChild(label);
  row.appendChild(sel);
  row.appendChild(gear);
  const hint = document.createElement("p");
  hint.id = "soloOpponentHint";
  hint.className = "ai-opp-hint";
  // Insert after the deck status line.
  const anchor = document.getElementById("soloDeckStatus");
  if (anchor && anchor.parentElement === picker) {
    anchor.insertAdjacentElement("afterend", row);
    row.insertAdjacentElement("afterend", hint);
  } else {
    picker.appendChild(row);
    picker.appendChild(hint);
  }
  _aiFillOpponentOptions();
}

function _aiFillOpponentOptions() {
  const sel = document.getElementById("soloOpponent");
  if (!sel) return;
  const want = sel.value || getStoredOpponent();
  const canAi = aiKeyAvailable();
  sel.textContent = "";
  // Goldfish — Passive: player-2 auto-passes (the driver in server/turn.ts);
  // Goldfish — Active: no driver, YOU play both seats (hot seat, hotseat.js).
  const gold = document.createElement("option");
  gold.value = GOLDFISH_PASSIVE;
  gold.textContent = "Goldfish — Passive (auto-passes)";
  sel.appendChild(gold);
  const goldActive = document.createElement("option");
  goldActive.value = GOLDFISH_ACTIVE;
  goldActive.textContent = "Goldfish — Active (you play both seats)";
  sel.appendChild(goldActive);
  for (const m of aiServerStatus.models) {
    const o = document.createElement("option");
    o.value = m.key;
    o.textContent = m.label + (aiServerStatus.mock ? " (mock)" : "");
    if (!canAi) { o.disabled = true; o.title = "Add an API key in Settings or .env"; }
    sel.appendChild(o);
  }
  sel.value = [...sel.options].some(o => o.value === want && !o.disabled) ? want : GOLDFISH_PASSIVE;
  const hint = document.getElementById("soloOpponentHint");
  if (hint) {
    hint.textContent = canAi
      ? (aiServerStatus.envKey ? "Claude seats use the server's API key." : aiServerStatus.mock ? "Server is in mock-AI mode (first legal action)." : "Claude seats use the API key saved in this browser.")
      : "Claude opponents need an Anthropic API key — add one via ⚙ Settings or the server's .env.";
  }
  // Play-menu card mirrors availability in its tooltip only — its visible
  // text ships final in gameplay.html so this late pass never reflows the menu.
  const card = _aiModeCard();
  if (card) {
    card.disabled = false; // always clickable: the picker explains what is missing
    card.title = canAi ? "Play against Claude" : "Play against Claude — needs an Anthropic API key (⚙ Settings or .env)";
  }
  _aiSyncPickerTitle();
}

/** The Play menu's "VS AI" card (shipped disabled as "Coming soon"): claim it for VS Claude. */
function _aiModeCard() {
  let card = document.getElementById("vsAiOption");
  if (card) return card;
  for (const btn of document.querySelectorAll("#lobbyMenu .mode-card")) {
    const t = btn.querySelector(".mode-card-title");
    if (t && /^VS (AI|Claude)$/i.test(t.textContent.trim())) { card = btn; break; }
  }
  if (!card) return null;
  // Legacy markup ("VS AI — Coming soon"): claim it. Current gameplay.html
  // already ships id/label/onclick, so this branch is a no-op there.
  card.id = "vsAiOption";
  card.removeAttribute("disabled");
  card.disabled = false;
  const t = card.querySelector(".mode-card-title");
  if (t && t.textContent.trim() !== "VS Claude") t.textContent = "VS Claude";
  card.onclick = () => { if (typeof showSoloDeckPicker === "function") showSoloDeckPicker("claude"); };
  return card;
}

function _aiSyncPickerTitle() {
  const sel = document.getElementById("soloOpponent");
  const h = document.querySelector("#soloDeckPicker h2");
  if (!sel || !h) return;
  const opt = sel.options[sel.selectedIndex];
  h.textContent = sel.value === GOLDFISH_ACTIVE ? "Goldfish — play both seats" : isGoldfishValue(sel.value) ? "Goldfish" : `VS ${opt ? opt.textContent.replace(/ \(mock\)$/, "") : "Claude"}`;
}

/** Called by lobby.js showSoloDeckPicker(mode): preselect goldfish or the last Claude model. */
function aiPreparePicker(mode) {
  _aiMountPicker();
  const sel = document.getElementById("soloOpponent");
  if (!sel) return;
  if (mode === "claude" || mode === "ai") {
    const stored = getStoredOpponent();
    const preferred = !isGoldfishValue(stored) ? stored : "haiku";
    const ok = [...sel.options].find(o => o.value === preferred && !o.disabled) || [...sel.options].find(o => !isGoldfishValue(o.value) && !o.disabled);
    sel.value = ok ? ok.value : GOLDFISH_PASSIVE;
  } else {
    // Goldfish card: keep the remembered passive/active flavour (default passive).
    const stored = getStoredOpponent();
    sel.value = stored === GOLDFISH_ACTIVE ? GOLDFISH_ACTIVE : GOLDFISH_PASSIVE;
  }
  _aiSyncPickerTitle();
  _aiFillOpponentOptions();
  // Entered via "VS Claude" with no key: the key dialog gates the picker —
  // dismissing it without a key returns to the Play menu (closeAiSettings).
  _aiSettingsGatesPicker = mode === "claude" && !aiKeyAvailable();
  if (_aiSettingsGatesPicker) openAiSettings();
}

/** True while the settings dialog was auto-opened as the gate into the VS Claude picker. */
let _aiSettingsGatesPicker = false;

// ---- Settings modal (API key) -------------------------------------------

function _aiMountSettings() {
  if (document.getElementById("aiSettings")) return;
  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";
  overlay.id = "aiSettings";
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeAiSettings(); });
  const box = document.createElement("div");
  box.className = "confirm-box";
  box.style.maxWidth = "420px";
  box.style.textAlign = "left";
  const title = document.createElement("div");
  title.className = "confirm-title";
  title.textContent = "Settings";
  const msg = document.createElement("div");
  msg.className = "confirm-msg";
  msg.style.marginBottom = "10px";
  msg.textContent = "Anthropic API key for the VS Claude opponent. Stored only in this browser (localStorage) and sent to this server when you start a vs-Claude game; the server keeps it in memory for that game only.";
  const lab = document.createElement("label");
  lab.setAttribute("for", "aiKeyInput");
  lab.style.cssText = "color:#8a82a6;font-size:11px;text-transform:uppercase;letter-spacing:1px;";
  lab.textContent = "Anthropic API key";
  const input = document.createElement("input");
  input.type = "password";
  input.id = "aiKeyInput";
  input.className = "ai-key-field";
  input.placeholder = "sk-ant-…";
  input.autocomplete = "off";
  input.addEventListener("keyup", (e) => { if (e.key === "Enter") saveAiSettings(); });
  const saved = document.createElement("div");
  saved.id = "aiKeySaved";
  saved.className = "ai-key-saved";
  const btns = document.createElement("div");
  btns.className = "confirm-btns";
  btns.style.justifyContent = "flex-end";
  const clear = document.createElement("button");
  clear.className = "confirm-yes";
  clear.textContent = "Clear";
  clear.addEventListener("click", () => { setStoredApiKey(""); input.value = ""; _aiRefreshSavedLine(); _aiFillOpponentOptions(); });
  const cancel = document.createElement("button");
  cancel.className = "confirm-no";
  cancel.textContent = "Close";
  cancel.addEventListener("click", closeAiSettings);
  const save = document.createElement("button");
  save.className = "confirm-no";
  save.style.borderColor = "#4a80c0";
  save.style.color = "#e0eeff";
  save.textContent = "Save";
  save.addEventListener("click", saveAiSettings);
  btns.appendChild(clear);
  btns.appendChild(cancel);
  btns.appendChild(save);
  box.appendChild(title);
  box.appendChild(msg);
  box.appendChild(lab);
  box.appendChild(input);
  box.appendChild(saved);
  box.appendChild(btns);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function _aiRefreshSavedLine() {
  const el = document.getElementById("aiKeySaved");
  if (!el) return;
  const key = getStoredApiKey();
  el.textContent = key
    ? `Saved key: ••••${key.slice(-4)}`
    : (aiServerStatus.envKey ? "No browser key saved — the server has one configured (.env)." : "No key saved.");
}

function openAiSettings() {
  _aiMountSettings();
  const input = document.getElementById("aiKeyInput");
  if (input) input.value = "";
  _aiRefreshSavedLine();
  document.getElementById("aiSettings").classList.add("visible");
  setTimeout(() => { if (input) input.focus(); }, 0);
}

function closeAiSettings() {
  const el = document.getElementById("aiSettings");
  if (el) el.classList.remove("visible");
  const gated = _aiSettingsGatesPicker;
  _aiSettingsGatesPicker = false;
  if (gated) {
    if (aiKeyAvailable()) {
      // Key arrived while gated: land on the VS Claude picker as intended.
      aiPreparePicker("claude");
    } else if (typeof showMenu === "function") {
      // Dismissed without a key: back to the Play menu rather than a
      // Goldfish-only picker the player didn't ask for.
      showMenu();
    }
  }
}

function saveAiSettings() {
  const input = document.getElementById("aiKeyInput");
  const v = (input && input.value || "").trim();
  if (v) setStoredApiKey(v);
  if (input) input.value = "";
  _aiRefreshSavedLine();
  _aiFillOpponentOptions();
  closeAiSettings();
  if (typeof showToast === "function") showToast(v ? "API key saved in this browser" : "Nothing to save");
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.getElementById("aiSettings")?.classList.contains("visible")) closeAiSettings();
});

// ---- In-game: thinking pill + snapshot hooks -------------------------------

/** Called from websocket.js for every frame that carries state, and for ai_status frames. */
function aiOnServerFrame(msg) {
  const info = (msg && msg.ai) || (msg && msg.state && msg.state.ai) || null;
  if (info && info.kind) {
    aiOpponentInfo = { kind: info.kind, model: info.model, label: info.label };
    if (typeof info.thinking === "boolean") aiThinking = info.thinking;
  } else if (msg && msg.type === "sync" && msg.state && !msg.state.ai) {
    aiOpponentInfo = null;
    aiThinking = false;
  }
  if (msg && msg.type === "ai_status") renderAiThinking();
}

/** Small "Claude is thinking…" pill inside the opponent info strip; hides the seat switcher vs AI. */
function renderAiThinking() {
  const host = document.getElementById("opponentInfo");
  if (host) {
    let pill = document.getElementById("aiThinkingPill");
    if (isVsAiGame()) {
      // [rule:ui-opponent-strip-stable] Mounted for the WHOLE vs-AI game and
      // hidden with visibility, never removed: the pill sits in
      // #opponentInfo (flex-shrink:0) beside the flex:1, centre-justified
      // #opponent-hand, so adding and removing it re-flows the row and the
      // opponent's hand visibly jumps every time Claude starts or stops
      // thinking.
      if (!pill) {
        pill = document.createElement("span");
        pill.id = "aiThinkingPill";
        pill.className = "ai-thinking-pill";
        const dot = document.createElement("span");
        dot.className = "dot";
        const txt = document.createElement("span");
        txt.className = "txt";
        pill.appendChild(dot);
        pill.appendChild(txt);
        host.appendChild(pill);
      }
      // Text is set whether or not it is showing, so the reserved width is the
      // real width — a label applied only while thinking would still resize the
      // strip the first time it appeared.
      const short = (aiOpponentInfo && aiOpponentInfo.label || "Claude").replace(/^Claude /, "").replace(/ [\d.]+$/, "");
      pill.querySelector(".txt").textContent = `${short === "Claude" ? "Claude" : "Claude " + short} is thinking…`;
      pill.classList.toggle("is-idle", !aiThinking);
    } else if (pill) {
      // Not an AI game: no reason to reserve the space. Game mode cannot change
      // mid-match, so this removal can never cause a shift a player sees.
      pill.remove();
    }
  }
  const switcher = document.getElementById("playerSwitcher");
  if (switcher) switcher.style.display = isVsAiGame() ? "none" : "";
}

// ---- Boot -----------------------------------------------------------------

(async function aiBoot() {
  _aiInjectStyles();
  try {
    const r = await fetch("/api/ai/status");
    if (r.ok) {
      const s = await r.json();
      if (s && Array.isArray(s.models)) aiServerStatus = { envKey: Boolean(s.envKey), mock: Boolean(s.mock), models: s.models };
    }
  } catch { /* older server: keep defaults, options stay disabled without a local key */ }
  _aiMountPicker();
  _aiFillOpponentOptions();
})();
