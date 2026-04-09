// game-flow.js — Game flow and turn management: move execution, phase bar, end turn, game over

function executeMove(moveId, params, playerId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addLogEntry("Not connected — retrying...");
    connectWs();
    return;
  }
  const pid = playerId || viewingPlayer;
  // In hot-seat mode, reconnect as the correct player if needed
  if (pid !== viewingPlayer) {
    // For hot-seat, send via REST fallback since WS is bound to viewingPlayer
    api(`/api/game/${gameId}/move`, "POST", { moveId, playerId: pid, params }).then(data => {
      if (data.success) {
        gameState = data.state;
        requestResync(); // resync WS state
        render();
      } else {
        addLogEntry(`Error: ${data.error}`);
      }
    });
    return;
  }

  const requestId = `req-${++requestCounter}`;
  ws.send(JSON.stringify({ type: "move", moveId, params, requestId }));
}

// Phase Bar, End Turn, Game Over

const PHASE_ORDER = ["awaken", "beginning", "channel", "draw", "main", "ending", "cleanup"];
const PHASE_LABELS = {
  awaken: "Awaken",
  beginning: "Beginning",
  channel: "Channel",
  draw: "Draw",
  main: "Main",
  ending: "Ending",
  cleanup: "Cleanup",
};

/** Track previous phase for transition animation */
let _prevPhase = null;
let _prevActivePlayer = null;

function renderPhaseBar() {
  const bar = document.getElementById("phaseBar");
  if (!bar || !gameState) return;

  const phase = gameState.turn?.phase ?? "setup";
  const activeP = gameState.turn?.activePlayer ?? "";
  const isYourTurn = activeP === viewingPlayer;
  const status = gameState.status;

  if (status !== "playing") {
    bar.innerHTML = "";
    return;
  }

  const currentIdx = PHASE_ORDER.indexOf(phase);

  const chainActive = gameState.interaction?.chain?.active;
  const showdownActive = gameState.interaction?.showdownStack?.length > 0;

  let html;
  if (chainActive) {
    html = `<span class="pb-player">Resolving Chain</span>`;
  } else if (showdownActive) {
    html = `<span class="pb-player">Showdown</span>`;
  } else {
    html = `<span class="pb-player ${isYourTurn ? "is-you" : ""}">${isYourTurn ? "Your Turn" : esc(pName(activeP)) + "'s Turn"}</span>`;
  }

  for (let i = 0; i < PHASE_ORDER.length; i++) {
    const p = PHASE_ORDER[i];
    let cls = "phase-item";
    if (currentIdx >= 0) {
      if (i < currentIdx) cls += " completed";
      else if (i === currentIdx) cls += " current";
      else cls += " future";
    } else {
      cls += " future";
    }
    html += `<span class="${cls}">${PHASE_LABELS[p]}</span>`;
  }

  bar.innerHTML = html;
}

function renderEndTurnButton() {
  const btn = document.getElementById("endTurnBtn");
  if (!btn || !gameState) return;

  const status = gameState.status;
  const phase = gameState.turn?.phase ?? "setup";
  const activeP = gameState.turn?.activePlayer ?? "";
  const isYourTurn = activeP === viewingPlayer;

  // Hide when game is not playing
  if (status !== "playing") {
    btn.style.display = "none";
    return;
  }

  btn.style.display = "block";

  // Check if endTurn move is available
  const endTurnMove = availableMoves.find(m => m.moveId === "endTurn");

  if (isYourTurn && phase === "main" && endTurnMove) {
    btn.disabled = false;
    btn.classList.add("glow");
    btn.innerHTML = "End Turn";
  } else if (isYourTurn && phase === "main") {
    btn.disabled = true;
    btn.classList.remove("glow");
    btn.innerHTML = `End Turn<span class="etb-sub">Not available yet</span>`;
  } else if (!isYourTurn) {
    btn.disabled = true;
    btn.classList.remove("glow");
    btn.innerHTML = `Opponent's Turn<span class="etb-sub">${esc(PHASE_LABELS[phase] || phase)}</span>`;
  } else {
    btn.disabled = true;
    btn.classList.remove("glow");
    btn.innerHTML = `${esc(PHASE_LABELS[phase] || phase)}<span class="etb-sub">Phase</span>`;
  }
}

function onEndTurnClick() {
  const endTurnMove = availableMoves.find(m => m.moveId === "endTurn");
  if (endTurnMove) {
    executeMove(endTurnMove.moveId, endTurnMove.params, endTurnMove.playerId);
  }
}

function showPhaseTransition(phaseName) {
  const board = document.getElementById("board");
  if (!board) return;

  // Remove any existing flash
  board.querySelectorAll(".phase-transition-flash").forEach(el => el.remove());

  const flash = document.createElement("div");
  flash.className = "phase-transition-flash";
  flash.textContent = phaseName;
  board.appendChild(flash);

  setTimeout(() => {
    if (flash.parentNode) flash.remove();
  }, 1900);
}

/** Detect phase changes and trigger transition flash */
function checkPhaseTransition() {
  if (!gameState) return;
  const currentPhase = gameState.turn?.phase ?? null;
  const currentActive = gameState.turn?.activePlayer ?? null;

  if (_prevPhase !== null && currentPhase !== _prevPhase && gameState.status === "playing") {
    const label = PHASE_LABELS[currentPhase] || currentPhase;
    showPhaseTransition(label + " Phase");
  }

  _prevPhase = currentPhase;
  _prevActivePlayer = currentActive;
}

function renderGameOver() {
  const overlay = document.getElementById("gameOverOverlay");
  const box = document.getElementById("gameOverBox");
  if (!overlay || !box || !gameState) return;

  if (gameState.status !== "finished") {
    overlay.classList.remove("visible");
    return;
  }

  const winner = gameState.winner;
  const isWinner = winner === viewingPlayer;
  const opponent = viewingPlayer === P1 ? P2 : P1;

  const viewerVP = gameState.players?.[viewingPlayer]?.victoryPoints ?? 0;
  const opponentVP = gameState.players?.[opponent]?.victoryPoints ?? 0;
  const targetVP = gameState.victoryScore ?? "?";

  box.innerHTML = `
    <div class="go-result ${isWinner ? "win" : "lose"}">${isWinner ? "Victory!" : "Defeat"}</div>
    <div class="go-winner">${isWinner ? "Congratulations!" : esc(pName(winner)) + " wins the game"}</div>
    <div class="go-scores">
      <div class="go-score ${isWinner ? "is-winner" : ""}">
        <div class="go-score-name">${esc(pName(viewingPlayer))}</div>
        <div class="go-score-vp">${viewerVP}</div>
        <div class="go-score-label">/ ${targetVP} VP</div>
      </div>
      <div class="go-score ${!isWinner ? "is-winner" : ""}">
        <div class="go-score-name">${esc(pName(opponent))}</div>
        <div class="go-score-vp">${opponentVP}</div>
        <div class="go-score-label">/ ${targetVP} VP</div>
      </div>
    </div>
    <button class="go-btn" onclick="returnToLobby()">Return to Lobby</button>
  `;

  overlay.classList.add("visible");
}

function returnToLobby() {
  document.getElementById("gameOverOverlay")?.classList.remove("visible");
  confirmLeaveGame();
}
