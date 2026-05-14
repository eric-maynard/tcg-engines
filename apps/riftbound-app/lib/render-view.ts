/**
 * Tiny rendering proof — turns a `GameView` into a self-contained HTML
 * snippet (no React, no client framework, just strings).
 *
 * This is *intentionally* ugly and minimal. Its job is to prove the binding:
 * engine → simplified view → HTML the browser can show. A real UI replaces
 * this with React/Vue/Svelte components consuming the same `GameView`.
 */

import type { GameView, SessionStep } from "./engine-session";

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Renders one game view as a `<section>` block. */
export function renderViewHtml(view: GameView): string {
  const phaseStrip = view.phaseStrip
    .map(
      (p) =>
        `<span class="phase ${p.id === view.turn.phase ? "phase-active" : ""}">${esc(p.label)}</span>`,
    )
    .join("");

  const playersHtml = view.players
    .map((p) => {
      const active = p.id === view.turn.activePlayer ? " player-active" : "";
      const powerRows = Object.entries(p.power)
        .map(([k, v]) => `<li>${esc(k)}: ${esc(v)}</li>`)
        .join("");
      return `
<div class="player${active}">
  <h3>${esc(p.id)} ${p.id === view.turn.activePlayer ? "<small>(active)</small>" : ""}</h3>
  <ul class="player-stats">
    <li><strong>VP:</strong> ${esc(p.victoryPoints)} / ${esc(view.victoryScore)}</li>
    <li><strong>XP:</strong> ${esc(p.xp)}</li>
    <li><strong>Hand:</strong> ${esc(p.handSize)}</li>
    <li><strong>Deck:</strong> ${esc(p.deckSize)}</li>
    <li><strong>Rune deck:</strong> ${esc(p.runeDeckSize)}</li>
    <li><strong>Trash:</strong> ${esc(p.trashSize)}</li>
    <li><strong>Energy:</strong> ${esc(p.energy)}</li>
  </ul>
  ${powerRows ? `<ul class="player-power"><li class="power-label">Power:</li>${powerRows}</ul>` : ""}
</div>`;
    })
    .join("");

  const battlefieldsHtml = view.battlefields
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
      return `
<div class="bf">
  <h4>${esc(bf.id)} <small>— controlled by ${esc(ctrl)}${contested}</small></h4>
  ${units}
</div>`;
    })
    .join("");

  const winnerBanner = view.winner
    ? `<div class="winner">Winner: <strong>${esc(view.winner)}</strong></div>`
    : "";

  return `
<section class="game-view" data-game-id="${esc(view.gameId)}">
  ${winnerBanner}
  <header class="turn-header">
    <h2>Turn ${esc(view.turn.number)} — ${esc(view.turn.phaseLabel)}</h2>
    <div class="phase-strip">${phaseStrip}</div>
    <p>Active: <strong>${esc(view.turn.activePlayer)}</strong> · Status: <code>${esc(view.status)}</code></p>
  </header>
  <div class="players">${playersHtml}</div>
  <div class="battlefields"><h3>Battlefields</h3>${battlefieldsHtml || "<p>(none placed)</p>"}</div>
</section>`;
}

/** Render a list of session steps as a scrollable log. */
export function renderTrailHtml(trail: readonly SessionStep[]): string {
  const items = trail
    .map((s) => {
      const status = s.success ? "ok" : "fail";
      const params = esc(JSON.stringify(s.params));
      const err = s.error ? ` <em class="err">${esc(s.error)}</em>` : "";
      return `<li class="step step-${status}"><span class="seq">#${s.seq}</span> <strong>${esc(s.playerId)}</strong> ${esc(s.moveId)} <code>${params}</code>${err}</li>`;
    })
    .join("");
  return `<ol class="trail">${items}</ol>`;
}

/**
 * Wrap a view + trail in a complete HTML document. Useful for the
 * "play sample game" CLI / debug page.
 */
export function renderPageHtml(opts: {
  title?: string;
  view: GameView;
  trail?: readonly SessionStep[];
}): string {
  const { title = "Riftbound — engine binding demo", view, trail } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 1rem; color: #222; background: #fafafa; }
  h1 { margin-top: 0; }
  .game-view { background: white; padding: 1rem; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 1rem; }
  .turn-header h2 { margin: 0 0 .25rem 0; }
  .phase-strip { display: flex; gap: .5rem; margin: .25rem 0; flex-wrap: wrap; }
  .phase { padding: .15rem .4rem; border-radius: 3px; background: #eee; font-size: 12px; }
  .phase-active { background: #ffd; font-weight: 600; }
  .players { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }
  .player { padding: .75rem; border: 1px solid #ccc; border-radius: 4px; background: #fff; }
  .player-active { border-color: #4a90e2; box-shadow: 0 0 0 2px #4a90e220; }
  .player-stats, .player-power { list-style: none; padding: 0; margin: 0; }
  .player-stats li { display: inline-block; margin-right: 1rem; }
  .battlefields { margin-top: 1rem; }
  .bf { border: 1px solid #ddd; padding: .5rem; margin: .25rem 0; border-radius: 3px; }
  .bf-units { margin: .25rem 0; padding-left: 1.2rem; }
  .bf-empty { color: #888; font-style: italic; margin: 0; }
  .winner { background: #cfc; padding: .5rem; border-radius: 4px; margin-bottom: 1rem; font-size: 1.1rem; }
  .trail { font-family: ui-monospace, monospace; font-size: 12px; max-height: 24rem; overflow: auto; background: #fff; padding: .5rem 1.5rem; border: 1px solid #ddd; border-radius: 4px; }
  .step-fail { color: #b00; }
  .seq { color: #888; }
  .err { color: #b00; }
  code { background: #f4f4f4; padding: 0 .2rem; border-radius: 2px; }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
${renderViewHtml(view)}
${trail ? `<h2>Move trail (${trail.length})</h2>${renderTrailHtml(trail)}` : ""}
</body>
</html>`;
}
