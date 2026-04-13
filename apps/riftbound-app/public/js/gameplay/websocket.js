// websocket.js — WebSocket connection management with auto-reconnect

let ws = null;
let wsReconnectAttempts = 0;
let wsReconnectTimer = null;
let wsConnected = false;
const WS_MAX_RECONNECT_DELAY = 30000; // 30s cap
const WS_BASE_DELAY = 500; // 500ms initial

function getWsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/game/${gameId}?player=${viewingPlayer}`;
}

function connectWs() {
  if (!gameId) return;
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

  updateConnectionStatus("connecting");
  ws = new WebSocket(getWsUrl());

  ws.onopen = () => {
    wsConnected = true;
    wsReconnectAttempts = 0;
    updateConnectionStatus("connected");
    console.log("[WS] Connected");
  };

  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    switch (msg.type) {
      case "sync":
        // Full state snapshot (on connect or explicit resync)
        lastSeq = msg.seq;
        gameState = msg.state;
        availableMoves = msg.moves || [];
        if (msg.state?.playerNames) playerNames = msg.state.playerNames;
        resetInteractionSilent();

        // Check for pregame state
        if (msg.pregame && msg.pregame.phase) {
          handlePregameSync(msg.pregame, msg.state);
        } else {
          hidePregame();
          render();
        }
        break;

      case "move_accepted":
        // Our move was accepted
        lastSeq = msg.seq;
        previousGameState = gameState;
        gameState = msg.state;
        availableMoves = msg.moves || [];
        if (msg.state?.playerNames) playerNames = msg.state.playerNames;

        // Detect combat results from state change
        detectCombatResult(previousGameState, gameState);

        // If in costPayment mode, preserve it and re-evaluate affordability
        if (interaction.mode === "costPayment" && interaction.pendingCardId) {
          detectAndShowResourceDeltas();
          render();
          reevaluateCostPayment();
        } else {
          detectAndShowResourceDeltas();
          resetInteractionSilent();
          render();
        }
        break;

      case "state_update":
        // Another player made a move
        lastSeq = msg.seq;
        previousGameState = gameState;
        gameState = msg.state;
        availableMoves = msg.moves || [];

        // Detect combat results from state change
        detectCombatResult(previousGameState, gameState);

        resetInteractionSilent();
        render();
        addLogEntry(`${pName(msg.playerId)}: ${LOG_MOVE_NAMES[msg.moveId] || msg.moveId}`);
        // Show channel banner when turn starts with channeling
        if (msg.moveId === "channelRunes") showChannelBanner(2);
        break;

      case "move_rejected":
        console.warn("[WS] Move rejected:", msg.error);
        addLogEntry(`Error: ${msg.error}`);
        if (typeof showToast === "function") showToast(`Move rejected: ${msg.error}`);
        break;

      case "player_connected":
        if (msg.playerId !== viewingPlayer) {
          hideDisconnectBanner();
          addLogEntry(`${pName(msg.playerId)} reconnected`);
        }
        break;

      case "player_disconnected":
        if (msg.playerId !== viewingPlayer) {
          showDisconnectBanner(pName(msg.playerId));
          addLogEntry(`${pName(msg.playerId)} disconnected`);
        }
        break;

      case "game_ended":
        // Host left — game is over, return to lobby
        addLogEntry("Game ended — host left");
        showToast("Game ended — host left the game");
        setTimeout(() => {
          disconnectWs();
          gameId = null;
          gameState = null;
          clearSession();
          document.getElementById("gameSidebar")?.classList.add("hidden");
          document.getElementById("startScreen").classList.remove("hidden");
          document.getElementById("lobbyMenu")?.classList.remove("hidden");
          document.getElementById("lobbyRoom")?.classList.add("hidden");
        }, 2000);
        break;

      case "pong":
        break;

      case "game_ping":
        handlePing(msg);
        break;
    }
  };

  ws.onclose = (e) => {
    wsConnected = false;
    console.log("[WS] Disconnected:", e.code, e.reason);

    // Don't reconnect on intentional close (1000) or game-not-found (4004)
    if (e.code === 1000 || e.code === 4004) {
      updateConnectionStatus("disconnected");
      if (e.code === 4004) {
        // Game session expired (server restarted) — return to lobby
        clearSession();
        gameId = null;
        gameState = null;
        document.getElementById("gameSidebar")?.classList.add("hidden");
        document.getElementById("pregameOverlay")?.classList.remove("visible");
        document.getElementById("startScreen").classList.remove("hidden");
        document.getElementById("lobbyMenu")?.classList.remove("hidden");
        document.getElementById("lobbyRoom")?.classList.add("hidden");
        showToast("Game session expired — start a new game");
      }
      return;
    }

    // Give up after too many reconnect attempts — game is probably gone
    if (wsReconnectAttempts >= 5) {
      clearSession();
      gameId = null;
      gameState = null;
      document.getElementById("gameSidebar")?.classList.add("hidden");
      document.getElementById("pregameOverlay")?.classList.remove("visible");
      document.getElementById("startScreen").classList.remove("hidden");
      document.getElementById("lobbyMenu")?.classList.remove("hidden");
      document.getElementById("lobbyRoom")?.classList.add("hidden");
      showToast("Lost connection to game");
      return;
    }

    // Auto-reconnect with exponential backoff + jitter
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose will fire after this
  };
}

function scheduleReconnect() {
  if (wsReconnectTimer) return;

  wsReconnectAttempts++;
  const delay = Math.min(
    WS_BASE_DELAY * Math.pow(2, wsReconnectAttempts - 1) + Math.random() * 500,
    WS_MAX_RECONNECT_DELAY,
  );

  updateConnectionStatus("reconnecting", delay);
  console.log(`[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${wsReconnectAttempts})`);

  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    connectWs();
  }, delay);
}

function disconnectWs() {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (ws) {
    ws.close(1000);
    ws = null;
  }
  wsConnected = false;
}

function requestResync() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "resync" }));
  }
}

// Keepalive ping every 25s
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "ping" }));
  }
}, 25000);

function updateConnectionStatus(status, delay) {
  const el = document.getElementById("connStatus");
  if (!el) return;
  if (status === "connected") {
    el.textContent = "Connected";
    el.style.color = "#50c878";
  } else if (status === "connecting") {
    el.textContent = "Connecting...";
    el.style.color = "#d0d040";
  } else if (status === "reconnecting") {
    el.textContent = `Reconnecting in ${Math.round(delay / 1000)}s...`;
    el.style.color = "#d08030";
  } else {
    el.textContent = "Disconnected";
    el.style.color = "#d04040";
  }
}
