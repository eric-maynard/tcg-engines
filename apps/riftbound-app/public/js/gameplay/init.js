// init.js — Initialization: keyboard handlers, session reconnect, start screen setup

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Don't handle keyboard shortcuts if typing in an input
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;

  if (e.key === "Escape") {
    if (document.getElementById("cardZoom")?.classList.contains("visible")) {
      closeZoom();
    } else if (document.getElementById("chainOverlay")?.classList.contains("visible")) {
      // Don't close chain overlay with escape — must pass or act
    } else if (interaction.mode !== "idle") {
      cancelInteraction();
    }
  }

  // Spacebar = Pass (most common action in Riftbound), or End Turn if no pass available
  if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    const passMove = availableMoves.find(m => m.moveId === "passChainPriority" || m.moveId === "passShowdownFocus");
    if (passMove) {
      executeMove(passMove.moveId, passMove.params, passMove.playerId);
    } else {
      // Fall back to End Turn if no pass move is available
      const endTurnMove = availableMoves.find(m => m.moveId === "endTurn");
      if (endTurnMove) {
        executeMove(endTurnMove.moveId, endTurnMove.params, endTurnMove.playerId);
      }
    }
  }

  // Ctrl+Z = Undo, Ctrl+Shift+Z / Ctrl+Y = Redo
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    requestUndo();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
    e.preventDefault();
    requestRedo();
  }
});

/** Handle clicks on the player base zone (for playCard targets) */
document.addEventListener("click", (e) => {
  const baseEl = document.getElementById("player-base");
  if (!baseEl) return;

  // Check if the click was directly on the base zone (not on a card inside it)
  if (e.target === baseEl || (e.target.parentElement === baseEl && !e.target.closest("[data-card-id]"))) {
    if (interaction.mode === "cardSelected" && interaction.action === "playCard") {
      onZoneClick("player-base");
    }
  }
});

// Auto-reconnect on page load from sessionStorage
(function tryReconnect() {
  const saved = sessionStorage.getItem("rb_game");
  if (!saved) return;
  try {
    const s = JSON.parse(saved);
    if (!s.gameId) return;

    // First check if the game still exists on the server before hiding the lobby
    fetch(`/api/game/${s.gameId}/state`).then(r => {
      if (!r.ok) {
        // Game doesn't exist — clear stale session
        sessionStorage.removeItem("rb_game");
        return;
      }
      // Game exists — reconnect
      gameId = s.gameId;
      viewingPlayer = s.viewingPlayer || P1;
      lobbyRole = s.lobbyRole || null;
      isSandboxGame = s.isSandbox || false;
      if (s.playerNames) playerNames = s.playerNames;
      document.getElementById("startScreen").classList.add("hidden");
      connectWs();
    }).catch(() => {
      sessionStorage.removeItem("rb_game");
    });
  } catch {
    sessionStorage.removeItem("rb_game");
  }
})();
