// render/runes.js — Rune pool stacks, resource bar, sandbox resource controls,
// and floating resource deltas. Classic script: everything is global.
// Split out of renderer.js.

const DOMAIN_LABELS = { fury: "Fury", calm: "Calm", mind: "Mind", body: "Body", chaos: "Chaos", order: "Order" };
const DOMAIN_ORDER = ["fury", "calm", "mind", "body", "chaos", "order"];

// ============================================
// W10d: Sandbox-gated floating resource controls
// ============================================
// A localStorage flag unlocks hidden dev helpers that let the viewing player
// manually add/remove floating Energy and domain Power. Non-sandbox games
// never see these controls. Exposed on window so it can be toggled from the
// browser console — a proper UI toggle is a future workstream.

const SANDBOX_MODE_STORAGE_KEY = "rba-sandbox-mode";

/** @returns {boolean} true when the rba-sandbox-mode localStorage flag is set */
function isSandboxMode() {
  try {
    return localStorage.getItem(SANDBOX_MODE_STORAGE_KEY) === "true";
  } catch (_e) {
    return false;
  }
}

// Console helper: window.setSandboxMode(true) / window.setSandboxMode(false)
window.setSandboxMode = function (enabled) {
  try {
    if (enabled) {
      localStorage.setItem(SANDBOX_MODE_STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(SANDBOX_MODE_STORAGE_KEY);
    }
  } catch (_e) {
    /* ignore storage errors */
  }
  if (typeof render === "function") render();
  return isSandboxMode();
};

/**
 * Dispatch an add/spend resource move from the sandbox ± buttons.
 * Pre-clamps at 0 so we don't fire server requests that can only be rejected.
 * @param {"add"|"spend"} direction
 * @param {"energy"|"fury"|"calm"|"mind"|"body"|"chaos"|"order"} key
 */
function sandboxAdjustResource(direction, key) {
  if (!isSandboxMode()) return;
  const pool = gameState?.runePools?.[viewingPlayer];
  if (!pool) return;

  const current = key === "energy" ? (pool.energy ?? 0) : (pool.power?.[key] ?? 0);
  if (direction === "spend" && current <= 0) {
    // Pre-clamped — nothing to do. Button should already be :disabled.
    return;
  }

  const moveId = direction === "add" ? "addResources" : "spendResources";
  const params = { playerId: viewingPlayer };
  if (key === "energy") {
    params.energy = 1;
  } else {
    params.power = { [key]: 1 };
  }
  try {
    executeMove(moveId, params, viewingPlayer);
  } catch (err) {
    showToast(`Sandbox resource move failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function renderResourceBar() {
  const bar = document.getElementById("resourceBar");
  if (!bar || !gameState) return;

  const pool = gameState.runePools?.[viewingPlayer];
  if (!pool) {
    bar.innerHTML = '<span class="rb-label">No resources</span>';
    return;
  }

  const energy = pool.energy ?? 0;
  const powers = pool.power ?? {};
  const hasPower = Object.values(powers).some(v => v > 0);
  const sandbox = isSandboxMode();

  /** Render the +/- sandbox buttons for a resource key, or "" outside sandbox mode. */
  const sandboxBtns = (key, current) => {
    if (!sandbox) return "";
    const disabledMinus = current <= 0 ? "disabled" : "";
    return `<div class="floating-res__btns">
      <button type="button" class="floating-res__btn floating-res__btn--minus" ${disabledMinus}
        title="Remove 1 ${key}"
        onclick="sandboxAdjustResource('spend', '${key}')">−</button>
      <button type="button" class="floating-res__btn floating-res__btn--plus"
        title="Add 1 ${key}"
        onclick="sandboxAdjustResource('add', '${key}')">+</button>
    </div>`;
  };

  let html = '<span class="rb-label">Resources</span>';

  // Energy
  html += `<div class="rb-item">
    <div class="rb-icon pip-energy" style="width:auto;border-radius:4px;padding:0 6px;font-size:9px;">Energy</div>
    <div class="rb-value ${energy > 0 ? "has-value" : ""}">${energy}</div>
    ${sandboxBtns("energy", energy)}
  </div>`;

  // Domain powers — in sandbox mode show every domain so the player can raise
  // any pool from 0; otherwise only non-empty ones render.
  const domainsToRender = sandbox
    ? DOMAIN_ORDER
    : Object.keys(powers).filter(d => (powers[d] ?? 0) > 0);
  for (const domain of domainsToRender) {
    const amount = powers[domain] ?? 0;
    html += `<div class="rb-item">
      <div class="rb-icon pip-${domain}">${DOMAIN_LABELS[domain] ?? domain[0].toUpperCase()}</div>
      <div class="rb-value ${amount > 0 ? "has-value" : ""}">${amount}</div>
      ${sandboxBtns(domain, amount)}
    </div>`;
  }

  // Rune pool count (how many runes in pool)
  const runePoolCards = zoneForPlayer("runePool", viewingPlayer);
  const exhaustedCount = runePoolCards.filter(c => c.meta?.exhausted).length;
  const readyCount = runePoolCards.length - exhaustedCount;
  if (runePoolCards.length > 0) {
    html += `<div class="rb-item" style="border-color:#a09030;">
      <div class="rb-icon" style="background:#a09030;width:auto;border-radius:4px;padding:0 6px;font-size:9px;">Runes</div>
      <div class="rb-value" style="font-size:12px;">${readyCount}/${runePoolCards.length}</div>
    </div>`;
  }

  if (energy === 0 && readyCount > 0) {
    html += '<span style="font-size:10px;color:#a09030;font-style:italic;margin-left:4px;animation:hint-pulse 2s ease-in-out infinite;">Tap runes for energy</span>';
  }

  bar.innerHTML = html;
}

/** Take a snapshot of current resources before a move executes */
function snapshotResources() {
  const pool = gameState?.runePools?.[viewingPlayer];
  if (!pool) { prevResources = null; return; }
  prevResources = {
    energy: pool.energy ?? 0,
    power: { ...(pool.power || {}) },
  };
}

/** Compare current resources to snapshot and show floating deltas */
function detectAndShowResourceDeltas() {
  if (!prevResources) return;
  const pool = gameState?.runePools?.[viewingPlayer];
  if (!pool) { prevResources = null; return; }

  const newEnergy = pool.energy ?? 0;
  const energyDelta = newEnergy - prevResources.energy;
  if (energyDelta !== 0) {
    showResourceDelta("energy", energyDelta);
  }

  const newPower = pool.power || {};
  const DOMAIN_NAMES = { fury: "Fury", calm: "Calm", mind: "Mind", body: "Body", chaos: "Chaos", order: "Order" };
  for (const [domain, label] of Object.entries(DOMAIN_NAMES)) {
    const oldVal = prevResources.power[domain] ?? 0;
    const newVal = newPower[domain] ?? 0;
    const delta = newVal - oldVal;
    if (delta !== 0) {
      showResourceDelta(domain, delta, label);
    }
  }

  prevResources = null;
}

/** Show a floating "+1 Energy" or "+1 Fury" animation near the resource bar */
function showResourceDelta(type, amount, label) {
  const bar = document.getElementById("resourceBar");
  if (!bar) return;

  const displayLabel = label || (type === "energy" ? "Energy" : type.charAt(0).toUpperCase() + type.slice(1));
  const sign = amount > 0 ? "+" : "";

  const el = document.createElement("div");
  el.className = `resource-delta ${type}`;
  el.textContent = `${sign}${amount} ${displayLabel}`;

  // Position relative to the resource bar
  const barRect = bar.getBoundingClientRect();
  const boardEl = bar.closest(".board") || bar.parentElement;
  const boardRect = boardEl.getBoundingClientRect();

  // [rule:ui-resource-delta-anchor] .board sits inside the scaled #game-scale-wrapper,
  // so client-rect deltas are post-transform px; convert back to logical px.
  const scale = (boardEl.offsetWidth > 0 ? boardRect.width / boardEl.offsetWidth : 1) || 1;
  el.style.left = ((barRect.left - boardRect.left + barRect.width / 2) / scale) + "px";
  // [rule:ui-resource-delta-anchor] One action can yield two resources (recycle
  // a ready rune: +1 Energy from the auto-tap, +1 Fury from the recycle) whose
  // floats arrive a round-trip apart. Stack each new float above the ones still
  // animating instead of drawing them all at the same spot.
  const live = boardEl.querySelectorAll(".resource-delta").length;
  el.style.top = ((barRect.top - boardRect.top) / scale - 8 - live * 22) + "px";
  // Horizontal centering (-50%) lives in the resource-delta-float keyframe so the
  // animation's transform doesn't clobber it.

  boardEl.style.position = "relative";
  boardEl.appendChild(el);

  setTimeout(() => { if (el.parentNode) el.remove(); }, 1300);
}

// Rune pools — grouped by domain, stacked max 3 per pile
// (hoisted out of renderZones so board.js and runes.js can be edited independently)
const DOMAIN_COLORS = { fury: "#d04040", calm: "#40a0d0", mind: "#a050d0", body: "#50b050", chaos: "#d08030", order: "#d0d040" };
const STACK_MAX = 3;
// Render a single rune card with its actual face image (not a generic back).
// Uses `card.definitionId` so channeled runes show their real identity (Mind, Chaos, etc.).
function renderRuneCard(c, topOffset, zIndex, borderColor) {
  const classes = ["card", "rune-card"];
  if (c.cardType) classes.push("type-" + c.cardType);
  // [rule:ui-rune-exhausted-overlay] card--exhausted carries the dark overlay + lock icon (DESIGN.md: rotate 90° + dark overlay)
  if (c.meta?.exhausted) classes.push("exhausted", "card--exhausted");
  if (selectedCard === c.id) classes.push("selected");
  if (interaction.sourceCardId === c.id && interaction.mode !== "idle") classes.push("interaction-source");

  const defId = c.definitionId || "";
  const imgId = defId.replace(/^player-[12]-/, "");
  const cardName = c.name || "";
  const inlineStyle = `top:${topOffset}px;z-index:${zIndex};border-color:${borderColor};`;
  const imgSrc = imgId ? `/card-image/${esc(imgId)}` : "";
  const imgLoad = _cardImgLoadAttrs(imgId); // [rule:design-no-blank-cards]

  return `
    <div class="${classes.join(" ")}"
         data-card-id="${esc(c.id)}"
         data-def-id="${esc(defId)}"
         data-zone="runePool"
         style="${inlineStyle}"
         onpointerdown="onPointerDown(event, '${esc(c.id)}')"
         onmouseenter="showPreview(event, this)"
         onmouseleave="hidePreview()"
         ondblclick="openZoom('${esc(c.id)}')"
         title="${esc(cardName)} — click: exhaust (+1 energy) · right-click: recycle (taps first if ready)">
      <img class="card-img" src="${imgSrc}" alt="${esc(cardName)}" ${imgLoad.img}
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div class="card-fallback"${imgLoad.fallbackStyle}>
        <div class="fallback-name">${esc(cardName)}</div>
        <div class="fallback-type">rune</div>
      </div>
    </div>
  `;
}
/**
 * @param runes cards in one player's rune pool
 * @param opts.compact  smaller, non-interactive-size cards (the opponent's pool —
 *                      it only needs to be readable, and a full-size 250px stack
 *                      in the opponent row is what starved the player's own row)
 * @param opts.maxHeight logical px the stack may occupy (the pool grid's inner
 *                      height); the fan compresses so the whole pile — label,
 *                      every rune, and the top rune's full face — stays inside it
 */
function renderRuneStacks(runes, opts = {}) {
  // Group by domain — one consolidated stack per domain, regardless of count.
  // Every rune renders its own DOM card so it stays individually clickable.
  const groups = {};
  for (const c of runes) {
    const d = (Array.isArray(c.domain) ? c.domain[0] : c.domain) || "unknown";
    (groups[d] = groups[d] || []).push(c);
  }
  const compact = !!opts.compact;
  let html = "";
  for (const [domain, cards] of Object.entries(groups)) {
    const color = DOMAIN_COLORS[domain] || "#a09030";
    // Rule 133.5.a.1: every rune must be individually clickable to exhaust,
    // so render all cards (no STACK_MAX cap) — the count label still shows the total.
    // [rule:ui-rune-exhausted-overlay] Ready runes first (bottom of pile), exhausted last
    // (top, highest z-index) — a rotated exhausted rune lower in the pile is fully
    // covered by the ready cards stacked over it and reads as missing.
    const visibleCards = [...cards].sort((a, b) => (a.meta?.exhausted ? 1 : 0) - (b.meta?.exhausted ? 1 : 0));
    // [rule:ui-rune-pool-fixed-footprint] The pool sits in the player hand row of a
    // fixed 1080px board; a 12×26px fan (476px) starves the base row to ~0 and its
    // units paint over the resource bar (hiding power/rune readouts). Cap the
    // footprint to what the board can afford and compress the fan when a domain
    // holds more runes than fit — every rune stays rendered and individually
    // clickable (rule 133.5.a.1), and the pile never pokes out of (or gets cut
    // off by) its clipped grid.
    const RUNE_CARD_H = compact ? 98 : 154, FAN_STEP = compact ? 16 : 26, LABEL_H = 18, MIN_STEP = 6;
    const FAN_SPAN = 3 * FAN_STEP;
    const room = typeof opts.maxHeight === "number" && opts.maxHeight > 0 ? opts.maxHeight - LABEL_H - RUNE_CARD_H : FAN_SPAN;
    const span = Math.max(0, Math.min(FAN_SPAN, room));
    const step = visibleCards.length > 1 ? Math.max(Math.min(FAN_STEP, span / (visibleCards.length - 1)), Math.min(MIN_STEP, FAN_STEP)) : FAN_STEP;
    const stackHeight = RUNE_CARD_H + Math.min(FAN_SPAN, Math.max(span, visibleCards.length > 1 ? step * (visibleCards.length - 1) : 0));
    const label = DOMAIN_LABELS[domain] ?? domain[0].toUpperCase();
    const labelText = cards.length > 1 ? `${label} (${cards.length})` : label;
    // [rule:ui-rune-pool-never-overflows-upward] Only `height` is set inline: an
    // inline min-height beats the stylesheet's `max-height:100%`, so the stack
    // could not shrink with the hand row and spilled up over the Legend/Champion
    // zone. With height alone the clamp applies when the row is squeezed.
    html += `<div class="rune-stack${compact ? " rune-stack--compact" : ""}" data-rune-domain="${esc(domain)}" style="height:${Math.round(stackHeight + LABEL_H)}px;">`;
    html += `<div class="rune-stack-label" style="color:${color};">${labelText}</div>`;
    // [rule:ui-rune-ready-stays-clickable] Fan ORDER keeps ready first / exhausted
    // last (so an exhausted rune is never buried), but STACKING puts every ready
    // rune above every exhausted one: an exhausted rune is rotated 90° about its
    // centre (gameplay.css .card--exhausted), so it covers the body of the ready
    // card above it and swallowed the click that exhausts it (rule 133.5.a.1).
    // Rotated exhausted cards still show their ~22px wings and lower edge.
    visibleCards.forEach((c, i) => {
      const zIndex = (c.meta?.exhausted ? 1 : 100) + i;
      html += renderRuneCard(c, LABEL_H - 2 + Math.round(i * step), zIndex, color);
    });
    html += `</div>`;
  }
  return html;
}

/** Logical (pre-scale) inner height available to rune stacks inside a pool grid, or undefined before first layout. */
function runePoolRoom(gridEl) {
  if (!gridEl || !gridEl.clientHeight) return undefined;
  const cs = getComputedStyle(gridEl);
  const inner = gridEl.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  return inner > 60 ? inner : undefined;
}
