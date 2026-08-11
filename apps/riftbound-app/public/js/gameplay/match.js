// match.js — Match play (Bo1 duel / Bo3 match): match score chip, Concede GAME
// vs Concede MATCH (with a confirm naming which), the game-over interstitial
// ("Game 1: You won · Match 1–0 · Continue"), the post-match screen (Back to
// menu / Rematch), and the in-pregame "who goes first" step (d20 roll for game
// 1, previous game's loser chooses for games 2–3).
//
// Server contract (apps/riftbound-app/server/match.ts + match-state.ts):
//   frames may carry `match` = { format:"bo1"|"bo3", winsNeeded, gameNumber,
//     games:[{gameNumber,winner,reason,concededBy?}], current:{finished,winner?,reason?},
//     score:{player-1:n, player-2:n}, decided, winner?, concededBy?,
//     continueVotes:[seat], rematchVotes:[seat], usedBattlefields:{seat:[defId]} }
//   push types: game_over | match_over | match_update (each with `match`)
//   we send: concede_game | concede_match | match_continue | match_rematch
//            pregame_choose_first {choice:"self"|"opponent"} (initiative step)
// Classic script sharing globals with the other gameplay/*.js files; every
// call INTO this file from them is typeof-guarded.

let matchState = null;
/** Which game's roll/first-player reveal has been shown (so a reconnect / later sync does not replay it). */
let _initiativeShownKey = null;
let _initiativeAutoSent = null;

(function injectMatchCss() {
  if (typeof document === "undefined" || document.querySelector("style[data-match-css]")) return;
  const s = document.createElement("style");
  s.dataset.matchCss = "1";
  s.textContent = `
    .match-chip { display:inline-flex; align-items:center; gap:6px; font-size:11px; color:#c8c0e8; background:#2a2448; border:1px solid #3a3560; border-radius:10px; padding:1px 8px; margin-left:6px; white-space:nowrap; }
    .match-chip b { color:#f0c040; font-weight:700; }
    .concede-btns { display:flex; gap:4px; }
    .concede-btn { padding:3px 8px; border-radius:5px; font-size:11px; cursor:pointer; background:#2a1828; border:1px solid #5a3040; color:#c07888; white-space:nowrap; }
    .concede-btn:hover { background:#3a2030; border-color:#804050; color:#e08090; }
    .game-over-box .go-eyebrow { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:#8a82a6; margin-bottom:4px; }
    .game-over-box .go-match-score { margin:14px 0 4px; font-size:15px; color:#d8d4e8; }
    .game-over-box .go-match-score b { color:#f0c040; font-size:18px; }
    .game-over-box .go-match-result { font-size:20px; font-weight:700; margin:6px 0 2px; }
    .game-over-box .go-match-result.win { color:#50c878; } .game-over-box .go-match-result.lose { color:#d04040; }
    .game-over-box .go-btns { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:14px; }
    .game-over-box .go-btn.secondary { background:#2a2448; border-color:#3a3560; color:#c8c0e8; }
    .game-over-box .go-waiting { margin-top:10px; font-size:12px; color:#8a82a6; }
    .game-over-box .go-games { margin-top:8px; font-size:11px; color:#8a82a6; }
    .initiative-step .coin-choose { display:flex; gap:12px; justify-content:center; margin-top:16px; }
  `;
  document.head.appendChild(s);
})();

/** Every server frame passes through here first (websocket.js). */
function matchOnServerFrame(msg) {
  if (!msg) return;
  if (msg.match) matchState = msg.match;
  switch (msg.type) {
    case "sync":
      // A new game's pregame (or any pregame) replaces the game-over interstitial.
      if (msg.pregame && msg.pregame.phase) document.getElementById("gameOverOverlay")?.classList.remove("visible");
      else if (matchState && matchState.decided) setTimeout(renderMatchDecidedOutsideGame, 0);
      break;
    case "game_over":
    case "match_over":
    case "match_update":
      if (typeof gameState !== "undefined" && gameState && gameState.status === "finished" && typeof renderGameOver === "function") renderGameOver();
      else if (matchState && matchState.decided) renderMatchDecidedOutsideGame();
      else if (msg.type === "match_update") document.getElementById("gameOverOverlay")?.classList.remove("visible");
      if (msg.type === "match_over" && typeof addLogEntry === "function" && matchState?.winner) addLogEntry(`Match over — ${pName(matchState.winner)} wins ${matchScoreText()}`);
      break;
  }
}

function isBo3() { return Boolean(matchState && matchState.format === "bo3"); }

/** "1–0" from the viewer's side first. */
function matchScoreText(score) {
  const s = score || matchState?.score || {};
  const me = typeof viewingPlayer !== "undefined" ? viewingPlayer : "player-1";
  const opp = me === P1 ? P2 : P1;
  return `${s[me] ?? 0}–${s[opp] ?? 0}`;
}

/** Sidebar header chip: "Bo3 · Game 2 · 1–0" (nothing for a Bo1). */
function matchHeaderHtml() {
  if (!isBo3()) return "";
  const live = { ...(matchState.score || {}) };
  return `<span class="match-chip" id="matchChip" title="Best of 3 — first to ${matchState.winsNeeded} game wins">Bo3 · Game ${matchState.gameNumber} · <b>${esc(matchScoreText(live))}</b></span>`;
}

/** Concede button(s) for the sidebar header: Bo3 ⇒ Concede game + Concede match; Bo1 ⇒ Concede. */
function matchConcedeButtonsHtml() {
  if (typeof gameState === "undefined" || !gameState || gameState.status !== "playing") return "";
  if (isBo3() && !matchState.decided) {
    return `<span class="concede-btns"><button class="concede-btn" id="concedeGameBtn" onclick="concedeGame()" title="Your opponent wins this game; the match continues">Concede game</button><button class="concede-btn" id="concedeMatchBtn" onclick="concedeMatch()" title="Ends the whole match now">Concede match</button></span>`;
  }
  return `<span class="concede-btns"><button class="concede-btn" id="concedeGameBtn" onclick="concedeGame()" title="Your opponent wins">Concede</button></span>`;
}

function ensureConcedeConfirm() {
  let el = document.getElementById("confirmConcede");
  if (el) return el;
  el = document.createElement("div");
  el.className = "confirm-overlay";
  el.id = "confirmConcede";
  el.innerHTML = `<div class="confirm-box"><div class="confirm-title" id="confirmConcedeTitle"></div><div class="confirm-msg" id="confirmConcedeMsg"></div><div class="confirm-btns"><button class="confirm-yes" id="confirmConcedeYes">Concede</button><button class="confirm-no" id="confirmConcedeNo">Keep playing</button></div></div>`;
  document.body.appendChild(el);
  el.querySelector("#confirmConcedeNo").addEventListener("click", () => el.classList.remove("visible"));
  return el;
}

function showConcedeConfirm(scope) {
  const el = ensureConcedeConfirm();
  const bo3 = isBo3();
  const n = matchState?.gameNumber ?? 1;
  const title = scope === "match" ? "Concede the match?" : bo3 ? `Concede game ${n}?` : "Concede?";
  const msg = scope === "match"
    ? (bo3 ? `This ends the whole best-of-3 now (current score ${matchScoreText()}). Your opponent wins the match.` : "Your opponent wins.")
    : bo3 ? `Your opponent wins game ${n} and the match score updates${wouldDecide() ? " — this decides the match" : "; you go on to the next game"}.` : "Your opponent wins the game.";
  el.querySelector("#confirmConcedeTitle").textContent = title;
  el.querySelector("#confirmConcedeMsg").textContent = msg;
  const yes = el.querySelector("#confirmConcedeYes");
  yes.textContent = scope === "match" ? "Concede match" : bo3 ? "Concede game" : "Concede";
  yes.onclick = () => {
    el.classList.remove("visible");
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: scope === "match" ? "concede_match" : "concede_game" }));
  };
  el.classList.add("visible");
}

/** Would losing the current game decide the match against the viewer? */
function wouldDecide() {
  if (!isBo3()) return true;
  const opp = viewingPlayer === P1 ? P2 : P1;
  return ((matchState.score?.[opp] ?? 0) + 1) >= (matchState.winsNeeded ?? 2);
}

function concedeGame() { showConcedeConfirm("game"); }
function concedeMatch() { showConcedeConfirm("match"); }

function matchContinue() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "match_continue" }));
  const w = document.getElementById("goWaiting");
  if (w) w.textContent = isSandboxGame ? "Setting up the next game…" : "Waiting for your opponent to continue…";
  const b = document.getElementById("goContinueBtn");
  if (b) b.disabled = true;
}
function matchRematch() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "match_rematch" }));
  const w = document.getElementById("goWaiting");
  if (w) w.textContent = isSandboxGame ? "Setting up the rematch…" : "Waiting for your opponent to accept the rematch…";
  const b = document.getElementById("goRematchBtn");
  if (b) b.disabled = true;
}
function matchBackToMenu() {
  document.getElementById("gameOverOverlay")?.classList.remove("visible");
  if (typeof confirmLeaveGame === "function") confirmLeaveGame();
}

/**
 * Game-over box with match context. Called by game-flow.js renderGameOver
 * once the engine says the game is finished; returns true when it rendered.
 * `info` = { winner, isWinner, viewerVP, opponentVP, targetVP } computed there.
 */
function renderMatchGameOver(box, info) {
  if (!box) return false;
  const m = matchState || { format: "bo1", decided: true, winner: info.winner, score: {}, gameNumber: 1, games: [], continueVotes: [], rematchVotes: [] };
  const bo3 = m.format === "bo3";
  const opp = viewingPlayer === P1 ? P2 : P1;
  const cur = m.current && m.current.finished ? m.current : { winner: info.winner };
  const gameWinner = cur.winner || info.winner;
  const iWonGame = gameWinner === viewingPlayer;
  const how = cur.reason === "concede" ? " by concession" : "";
  const decided = bo3 ? Boolean(m.decided) : true;
  const matchWinner = m.winner || (decided ? gameWinner : null);
  const iWonMatch = matchWinner === viewingPlayer;
  const votedContinue = (m.continueVotes || []).includes(viewingPlayer);
  const votedRematch = (m.rematchVotes || []).includes(viewingPlayer);

  let html = "";
  if (bo3) html += `<div class="go-eyebrow" id="goEyebrow">Game ${m.gameNumber} · Best of 3</div>`;
  html += `<div class="go-result ${iWonGame ? "win" : "lose"}" id="goResult">${iWonGame ? "Victory!" : "Defeat"}</div>`;
  html += `<div class="go-winner">${iWonGame ? (bo3 ? `You win game ${m.gameNumber}${how}` : "Congratulations!") : `${esc(pName(gameWinner))} wins ${bo3 ? `game ${m.gameNumber}` : "the game"}${how}`}</div>`;
  html += `
    <div class="go-scores">
      <div class="go-score ${iWonGame ? "is-winner" : ""}"><div class="go-score-name">${esc(pName(viewingPlayer))}</div><div class="go-score-vp">${info.viewerVP}</div><div class="go-score-label">/ ${info.targetVP} VP</div></div>
      <div class="go-score ${!iWonGame ? "is-winner" : ""}"><div class="go-score-name">${esc(pName(opp))}</div><div class="go-score-vp">${info.opponentVP}</div><div class="go-score-label">/ ${info.targetVP} VP</div></div>
    </div>`;
  if (bo3) {
    html += `<div class="go-match-score" id="goMatchScore">Match: ${esc(pName(viewingPlayer))} <b>${esc(matchScoreText(m.score))}</b> ${esc(pName(opp))}</div>`;
    if (decided) {
      const conceded = m.concededBy ? ` — ${esc(pName(m.concededBy))} conceded the match` : "";
      html += `<div class="go-match-result ${iWonMatch ? "win" : "lose"}" id="goMatchResult">${iWonMatch ? "You win the match!" : `${esc(pName(matchWinner))} wins the match`}${conceded}</div>`;
    }
  }
  html += `<div class="go-btns">`;
  if (bo3 && !decided) {
    html += `<button class="go-btn" id="goContinueBtn" onclick="matchContinue()" ${votedContinue ? "disabled" : ""}>Continue to game ${m.gameNumber + 1}</button>`;
    html += `<button class="go-btn secondary" id="goLeaveBtn" onclick="showLeaveConfirm()">Leave match</button>`;
  } else {
    html += `<button class="go-btn" id="goMenuBtn" onclick="matchBackToMenu()">Back to menu</button>`;
    html += `<button class="go-btn secondary" id="goRematchBtn" onclick="matchRematch()" ${votedRematch ? "disabled" : ""}>Rematch</button>`;
  }
  html += `</div>`;
  const waiting = bo3 && !decided && votedContinue ? (isSandboxGame ? "Setting up the next game…" : "Waiting for your opponent to continue…")
    : decided && votedRematch ? "Waiting for your opponent to accept the rematch…" : "";
  html += `<div class="go-waiting" id="goWaiting">${waiting}</div>`;
  if (bo3 && (m.games || []).length) {
    html += `<div class="go-games">${m.games.map((g) => `Game ${g.gameNumber}: ${g.winner ? esc(pName(g.winner)) : "no winner"}${g.reason === "concede" ? " (concession)" : ""}`).join(" · ")}</div>`;
  }
  box.innerHTML = html;
  box.dataset.format = m.format;
  box.dataset.decided = decided ? "1" : "0";
  return true;
}

/** The match ended while no game was running (conceded between games): show the post-match box over the pregame. */
function renderMatchDecidedOutsideGame() {
  if (!matchState || !matchState.decided) return;
  if (typeof gameState !== "undefined" && gameState && gameState.status === "finished") { if (typeof renderGameOver === "function") renderGameOver(); return; }
  const overlay = document.getElementById("gameOverOverlay");
  const box = document.getElementById("gameOverBox");
  if (!overlay || !box) return;
  document.getElementById("pregameOverlay")?.classList.remove("visible");
  document.getElementById("coinOverlay")?.classList.remove("visible");
  if (typeof pregameState !== "undefined") pregameState = null;
  const m = matchState;
  const opp = viewingPlayer === P1 ? P2 : P1;
  const iWon = m.winner === viewingPlayer;
  const votedRematch = (m.rematchVotes || []).includes(viewingPlayer);
  box.innerHTML = `
    ${m.format === "bo3" ? `<div class="go-eyebrow">Best of 3</div>` : ""}
    <div class="go-result ${iWon ? "win" : "lose"}" id="goResult">${iWon ? "Match won" : "Match over"}</div>
    <div class="go-winner">${m.concededBy ? `${esc(pName(m.concededBy))} conceded the match` : `${esc(pName(m.winner))} wins the match`}</div>
    ${m.format === "bo3" ? `<div class="go-match-score" id="goMatchScore">Match: ${esc(pName(viewingPlayer))} <b>${esc(matchScoreText(m.score))}</b> ${esc(pName(opp))}</div>` : ""}
    <div class="go-btns">
      <button class="go-btn" id="goMenuBtn" onclick="matchBackToMenu()">Back to menu</button>
      <button class="go-btn secondary" id="goRematchBtn" onclick="matchRematch()" ${votedRematch ? "disabled" : ""}>Rematch</button>
    </div>
    <div class="go-waiting" id="goWaiting">${votedRematch ? "Waiting for your opponent to accept the rematch…" : ""}</div>`;
  box.dataset.format = m.format;
  box.dataset.decided = "1";
  overlay.classList.add("visible");
}

// ============================================================================
// Pregame "who goes first" step (server phase "initiative")
// ============================================================================

/**
 * Called by pregame.js handlePregameSync BEFORE it renders the current phase.
 * Returns true when this file took over the screen (the roll overlay / the
 * loser-chooses prompt is up); pregame.js then renders nothing else until the
 * next sync or until `onDone` re-enters it.
 */
function matchHandlePregame(pregame, state, onDone) {
  const ini = pregame && pregame.initiative;
  if (!ini) return false;
  const key = `${matchState?.gameNumber ?? pregame.gameNumber ?? 1}:${ini.kind}:${ini.p1Roll ?? ""}:${ini.p2Roll ?? ""}`;
  const skip = typeof pregameAnimationsSkipped === "function" && isSandboxGame && pregameAnimationsSkipped();

  if (pregame.phase === "initiative" && !ini.decided) {
    const iChoose = ini.chooser === viewingPlayer;
    if (iChoose && skip) {
      // "Skip animations in practice games": elect to go first without a prompt.
      if (_initiativeAutoSent !== key) { _initiativeAutoSent = key; sendChooseFirst("self"); }
      return true;
    }
    if (ini.kind === "roll") {
      _initiativeShownKey = key;
      showCoinFlip({ p1Roll: ini.p1Roll, p2Roll: ini.p2Roll, winner: ini.chooser, firstPlayer: null }, null);
      return true;
    }
    renderLoserChooses(pregame, ini);
    return true;
  }

  // Decided (this sync or earlier). Roll variant: make sure the dice + who-goes-first were shown once.
  if (ini.kind === "roll" && ini.decided && !skip) {
    const overlay = document.getElementById("coinOverlay");
    const showing = overlay && overlay.classList.contains("visible");
    if (showing) {
      // We were on the roll screen (chose, or waited for the other seat): say who goes first, linger, proceed.
      const coinChoose = document.getElementById("coinChoose");
      if (coinChoose) coinChoose.style.display = "none";
      const coinDetail = document.getElementById("coinDetail");
      if (coinDetail) {
        const firstIsMe = pregame.firstPlayer === viewingPlayer;
        const botDecided = ini.chooser !== viewingPlayer && isSandboxGame;
        coinDetail.textContent = firstIsMe ? (ini.chooser === viewingPlayer ? "You go first!" : `${pName(ini.chooser)} chose: you go first`)
          : botDecided ? `${pName(ini.chooser)} won the roll and chose to go first` : `${pName(pregame.firstPlayer)} goes first`;
        coinDetail.style.opacity = "1";
      }
      overlay.dataset.stage = "decided";
      _initiativeShownKey = key;
      let done = false;
      const finish = () => { if (done) return; done = true; overlay.onclick = null; overlay.classList.remove("visible"); _coinFlipShown = false; onDone(); };
      overlay.onclick = (e) => { if (!(e.target.closest && e.target.closest("button"))) finish(); };
      setTimeout(finish, 1500);
      return true;
    }
    if (_initiativeShownKey !== key) {
      // Never saw the roll (the bot won and decided at once, or we connected late): play it, then proceed.
      _initiativeShownKey = key;
      showCoinFlip({ p1Roll: ini.p1Roll, p2Roll: ini.p2Roll, winner: ini.chooser, firstPlayer: pregame.firstPlayer }, () => {
        document.getElementById("coinOverlay")?.classList.remove("visible");
        _coinFlipShown = false;
        onDone();
      });
      return true;
    }
  }
  return false;
}

function renderLoserChooses(pregame, ini) {
  const overlay = document.getElementById("pregameOverlay");
  const content = document.getElementById("pregameContent");
  if (!overlay || !content) return;
  overlay.classList.add("visible");
  content.classList.remove("sideboard-step", "bf-step");
  const iChoose = ini.chooser === viewingPlayer;
  const n = matchState?.gameNumber ?? pregame.gameNumber ?? 2;
  const why = ini.afterGame ? `${iChoose ? "You" : esc(pName(ini.chooser))} lost game ${ini.afterGame}, so ${iChoose ? "you choose" : "they choose"} who takes the first turn.` : "";
  content.innerHTML = `
    <div class="initiative-step" id="initiativeStep" data-chooser="${esc(ini.chooser || "")}">
      <div class="pregame-title">Game ${n} — who goes first?</div>
      <div class="pregame-subtitle">${why}</div>
      ${matchState ? `<div class="pregame-info">Match score: ${esc(pName(viewingPlayer))} <b>${esc(matchScoreText())}</b> ${esc(pName(viewingPlayer === P1 ? P2 : P1))}</div>` : ""}
      ${iChoose
        ? `<div class="coin-choose" id="initiativeChoose"><button class="coin-choose-btn" id="initiativeSelfBtn" onclick="sendChooseFirst('self')">I'll go first</button><button class="coin-choose-btn" id="initiativeOppBtn" onclick="sendChooseFirst('opponent')" style="border-color:#8a82a6;color:#8a82a6;background:rgba(100,90,140,0.15);">Opponent goes first</button></div>`
        : `<div class="pregame-waiting" id="initiativeWaiting">Waiting for ${esc(pName(ini.chooser))} to choose who goes first...</div>`}
    </div>`;
}

/** The chooser's answer for the in-pregame step (game socket, not the lobby socket). */
function sendChooseFirst(choice) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify({ type: "pregame_choose_first", choice }));
  const box = document.getElementById("initiativeChoose");
  if (box) box.innerHTML = `<div class="pregame-waiting">${choice === "self" ? "You go first!" : "Opponent goes first"}</div>`;
  return true;
}
