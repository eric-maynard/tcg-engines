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

  el.style.left = (barRect.left - boardRect.left + barRect.width / 2) + "px";
  el.style.top = (barRect.top - boardRect.top - 8) + "px";
  el.style.transform = "translateX(-50%)";

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
  const classes = ["card"];
  if (c.cardType) classes.push("type-" + c.cardType);
  if (c.meta?.exhausted) classes.push("exhausted");
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
function renderRuneStacks(runes) {
  // Group by domain — one consolidated stack per domain, regardless of count.
  // Every rune renders its own DOM card so it stays individually clickable.
  const groups = {};
  for (const c of runes) {
    const d = (Array.isArray(c.domain) ? c.domain[0] : c.domain) || "unknown";
    (groups[d] = groups[d] || []).push(c);
  }
  let html = "";
  for (const [domain, cards] of Object.entries(groups)) {
    const color = DOMAIN_COLORS[domain] || "#a09030";
    // Rule 133.5.a.1: every rune must be individually clickable to exhaust,
    // so render all cards (no STACK_MAX cap) — the count label still shows the total.
    const visibleCards = cards;
    const stackHeight = 154 + (visibleCards.length - 1) * 26;
    const label = DOMAIN_LABELS[domain] ?? domain[0].toUpperCase();
    const labelText = cards.length > 1 ? `${label} (${cards.length})` : label;
    html += `<div class="rune-stack" style="min-height:${stackHeight + 18}px;height:${stackHeight + 18}px;">`;
    html += `<div class="rune-stack-label" style="color:${color};">${labelText}</div>`;
    visibleCards.forEach((c, i) => {
      html += renderRuneCard(c, 16 + i * 26, i + 1, color);
    });
    html += `</div>`;
  }
  return html;
}
