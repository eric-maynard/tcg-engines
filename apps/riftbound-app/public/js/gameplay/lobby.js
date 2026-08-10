// lobby.js — Lobby management (create, join, deck selection, game mode, start)

function _surfaceLobbyError(msg) {
  console.error("[lobby]", msg);
  for (const id of ["soloDeckStatus", "lobbyStatus", "joinError"]) {
    const el = document.getElementById(id);
    if (el && el.offsetParent !== null) { el.textContent = msg; el.style.color = "#d04040"; }
  }
  const btn = document.querySelector('#soloDeckPicker .start-btn');
  if (btn) btn.disabled = false;
}

function showMenu() {
  document.getElementById("lobbyMenu").classList.remove("hidden");
  document.getElementById("joinForm").classList.add("hidden");
  document.getElementById("lobbyRoom").classList.add("hidden");
  document.getElementById("soloDeckPicker")?.classList.add("hidden");
}

function leaveLobby() {
  if (lobbyWs) {
    lobbyWs.close(1000);
    lobbyWs = null;
  }
  lobbyId = null;
  lobbyCode = null;
  lobbyRole = null;
  setSandboxGame(false);
  showMenu();
}

function showJoinForm() {
  document.getElementById("lobbyMenu").classList.add("hidden");
  document.getElementById("joinForm").classList.remove("hidden");
  document.getElementById("joinError").textContent = "";
  document.getElementById("joinCodeInput").value = "";
  document.getElementById("joinCodeInput").focus();
}

async function hostLobby() {
  const data = await api("/api/lobby/create", "POST", { name: currentUsername || "Player 1" });
  lobbyId = data.lobbyId;
  lobbyCode = data.code;
  lobbyRole = "host";
  viewingPlayer = P1;

  document.getElementById("lobbyMenu").classList.add("hidden");
  document.getElementById("lobbyRoom").classList.remove("hidden");
  const codeEl = document.getElementById("lobbyCode");
  codeEl.textContent = lobbyCode;
  codeEl.style.display = "";
  await loadSavedDecks();

  connectLobbyWs();
}

async function joinLobby() {
  const code = document.getElementById("joinCodeInput").value.toUpperCase().trim();
  if (code.length !== 4) {
    document.getElementById("joinError").textContent = "Enter a 4-character code";
    return;
  }

  const data = await api("/api/lobby/join", "POST", { code, name: currentUsername || "Player 2" });
  if (data.error) {
    document.getElementById("joinError").textContent = data.error;
    return;
  }

  lobbyId = data.lobbyId;
  lobbyCode = data.code;
  lobbyRole = "guest";
  viewingPlayer = P2;

  document.getElementById("joinForm").classList.add("hidden");
  document.getElementById("lobbyRoom").classList.remove("hidden");
  document.getElementById("lobbyCode").textContent = lobbyCode;
  await loadSavedDecks();

  connectLobbyWs();
}

function copyLobbyCode() {
  navigator.clipboard.writeText(lobbyCode).then(() => {
    const el = document.getElementById("codeCopied");
    el.style.opacity = "1";
    setTimeout(() => { el.style.opacity = "0"; }, 2000);
  });
}

function connectLobbyWs(onOpen) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${proto}//${location.host}/ws/lobby/${lobbyId}?role=${lobbyRole}`;
  console.log("[lobby] connecting", wsUrl);
  lobbyWs = new WebSocket(wsUrl);

  const failTimer = setTimeout(() => {
    if (lobbyWs && lobbyWs.readyState !== WebSocket.OPEN) {
      _surfaceLobbyError(`WebSocket to ${wsUrl} did not open within 5s. If you're behind a proxy/port-forward, it may not support WS upgrade.`);
    }
  }, 5000);
  lobbyWs.addEventListener("open", () => {
    clearTimeout(failTimer);
    console.log("[lobby] ws open");
    if (onOpen) try { onOpen(); } catch (e) { _surfaceLobbyError(String(e)); }
  });
  lobbyWs.addEventListener("error", (e) => {
    _surfaceLobbyError(`WebSocket error: ${e?.message || "connection failed"} (${wsUrl})`);
  });
  lobbyWs.addEventListener("close", (e) => {
    if (e.code !== 1000 && !gameId) _surfaceLobbyError(`WebSocket closed: code ${e.code} ${e.reason || ""}`);
  });

  lobbyWs.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    if (msg.type === "lobby_error") {
      _surfaceLobbyError(msg.error || "Lobby error");
      return;
    }

    if (msg.type === "lobby_update") {
      // Solo direct-play: never surface the lobby room or the d20 overlay.
      if (!_soloAutoStart) renderLobbyRoom(msg.lobby);

      // Step 1: Coin flip happened — show flip overlay (winner chooses)
      if (msg.lobby.coinFlip && !msg.lobby.coinFlip.firstPlayer && msg.lobby.status !== "started") {
        playerNames[P1] = msg.lobby.host?.name || "Player 1";
        playerNames[P2] = msg.lobby.guest?.name || "Player 2";
        if (_soloAutoStart) {
          lobbyWs.send(JSON.stringify({ choice: "self", type: "choose_first" }));
        } else {
          showCoinFlip(msg.lobby.coinFlip, null);
        }
      }

      // Step 2: Game started (winner chose) — update overlay, then dismiss and connect
      if (msg.lobby.status === "started" && msg.lobby.gameId) {
        gameId = msg.lobby.gameId;

        playerNames[P1] = msg.lobby.host?.name || "Player 1";
        playerNames[P2] = msg.lobby.guest?.name || "Player 2";
        saveSession();

        // Update the overlay text to show who goes first
        const flip = msg.lobby.coinFlip;
        const coinDetail = document.getElementById("coinDetail");
        const coinChoose = document.getElementById("coinChoose");
        if (coinChoose) coinChoose.style.display = "none";
        if (coinDetail && flip && flip.firstPlayer) {
          const firstIsMe = flip.firstPlayer === viewingPlayer;
          coinDetail.textContent = firstIsMe ? "You go first!" : `${pName(flip.firstPlayer)} goes first`;
          coinDetail.style.animation = "none";
          coinDetail.style.opacity = "1";
        }

        // Close lobby WS before connecting game WS
        if (lobbyWs) { lobbyWs.close(1000); lobbyWs = null; }

        const proceed = () => {
          _coinFlipShown = false;
          const overlay = document.getElementById("coinOverlay");
          if (overlay) overlay.classList.remove("visible");
          document.getElementById("startScreen").classList.add("hidden");
          _soloAutoStart = false;
          connectWs();
        };
        // Solo auto-start never showed the coin overlay, so there's nothing
        // to linger on — connect immediately instead of waiting 1.5s on a
        // blank screen.
        if (_soloAutoStart) proceed(); else setTimeout(proceed, 1500);
      }
    }
  };

  lobbyWs.onclose = () => {
    // Reconnect if lobby is still active
    if (lobbyId && !gameId) {
      setTimeout(() => connectLobbyWs(), 2000);
    }
  };
}

function renderLobbyRoom(lobby) {
  const isSandbox = lobby.sandbox;

  // Sync game mode selector from server state.
  // Single Player is a first-class mode: when lobby.sandbox is true we
  // treat the effective mode as "single-player" regardless of duel/match.
  const effectiveMode = isSandbox ? "single-player" : lobby.gameMode;
  if (effectiveMode) {
    currentGameMode = effectiveMode;
    const duelBtn = document.getElementById("modeDuel");
    const matchBtn = document.getElementById("modeMatch");
    const soloBtn = document.getElementById("modeSinglePlayer");
    if (duelBtn) duelBtn.classList.toggle("active", effectiveMode === "duel");
    if (matchBtn) matchBtn.classList.toggle("active", effectiveMode === "match");
    if (soloBtn) soloBtn.classList.toggle("active", effectiveMode === "single-player");
  }
  // Only host can change mode
  const modeSelector = document.getElementById("modeSelector");
  if (modeSelector && lobbyRole !== "host") {
    modeSelector.querySelectorAll(".mode-btn").forEach(b => b.disabled = true);
    modeSelector.style.opacity = "0.6";
  }

  // In sandbox mode, hide the code/share section
  const codeEl = document.getElementById("lobbyCode");
  const copiedEl = document.getElementById("codeCopied");
  const shareP = codeEl?.nextElementSibling?.nextElementSibling; // "Share this code" paragraph
  if (isSandbox) {
    if (codeEl) codeEl.style.display = "none";
    if (copiedEl) copiedEl.style.display = "none";
    if (shareP) shareP.style.display = "none";
  } else {
    // Single Player can be toggled off — restore the code/share section
    if (codeEl) codeEl.style.display = "";
    if (copiedEl) copiedEl.style.display = "";
    if (shareP) shareP.style.display = "";
  }

  // Host card
  document.getElementById("lobbyHost").innerHTML = `
    <div class="lpc-name">${esc(lobby.host.name)}</div>
    <div class="lpc-status ${lobby.host.hasDeck ? "ready" : ""}">${lobby.host.hasDeck ? "Ready" : "Choosing deck..."}</div>
  `;
  document.getElementById("lobbyHost").classList.remove("empty");

  // Guest card
  if (lobby.guest) {
    // In Single Player mode, label the opponent as "Solo Opponent" per Rift Atlas, with its deck.
    const od = lobby.opponentDeck;
    const oppDeckLabel = !od ? "" : od.mode === "mirror" ? "Same deck as you" : od.mode === "default" ? "Starter deck" : (od.deckName || "Saved deck");
    const descriptor = isSandbox ? "Solo Opponent" + (oppDeckLabel ? " · " + oppDeckLabel : "") : (lobby.guest.hasDeck ? "Ready" : "Choosing deck...");
    const readyClass = isSandbox || lobby.guest.hasDeck ? "ready" : "";
    document.getElementById("lobbyGuest").innerHTML = `
      <div class="lpc-name">${esc(lobby.guest.name)}</div>
      <div class="lpc-status ${readyClass}">${esc(descriptor)}</div>
    `;
    document.getElementById("lobbyGuest").classList.remove("empty");
  } else {
    document.getElementById("lobbyGuest").innerHTML = `
      <div class="lpc-name">Waiting...</div>
      <div class="lpc-status">Share the code above</div>
    `;
    document.getElementById("lobbyGuest").classList.add("empty");
  }

  // Single Player: the host also picks the practice seat's deck (same picker as the solo dialog).
  const oppRow = document.getElementById("lobbyOppDeckRow");
  if (oppRow) oppRow.style.display = isSandbox && lobbyRole === "host" ? "" : "none";

  // Start button — always visible; enabled only for the host when both sides are ready.
  const canStart = lobbyRole === "host" && lobby.host.hasDeck && lobby.guest?.hasDeck;
  document.getElementById("lobbyStartBtn").disabled = !canStart;

  // Status text
  const statusEl = document.getElementById("lobbyStatus");
  if (!lobby.host.hasDeck) {
    statusEl.textContent = "Select your deck to continue";
  } else if (!lobby.guest) {
    statusEl.textContent = "Waiting for opponent to join...";
  } else if (!lobby.guest.hasDeck) {
    statusEl.textContent = isSandbox ? "Ready! Click Start Game" : "Waiting for opponent to choose a deck...";
  } else if (lobbyRole === "host") {
    statusEl.textContent = "Ready! Click Start Game";
  } else {
    statusEl.textContent = "Ready! Waiting for host to start...";
  }
}

function selectDeck(deckId) {
  if (!lobbyWs || lobbyWs.readyState !== WebSocket.OPEN) return;
  lobbyWs.send(JSON.stringify({ type: "select_deck", deckId }));
}

let currentGameMode = "duel";

function setGameMode(mode) {
  currentGameMode = mode;
  const duelBtn = document.getElementById("modeDuel");
  const matchBtn = document.getElementById("modeMatch");
  const soloBtn = document.getElementById("modeSinglePlayer");
  if (duelBtn) duelBtn.classList.toggle("active", mode === "duel");
  if (matchBtn) matchBtn.classList.toggle("active", mode === "match");
  if (soloBtn) soloBtn.classList.toggle("active", mode === "single-player");
  if (!lobbyWs || lobbyWs.readyState !== WebSocket.OPEN) return;

  if (mode === "single-player") {
    // Promote this lobby to Single Player: server fills the opponent
    // slot with a Goldfish and flips sandbox mode on. Bypasses the
    // SANDBOX_ENABLED env gate — this is a first-class lobby mode.
    setSandboxGame(true);
    lobbyWs.send(JSON.stringify({ type: "set_single_player", enabled: true }));
    sendLobbyOppDeck();
  } else {
    // Demote single-player if the host re-picks Duel/Match, then
    // broadcast the underlying Bo1/Bo3 mode.
    if (isSandboxGame) {
      setSandboxGame(false);
      lobbyWs.send(JSON.stringify({ type: "set_single_player", enabled: false }));
    }
    lobbyWs.send(JSON.stringify({ type: "set_mode", mode }));
  }
}

/** "just now" / "5 minutes ago" / "3 hours ago" / "2 days ago" / date. */
function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (!iso || isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
  const h = Math.round(m / 60);
  if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  const d = Math.round(h / 24);
  if (d < 30) return d + (d === 1 ? " day ago" : " days ago");
  return new Date(t).toLocaleDateString();
}

/** Append an <optgroup> of saved decks, stashing display metadata on each option. */
function appendDeckGroup(select, label, decks) {
  const group = document.createElement("optgroup");
  group.label = label;
  for (const d of decks) {
    const o = document.createElement("option");
    o.value = d.id;
    o.textContent = d.name;
    o.dataset.legend = d.legendName || "";
    o.dataset.champion = d.championName || "";
    o.dataset.domains = (d.domains || []).join(",");
    o.dataset.updated = d.updatedAt || d.createdAt || "";
    group.appendChild(o);
  }
  select.appendChild(group);
}

/**
 * Fetch saved (+ optionally public) decks into `select`. The native <select>
 * stays the source of truth (harnesses drive it directly); renderDeckDropdown
 * layers the rich picker over it.
 */
async function loadSavedDecksInto(select, statusEl, opts = {}) {
  const out = { mine: [], publicDecks: [] };
  if (!select) return out;
  select.querySelectorAll("optgroup").forEach(g => g.remove());
  try {
    const decks = await api("/api/saved-decks");
    if (Array.isArray(decks) && decks.length > 0) {
      out.mine = decks;
      appendDeckGroup(select, "Your Saved Decks", decks);
      if (statusEl) statusEl.textContent = decks.length + " saved deck" + (decks.length === 1 ? "" : "s");
    } else if (statusEl) {
      // Dropdown always includes the starter deck, so don't claim "No saved decks".
      statusEl.textContent = "";
    }
  } catch {
    if (statusEl) statusEl.textContent = "";
  }
  if (opts.includePublic || opts.fetchPublic) {
    try {
      const publicDecks = await api("/api/saved-decks/public");
      if (Array.isArray(publicDecks) && publicDecks.length > 0) {
        out.publicDecks = publicDecks;
        if (opts.includePublic) appendDeckGroup(select, "Public Decks", publicDecks);
      }
    } catch { /* no public decks */ }
  }
  renderDeckDropdown(select);
  return out;
}

async function loadSavedDecks() {
  const lists = await loadSavedDecksInto(document.getElementById("deckSelect"), document.getElementById("deckLoadStatus"), { includePublic: true });
  mountLobbyOppDeckRow();
  fillOppDeckSelect(document.getElementById("lobbyOppDeckSelect"), document.getElementById("deckSelect"), lists);
}

// ---------------------------------------------------------------------------
// Opponent's deck (practice seat: Goldfish / Claude). Same rich picker as the
// player's; the server validates ownership (own decks, public decks, starter).
// Value encoding of the <select>: "mirror" | "random-mine" | "default" | <saved deck id>.
// ---------------------------------------------------------------------------

const OPP_DECK_STORAGE = "rb-opponent-deck";

function getStoredOppDeck() {
  try { return localStorage.getItem(OPP_DECK_STORAGE) || "mirror"; } catch { return "mirror"; }
}
function setStoredOppDeck(v) {
  try { localStorage.setItem(OPP_DECK_STORAGE, v); } catch { /* storage unavailable */ }
}

/** `opponent.deck` for /api/lobby/create (and the lobby-room WS message) from a picker value. */
function oppDeckSpecFromValue(value) {
  if (!value || value === "default") return { mode: "default" };
  if (value === "mirror" || value === "random-mine") return { mode: value };
  return { mode: "deck", deckId: value };
}

function soloOpponentDeckSpec() {
  const sel = document.getElementById("soloOppDeckSelect");
  return oppDeckSpecFromValue(sel ? sel.value : getStoredOppDeck());
}

/**
 * Fill an opponent-deck <select>: "Same as mine (mirror)", "Random from my decks"
 * (only with saved decks), Your Saved Decks, Public Decks (minus mine), Default
 * starter. Restores the remembered choice; mirrors the player's chip.
 */
function fillOppDeckSelect(select, playerSelect, lists) {
  if (!select) return;
  const mine = (lists && lists.mine) || [];
  const mineIds = new Set(mine.map(d => d.id));
  const publicDecks = ((lists && lists.publicDecks) || []).filter(d => !mineIds.has(d.id));
  select.textContent = "";
  const mk = (value, text, sub) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    if (sub) o.dataset.sub = sub;
    return o;
  };
  select.appendChild(mk("mirror", "Same as mine (mirror)", "A copy of whatever deck you pick"));
  if (mine.length > 0) {
    select.appendChild(mk("random-mine", "Random from my decks", `One of your ${mine.length} saved deck${mine.length === 1 ? "" : "s"}, drawn when the game is created`));
  }
  if (mine.length > 0) appendDeckGroup(select, "Your Saved Decks", mine);
  if (publicDecks.length > 0) appendDeckGroup(select, "Public Decks", publicDecks);
  const starter = document.createElement("optgroup");
  starter.label = "Default starter";
  starter.appendChild(mk("default", "Fury/Chaos Starter Deck"));
  select.appendChild(starter);
  const want = getStoredOppDeck();
  select.value = [...select.options].some(o => o.value === want) ? want : "mirror";
  syncMirrorOption(select, playerSelect);
  renderDeckDropdown(select);
}

/** The "mirror" entry shows the player's current pick (legend · champion chip + pips). */
function syncMirrorOption(select, playerSelect) {
  const mirror = select && [...select.options].find(o => o.value === "mirror");
  if (!mirror) return;
  const src = playerSelect && playerSelect.options[playerSelect.selectedIndex];
  const has = src && src.value;
  mirror.dataset.legend = has ? (src.dataset.legend || "") : "";
  mirror.dataset.champion = has ? (src.dataset.champion || "") : "";
  mirror.dataset.domains = has ? (src.dataset.domains || "") : "";
  const who = has ? [src.dataset.legend, src.dataset.champion].filter(Boolean).join(" · ") : "";
  mirror.dataset.sub = has ? `→ ${src.textContent}${who ? " — " + who : src.value === "default" ? " — Starter deck" : ""}` : "A copy of whatever deck you pick";
}

/** Wire an opponent-deck select: remember the choice, mirror the player's pick, notify `onPick`. */
function wireOppDeckSelect(select, playerSelect, onPick) {
  if (!select || select.dataset.wired) return;
  select.dataset.wired = "1";
  select.addEventListener("change", () => {
    setStoredOppDeck(select.value);
    if (onPick) onPick(oppDeckSpecFromValue(select.value));
  });
  if (playerSelect) {
    playerSelect.addEventListener("change", () => { syncMirrorOption(select, playerSelect); renderDeckDropdown(select); });
  }
}

function _oppDeckRow(id, selectId) {
  const row = document.createElement("div");
  row.id = id;
  row.className = "opp-deck-row";
  row.style.cssText = "margin-top:12px;text-align:left;";
  const label = document.createElement("label");
  label.setAttribute("for", selectId);
  label.style.cssText = "color:#8a82a6;font-size:11px;text-transform:uppercase;letter-spacing:1px;";
  label.textContent = "Opponent's deck";
  const sel = document.createElement("select");
  sel.id = selectId;
  sel.style.cssText = "display:block;width:100%;margin-top:4px;padding:8px 12px;background:#1e1b30;border:2px solid #3a3560;border-radius:6px;color:#e0dced;font-size:13px;";
  sel.appendChild(Object.assign(document.createElement("option"), { textContent: "Same as mine (mirror)", value: "mirror" }));
  row.appendChild(label);
  row.appendChild(sel);
  return row;
}

/** Solo dialog: "Opponent's deck" directly under the Opponent (Goldfish/Claude) selector. */
function mountSoloOppDeckRow() {
  if (document.getElementById("soloOppDeckRow")) return;
  const picker = document.getElementById("soloDeckPicker");
  if (!picker) return;
  const row = _oppDeckRow("soloOppDeckRow", "soloOppDeckSelect");
  // ai-opponent.js inserts its Opponent row + hint right after #soloDeckStatus,
  // so anchoring after the hint (or the status line before it exists) keeps
  // the order: your deck → Opponent → Opponent's deck.
  const anchor = document.getElementById("soloOpponentHint") || document.getElementById("soloDeckStatus");
  if (anchor && anchor.parentElement === picker) anchor.insertAdjacentElement("afterend", row); else picker.appendChild(row);
  wireOppDeckSelect(row.querySelector("select"), document.getElementById("soloDeckSelect"));
  renderDeckDropdown(row.querySelector("select"));
}

/** Lobby room (Single Player / hot-seat): host picks the practice seat's deck; sent over the lobby socket. */
function mountLobbyOppDeckRow() {
  if (document.getElementById("lobbyOppDeckRow")) return;
  const status = document.getElementById("deckLoadStatus");
  const host = status && status.parentElement;
  if (!host) return;
  const row = _oppDeckRow("lobbyOppDeckRow", "lobbyOppDeckSelect");
  row.style.display = isSandboxGame && lobbyRole === "host" ? "" : "none";
  host.insertAdjacentElement("afterend", row);
  wireOppDeckSelect(row.querySelector("select"), document.getElementById("deckSelect"), (deck) => {
    if (lobbyWs && lobbyWs.readyState === WebSocket.OPEN) lobbyWs.send(JSON.stringify({ deck, type: "select_opponent_deck" }));
  });
}

/** Push the lobby-room opponent-deck choice once the socket is up (Single Player lobbies). */
function sendLobbyOppDeck() {
  const sel = document.getElementById("lobbyOppDeckSelect");
  if (!sel || !isSandboxGame || lobbyRole !== "host") return;
  if (lobbyWs && lobbyWs.readyState === WebSocket.OPEN) lobbyWs.send(JSON.stringify({ deck: oppDeckSpecFromValue(sel.value), type: "select_opponent_deck" }));
}

const DECK_DD_DOMAIN_LABELS = { fury: "F", calm: "C", mind: "M", body: "B", chaos: "X", order: "O" };

/** Secondary line for a deck option: "Legend · Champion — Updated 2 hours ago". */
function deckOptionSubtitle(opt) {
  if (!opt || !opt.value) return "";
  if (opt.dataset && opt.dataset.sub) return opt.dataset.sub;
  if (opt.value === "default") return "Starter deck";
  const who = [opt.dataset.legend, opt.dataset.champion].filter(Boolean).join(" · ");
  const when = timeAgo(opt.dataset.updated);
  return [who, when && "Updated " + when].filter(Boolean).join(" — ");
}

function deckOptionDomainsHtml(opt) {
  const domains = (opt?.dataset?.domains || "").split(",").filter(Boolean);
  return domains.map(d => `<span class="deck-dd-pip pip-${esc(d)}" title="${esc(d)}">${esc(DECK_DD_DOMAIN_LABELS[d] || d[0].toUpperCase())}</span>`).join("");
}

function deckOptionHtml(opt) {
  const sub = deckOptionSubtitle(opt);
  return `<span class="deck-dd-text">
      <span class="deck-dd-name">${esc(opt ? opt.textContent : "-- Choose a deck --")}</span>
      ${sub ? `<span class="deck-dd-sub">${esc(sub)}</span>` : ""}
    </span>
    <span class="deck-dd-pips">${deckOptionDomainsHtml(opt)}</span>`;
}

/**
 * Build (or refresh) the rich deck picker layered over a native <select>.
 * Picking an item sets select.value and dispatches "change", so existing
 * onchange handlers and anything driving the <select> directly keep working.
 */
function renderDeckDropdown(select) {
  if (!select) return;
  let dd = select.nextElementSibling?.classList?.contains("deck-dd") ? select.nextElementSibling : null;
  if (!dd) {
    dd = document.createElement("div");
    dd.className = "deck-dd";
    dd.innerHTML = `<button type="button" class="deck-dd-btn" aria-haspopup="listbox"></button><div class="deck-dd-menu hidden" role="listbox"></div>`;
    select.insertAdjacentElement("afterend", dd);
    select.classList.add("deck-dd-native");
    const btn = dd.querySelector(".deck-dd-btn");
    const menu = dd.querySelector(".deck-dd-menu");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".deck-dd-menu").forEach(m => { if (m !== menu) m.classList.add("hidden"); });
      menu.classList.toggle("hidden");
      menu.querySelector(".deck-dd-item.selected")?.scrollIntoView({ block: "nearest" });
    });
    menu.addEventListener("click", (e) => {
      const item = e.target.closest(".deck-dd-item");
      if (!item) return;
      e.stopPropagation();
      select.value = item.dataset.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      menu.classList.add("hidden");
    });
    select.addEventListener("change", () => renderDeckDropdown(select));
    document.addEventListener("click", () => menu.classList.add("hidden"));
  }

  const btn = dd.querySelector(".deck-dd-btn");
  const menu = dd.querySelector(".deck-dd-menu");
  const selected = select.options[select.selectedIndex];
  btn.innerHTML = deckOptionHtml(selected && selected.value ? selected : null) + `<span class="deck-dd-caret">▾</span>`;

  let html = "";
  const renderItem = (opt) => {
    if (!opt.value) return "";
    const sel = opt.value === select.value ? " selected" : "";
    return `<div class="deck-dd-item${sel}" role="option" data-value="${esc(opt.value)}">${deckOptionHtml(opt)}</div>`;
  };
  for (const child of select.children) {
    if (child.tagName === "OPTGROUP") {
      html += `<div class="deck-dd-group">${esc(child.label)}</div>`;
      for (const opt of child.children) html += renderItem(opt);
    } else {
      html += renderItem(child);
    }
  }
  menu.innerHTML = html;
}

// Dress both pickers immediately (starter deck only) so the lobby never
// flashes a bare <select> before the saved decks arrive.
renderDeckDropdown(document.getElementById("deckSelect"));
renderDeckDropdown(document.getElementById("soloDeckSelect"));

function lobbyStartGame() {
  if (!lobbyWs || lobbyWs.readyState !== WebSocket.OPEN) return;
  lobbyWs.send(JSON.stringify({ type: "start_game" }));
}

/**
 * Solo modes (Goldfish / VS AI) skip the lobby room entirely — the player
 * just picks a deck and plays. Server-side we still create a `sandbox:true`
 * lobby (that's what wires up the Goldfish auto-play), but the client never
 * shows the lobby room: deck selection + start happen in one go.
 */
let _soloMode = "goldfish";
let _soloAutoStart = false;

// "VS Claude": the opponent picker / API-key settings / thinking pill live in
// ai-opponent.js, loaded here so gameplay.html needs no extra tag. Every call
// into it is typeof-guarded, so the lobby works before (or without) it.
(function loadAiOpponentModule() {
  if (document.querySelector('script[data-rb-ai]')) return;
  const s = document.createElement("script");
  s.src = "/js/gameplay/ai-opponent.js";
  s.dataset.rbAi = "1";
  document.head.appendChild(s);
})();

async function showSoloDeckPicker(mode) {
  _soloMode = mode;
  document.getElementById("lobbyMenu").classList.add("hidden");
  document.getElementById("soloDeckPicker").classList.remove("hidden");
  // Opponent row (Goldfish · Claude Haiku/Sonnet/Opus) — ai-opponent.js.
  if (typeof aiPreparePicker === "function") aiPreparePicker(mode);
  mountSoloOppDeckRow();
  const lists = await loadSavedDecksInto(document.getElementById("soloDeckSelect"), document.getElementById("soloDeckStatus"), { fetchPublic: true });
  fillOppDeckSelect(document.getElementById("soloOppDeckSelect"), document.getElementById("soloDeckSelect"), lists);
}

async function startSoloGame() {
  const deckId = document.getElementById("soloDeckSelect").value || "default";
  const gameMode = document.querySelector('input[name="soloMode"]:checked')?.value || "duel";
  // The API key (if any) travels only in this request body; the server keeps it in memory for the game.
  const opponent = typeof buildOpponentRequest === "function" ? buildOpponentRequest() : { kind: "goldfish" };
  // Which deck the bot plays (mirror / random of mine / a saved or public deck / starter) — validated server-side.
  opponent.deck = soloOpponentDeckSpec();
  const data = await api("/api/lobby/create", "POST", { gameMode, name: currentUsername || "Player 1", opponent, sandbox: true });
  if (data.error) {
    // Nothing was created server-side; stay on the picker with the reason.
    const st = document.getElementById("soloDeckStatus");
    st.textContent = data.error;
    st.style.color = "#d04040";
    return;
  }
  lobbyId = data.lobbyId;
  lobbyCode = data.code;
  lobbyRole = "host";
  setSandboxGame(true);
  viewingPlayer = P1;

  // Open the WS, and once open: set deck → start. The lobby_update handler
  // sees _soloAutoStart and auto-sends choose_first when the coinFlip lands,
  // so no d20 overlay is shown — straight to mulligan.
  _soloAutoStart = true;
  const status = document.getElementById("soloDeckStatus");
  const btn = document.querySelector('#soloDeckPicker .start-btn');
  if (btn) btn.disabled = true;
  if (status) status.textContent = "Starting…";
  connectLobbyWs(() => {
    lobbyWs.send(JSON.stringify({ deckId, type: "select_deck" }));
    lobbyWs.send(JSON.stringify({ type: "start_game" }));
  });
  // Keep the picker visible with "Starting…" until proceed() hides #startScreen.
}

/** Solo (hot-seat) — creates a lobby with P2 auto-joined using default deck */
async function hostSandbox() {
  const data = await api("/api/lobby/create", "POST", { name: currentUsername || "Player 1", sandbox: true });
  if (data.error) {
    // Sandbox not enabled on server
    const el = document.getElementById("sandboxOption");
    if (el) el.innerHTML = '<p style="color:#d04040;font-size:12px;">Goldfish mode is disabled on this server</p>';
    return;
  }
  lobbyId = data.lobbyId;
  lobbyCode = data.code;
  lobbyRole = "host";
  setSandboxGame(true);
  viewingPlayer = P1;

  document.getElementById("lobbyMenu").classList.add("hidden");
  document.getElementById("lobbyRoom").classList.remove("hidden");
  // Sandbox lobbies never share a code — hide the code/share section now so it
  // doesn't flash while loadSavedDecks() awaits and before the first WS update.
  const codeEl = document.getElementById("lobbyCode");
  if (codeEl) { codeEl.textContent = ""; codeEl.style.display = "none"; }
  const copiedEl = document.getElementById("codeCopied");
  if (copiedEl) copiedEl.style.display = "none";
  const shareP = codeEl?.nextElementSibling?.nextElementSibling;
  if (shareP) shareP.style.display = "none";
  await loadSavedDecks();

  connectLobbyWs(sendLobbyOppDeck);
}

// Check if sandbox is enabled on load
(async () => {
  const r = await api("/api/config").catch(() => null);
  if (r && r.sandboxEnabled === false) {
    const el = document.getElementById("sandboxOption");
    if (el) el.style.display = "none";
  }
})();
