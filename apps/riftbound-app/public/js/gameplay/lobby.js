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
  isSandboxGame = false;
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
    // In Single Player mode, label the opponent as "Solo Opponent" per Rift Atlas.
    const descriptor = isSandbox ? "Solo Opponent" : (lobby.guest.hasDeck ? "Ready" : "Choosing deck...");
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
    isSandboxGame = true;
    lobbyWs.send(JSON.stringify({ type: "set_single_player", enabled: true }));
  } else {
    // Demote single-player if the host re-picks Duel/Match, then
    // broadcast the underlying Bo1/Bo3 mode.
    if (isSandboxGame) {
      isSandboxGame = false;
      lobbyWs.send(JSON.stringify({ type: "set_single_player", enabled: false }));
    }
    lobbyWs.send(JSON.stringify({ type: "set_mode", mode }));
  }
}

/** Fetch saved decks and populate the dropdown */
async function loadSavedDecksInto(select, statusEl) {
  if (!select) return;
  select.querySelectorAll("optgroup").forEach(g => g.remove());
  try {
    const decks = await api("/api/saved-decks");
    if (Array.isArray(decks) && decks.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "Your Saved Decks";
      for (const d of decks) {
        const o = document.createElement("option"); o.value = d.id; o.textContent = d.name; group.appendChild(o);
      }
      select.appendChild(group);
      if (statusEl) statusEl.textContent = decks.length + " saved deck" + (decks.length === 1 ? "" : "s");
    }
  } catch {}
}

async function loadSavedDecks() {
  const select = document.getElementById("deckSelect");
  const statusEl = document.getElementById("deckLoadStatus");
  if (!select) return;

  // Remove previously loaded options (keep "" empty and "default")
  for (const opt of [...select.options]) {
    if (opt.value && opt.value !== "default" && !opt.parentElement?.tagName?.match(/optgroup/i)) continue;
    if (opt.parentElement?.tagName === "OPTGROUP") continue;
  }
  select.querySelectorAll("optgroup").forEach(g => g.remove());

  try {
    const decks = await api("/api/saved-decks");
    if (Array.isArray(decks) && decks.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "Your Saved Decks";
      for (const deck of decks) {
        const opt = document.createElement("option");
        opt.value = deck.id;
        opt.textContent = deck.name;
        group.appendChild(opt);
      }
      select.appendChild(group);
      if (statusEl) statusEl.textContent = decks.length + " saved deck" + (decks.length === 1 ? "" : "s") + " found";
    } else {
      // Dropdown always includes the starter deck, so don't claim "No saved decks".
      if (statusEl) statusEl.textContent = "";
    }
  } catch {
    if (statusEl) statusEl.textContent = "";
  }

  try {
    const publicDecks = await api("/api/saved-decks/public");
    if (Array.isArray(publicDecks) && publicDecks.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "Public Decks";
      for (const deck of publicDecks) {
        const opt = document.createElement("option");
        opt.value = deck.id;
        opt.textContent = deck.name;
        group.appendChild(opt);
      }
      select.appendChild(group);
    }
  } catch { /* no public decks */ }
}

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

async function showSoloDeckPicker(mode) {
  _soloMode = mode;
  document.getElementById("lobbyMenu").classList.add("hidden");
  document.getElementById("soloDeckPicker").classList.remove("hidden");
  await loadSavedDecksInto(document.getElementById("soloDeckSelect"), document.getElementById("soloDeckStatus"));
}

async function startSoloGame() {
  const deckId = document.getElementById("soloDeckSelect").value || "default";
  const gameMode = document.querySelector('input[name="soloMode"]:checked')?.value || "duel";
  const data = await api("/api/lobby/create", "POST", { gameMode, name: currentUsername || "Player 1", sandbox: true });
  if (data.error) {
    document.getElementById("soloDeckStatus").textContent = data.error;
    return;
  }
  lobbyId = data.lobbyId;
  lobbyCode = data.code;
  lobbyRole = "host";
  isSandboxGame = true;
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
  isSandboxGame = true;
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

  connectLobbyWs();
}

// Check if sandbox is enabled on load
(async () => {
  const r = await api("/api/config").catch(() => null);
  if (r && r.sandboxEnabled === false) {
    const el = document.getElementById("sandboxOption");
    if (el) el.style.display = "none";
  }
})();
