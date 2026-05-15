/**
 * InteractiveGameBoard — a CLICKABLE, server-rendered HTML view of a live
 * `EngineSession`.
 *
 * Stream 2 of batch-15 (parallel sub-agent AA): U built the static
 * render-view.ts. This module builds on top of it by adding event hooks
 * — chips that POST back to `/api/demo/move`, an "End Turn" button, a
 * "Step bot" button, and a side-by-side move log.
 *
 * Why a string-template component instead of React?
 *   - The app already serves static HTML from `public/` and has no JSX
 *     toolchain.
 *   - We want a real, end-to-end *interactive* proof: click a button,
 *     hit the server, see the state advance. A 1-page HTML+inline-JS
 *     surface is enough to validate the full wire.
 *   - When the app eventually adds a real SPA (Vue/Svelte/React), the
 *     same `GameView` JSON these endpoints emit drives that too.
 *
 * Contract: the page renders an HTML shell with a `<div id="board">`
 * that the inline JS rehydrates on every move via JSON fetched from
 * `/api/demo/state/:id`. All state mutations happen server-side; this
 * file is pure HTML/JS surface.
 */

import type { GameView, LegalMove, SessionStep } from "../lib/engine-session";

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Render the per-player section with clickable hand-card chips. */
export function renderPlayersInteractive(
  view: GameView,
  hand: Record<string, readonly { id: string; definitionId: string }[]>,
  legalByMove: Record<string, LegalMove[]>,
): string {
  return view.players
    .map((p) => {
      const active = p.id === view.turn.activePlayer ? " player-active" : "";
      const cards = hand[p.id] ?? [];
      const handChips = cards
        .map((c) => {
          // Is there a legal `playCard`/`playUnit`/`playSpell` for this card?
          const legal = (legalByMove.playUnit ?? [])
            .concat(legalByMove.playSpell ?? [])
            .concat(legalByMove.playGear ?? [])
            .concat(legalByMove.playCard ?? [])
            .some((m) => m.playerId === p.id && m.params.cardId === c.id);
          const cls = `hand-card${legal ? " hand-card-legal" : " hand-card-illegal"}`;
          const dataLegal = legal ? "true" : "false";
          return `<button class="${cls}" data-card="${esc(c.id)}" data-owner="${esc(p.id)}" data-legal="${dataLegal}" type="button">${esc(c.definitionId)}</button>`;
        })
        .join("");

      return `
<div class="player${active}" data-player-id="${esc(p.id)}">
  <h3>${esc(p.id)} ${p.id === view.turn.activePlayer ? "<small>(active)</small>" : ""}</h3>
  <ul class="player-stats">
    <li><strong>VP:</strong> ${esc(p.victoryPoints)} / ${esc(view.victoryScore)}</li>
    <li><strong>Energy:</strong> ${esc(p.energy)}</li>
    <li><strong>Hand:</strong> ${esc(p.handSize)}</li>
    <li><strong>Deck:</strong> ${esc(p.deckSize)}</li>
    <li><strong>Trash:</strong> ${esc(p.trashSize)}</li>
  </ul>
  <div class="hand-area">
    <strong>Hand:</strong>
    <div class="hand-chips">${handChips || "<em class='hand-empty'>(empty)</em>"}</div>
  </div>
</div>`;
    })
    .join("");
}

/** Render an interactive phase strip + End Turn button. */
export function renderControls(view: GameView, canEndTurn: boolean): string {
  const phaseStrip = view.phaseStrip
    .map(
      (p) =>
        `<span class="phase ${p.id === view.turn.phase ? "phase-active" : ""}" data-phase="${esc(p.id)}">${esc(p.label)}</span>`,
    )
    .join("");

  const endBtnDisabled = canEndTurn ? "" : " disabled";
  return `
<header class="turn-header">
  <h2>Turn ${esc(view.turn.number)} — ${esc(view.turn.phaseLabel)}</h2>
  <div class="phase-strip">${phaseStrip}</div>
  <p>Active: <strong>${esc(view.turn.activePlayer)}</strong> · Status: <code>${esc(view.status)}</code></p>
  <div class="controls">
    <button id="btn-end-turn" type="button"${endBtnDisabled}>End Turn (${esc(view.turn.activePlayer)})</button>
    <button id="btn-step-bot" type="button">Step bot move</button>
    <button id="btn-refresh" type="button">Refresh</button>
  </div>
</header>`;
}

/** Render the move log column. */
export function renderTrailColumn(trail: readonly SessionStep[]): string {
  const items = [...trail]
    .toReversed()
    .map((s) => {
      const status = s.success ? "ok" : "fail";
      const err = s.error ? ` <em class="err">${esc(s.error)}</em>` : "";
      return `<li class="step step-${status}"><span class="seq">#${s.seq}</span> <strong>${esc(s.playerId)}</strong> ${esc(s.moveId)}${err}</li>`;
    })
    .join("");
  return `<ol class="trail">${items || "<li class='step-empty'>(no moves yet)</li>"}</ol>`;
}

/** Full interactive board (server-rendered snippet). */
export interface InteractiveBoardArgs {
  view: GameView;
  hand: Record<string, readonly { id: string; definitionId: string }[]>;
  legalByMove: Record<string, LegalMove[]>;
  trail: readonly SessionStep[];
  canEndTurn: boolean;
}

export function renderInteractiveBoard(args: InteractiveBoardArgs): string {
  const { view, hand, legalByMove, trail, canEndTurn } = args;
  const winner = view.winner
    ? `<div class="winner">Winner: <strong>${esc(view.winner)}</strong></div>`
    : "";
  const battlefields = view.battlefields
    .map((bf) => {
      const ctrl = bf.controller ?? "uncontrolled";
      const contested = bf.contested ? " <em>(contested)</em>" : "";
      const units = bf.units.length
        ? `<ul class="bf-units">${bf.units
            .map(
              (u) =>
                `<li>${esc(u.definitionId)} <small>[${esc(u.controller)}]</small></li>`,
            )
            .join("")}</ul>`
        : `<p class="bf-empty">no units</p>`;
      return `<div class="bf"><h4>${esc(bf.id)} <small>— ${esc(ctrl)}${contested}</small></h4>${units}</div>`;
    })
    .join("");

  return `
<section class="game-board" data-game-id="${esc(view.gameId)}">
  ${winner}
  ${renderControls(view, canEndTurn)}
  <div class="players">${renderPlayersInteractive(view, hand, legalByMove)}</div>
  <div class="battlefields"><h3>Battlefields</h3>${battlefields || "<p>(none placed)</p>"}</div>
  <aside class="log-aside">
    <h3>Move log (most-recent first)</h3>
    ${renderTrailColumn(trail)}
  </aside>
</section>`;
}

/** A complete HTML page with inline JS to wire the board interactivity. */
export function renderInteractivePage(args: InteractiveBoardArgs & { sessionId: string }): string {
  const { sessionId } = args;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Riftbound — interactive engine demo (${esc(sessionId)})</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 1rem; color: #222; background: #fafafa; }
  h1 { margin-top: 0; }
  .game-board { display: grid; grid-template-columns: 1fr 320px; gap: 1rem; background: white; padding: 1rem; border: 1px solid #ddd; border-radius: 6px; }
  .game-board > .turn-header { grid-column: 1 / -1; }
  .game-board > .players { grid-column: 1; }
  .game-board > .battlefields { grid-column: 1; }
  .game-board > .log-aside { grid-column: 2; grid-row: 2 / span 2; min-width: 280px; }
  .turn-header h2 { margin: 0 0 .25rem 0; }
  .phase-strip { display: flex; gap: .5rem; margin: .25rem 0; flex-wrap: wrap; }
  .phase { padding: .15rem .4rem; border-radius: 3px; background: #eee; font-size: 12px; }
  .phase-active { background: #ffd; font-weight: 600; }
  .controls { margin: .5rem 0; display: flex; gap: .5rem; }
  .controls button { padding: .4rem .8rem; border-radius: 3px; border: 1px solid #ccc; cursor: pointer; background: #fff; }
  .controls button:hover { background: #eef; }
  .controls button:disabled { color: #888; cursor: not-allowed; background: #f4f4f4; }
  .players { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }
  .player { padding: .75rem; border: 1px solid #ccc; border-radius: 4px; background: #fff; }
  .player-active { border-color: #4a90e2; box-shadow: 0 0 0 2px #4a90e220; }
  .player-stats { list-style: none; padding: 0; margin: 0; }
  .player-stats li { display: inline-block; margin-right: 1rem; }
  .hand-area { margin-top: .5rem; }
  .hand-chips { display: flex; gap: .25rem; flex-wrap: wrap; margin-top: .25rem; }
  .hand-card { font: 11px ui-monospace, monospace; padding: .2rem .4rem; border-radius: 3px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
  .hand-card-legal { border-color: #4a90e2; background: #e7f0fb; }
  .hand-card-legal:hover { background: #c4ddf7; }
  .hand-card-illegal { color: #888; cursor: not-allowed; opacity: .7; }
  .hand-empty { color: #888; }
  .bf { border: 1px solid #ddd; padding: .5rem; margin: .25rem 0; border-radius: 3px; }
  .bf-units { margin: .25rem 0; padding-left: 1.2rem; }
  .bf-empty { color: #888; font-style: italic; margin: 0; }
  .winner { background: #cfc; padding: .5rem; border-radius: 4px; grid-column: 1 / -1; font-size: 1.1rem; }
  .log-aside { background: #fafafa; padding: .5rem; border-left: 1px solid #ddd; }
  .trail { font-family: ui-monospace, monospace; font-size: 11px; max-height: 32rem; overflow: auto; background: #fff; padding: .5rem 1.5rem; border: 1px solid #ddd; border-radius: 4px; list-style-position: outside; }
  .step-fail { color: #b00; }
  .step-empty { color: #888; font-style: italic; }
  .seq { color: #888; }
  .err { color: #b00; }
  code { background: #f4f4f4; padding: 0 .2rem; border-radius: 2px; }
  #notice { font-size: 12px; color: #555; margin: .25rem 0; }
</style>
</head>
<body>
<h1>Riftbound — interactive engine demo</h1>
<p id="notice">Session <code>${esc(sessionId)}</code>. Click any blue hand-chip to play that card. Click <strong>End Turn</strong> to advance the active player.</p>
<div id="board">${renderInteractiveBoard(args)}</div>
<script>
(function() {
  const SESSION_ID = ${JSON.stringify(sessionId)};
  const $board = document.getElementById("board");

  async function refresh() {
    const r = await fetch("/api/demo/state/" + encodeURIComponent(SESSION_ID));
    if (!r.ok) {
      $board.innerHTML = "<p class='err'>Failed to load state: " + r.status + "</p>";
      return;
    }
    const body = await r.text();
    $board.innerHTML = body;
    bind();
  }

  async function sendMove(playerId, moveId, params) {
    const r = await fetch("/api/demo/move/" + encodeURIComponent(SESSION_ID), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: playerId, moveId: moveId, params: params || {} })
    });
    const body = await r.text();
    $board.innerHTML = body;
    bind();
  }

  function bind() {
    const endBtn = document.getElementById("btn-end-turn");
    if (endBtn) {
      endBtn.addEventListener("click", function() {
        const active = endBtn.textContent.match(/\\((.*)\\)/);
        const playerId = active ? active[1] : "player-1";
        sendMove(playerId, "endTurn", { playerId: playerId });
      });
    }
    const stepBtn = document.getElementById("btn-step-bot");
    if (stepBtn) {
      stepBtn.addEventListener("click", function() {
        fetch("/api/demo/step/" + encodeURIComponent(SESSION_ID), { method: "POST" })
          .then(function(r) { return r.text(); })
          .then(function(html) { $board.innerHTML = html; bind(); });
      });
    }
    const refreshBtn = document.getElementById("btn-refresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", refresh);
    }
    document.querySelectorAll(".hand-card-legal").forEach(function(el) {
      el.addEventListener("click", function() {
        const cardId = el.getAttribute("data-card");
        const owner = el.getAttribute("data-owner");
        // Try playUnit first (most common). Server will fall back to legal-enum.
        sendMove(owner, "playFromHand", { playerId: owner, cardId: cardId });
      });
    });
  }
  bind();
})();
</script>
</body>
</html>`;
}
