// combat-assign.js — combat damage assignment as an ORDERED LANE (rule 465.2.c).
//
// The engine parks a `combat-damage` pendingChoice { total, options, lethalNeed,
// tier, defaultAllocation, side, battlefieldId } and accepts ONE allocation map
// {unitId: amount}. Instead of one button per legal map, the player arranges the
// receiving units left → right; the allocation is DERIVED from that order by the
// rules' own greedy fill: each unit takes lethal before the next gets any
// (465.2.c.3/.4), the excess — only once everyone is lethal — piles on the last
// unit that took damage, and units the damage never reaches show 0. Tank units
// are pinned to the front (815.1.b), Backline to the back (826.4.b); a unit
// with both may sit at either end (465.2.c.8). Pure helpers live on
// `globalThis.CombatAssign` so bun can unit-test them; the renderer is a plain
// global used by render/modals.js. Classic script — no imports.

(function (root) {
  const FLEX = -1; // engine FLEXIBLE_TIER: Tank + Backline on one unit

  const tierOf = (tier, id) => (tier && typeof tier[id] === "number" ? tier[id] : 1);
  const needOf = (need, id, total) => {
    const n = need ? need[id] : undefined;
    return typeof n === "number" && n >= 0 ? n : Math.max(1, Number(total) || 1);
  };

  /**
   * Greedy lethal fill over an ordered list (465.2.c.3–.4): returns {unitId: n}
   * for EVERY id in `order` (zeros kept so the lane can print them).
   */
  function greedyFill(order, need, total) {
    const alloc = {};
    let remaining = Math.max(0, Math.floor(Number(total) || 0));
    let last = null;
    for (const id of order) alloc[id] = 0;
    for (const id of order) {
      if (remaining <= 0) break;
      const give = Math.min(remaining, needOf(need, id, total));
      alloc[id] = give;
      remaining -= give;
      if (give > 0) last = id;
    }
    if (remaining > 0 && order.length) {
      const sink = last ?? order[0];
      alloc[sink] = (alloc[sink] || 0) + remaining;
    }
    return alloc;
  }

  /**
   * Is this left→right order legal tier-wise? Tiers must be non-decreasing
   * (0 Tank → 1 plain → 2 Backline); a FLEX unit counts as 0 while nothing
   * later than Tank precedes it, else as 2. Returns { ok, offender, reason }.
   */
  function checkOrder(order, tier) {
    let maxSoFar = -Infinity;
    let maxId = null;
    for (const id of order) {
      let t = tierOf(tier, id);
      if (t === FLEX) t = maxSoFar <= 0 ? 0 : 2;
      if (t < maxSoFar) {
        return { ok: false, offender: id, blocker: maxId, reason: t === 0 ? "tank-behind" : "backline-ahead" };
      }
      if (t > maxSoFar) { maxSoFar = t; maxId = id; }
    }
    return { ok: true };
  }

  /** Stable re-sort into a legal order: Tanks, then plain (and FLEX kept in place if legal), then Backline. */
  function normalizeOrder(order, tier) {
    if (checkOrder(order, tier).ok) return order.slice();
    const rank = (id) => { const t = tierOf(tier, id); return t === FLEX ? 0 : t; };
    return order.map((id, i) => ({ id, i })).sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i).map(x => x.id);
  }

  /** Move `id` to index `to` (clamped). */
  function moveTo(order, id, to) {
    const rest = order.filter(x => x !== id);
    const at = Math.max(0, Math.min(rest.length, to));
    rest.splice(at, 0, id);
    return rest;
  }

  function readings(options, tier) {
    let out = [Object.fromEntries(options.map(id => [id, tierOf(tier, id)]))];
    for (const id of options) {
      if (tierOf(tier, id) !== FLEX) continue;
      out = out.flatMap(r => [{ ...r, [id]: 0 }, { ...r, [id]: 2 }]);
    }
    return out;
  }

  /**
   * Client-side mirror of the engine's isLegalDamageAssignment (the move still
   * validates server-side) so the Advanced editor can say WHY a map is refused.
   */
  function checkAllocation(plan, alloc, nameOf) {
    const name = nameOf || ((id) => id);
    const options = plan.options || [];
    let sum = 0;
    for (const [id, v] of Object.entries(alloc || {})) {
      if (!options.includes(id)) return { ok: false, reason: `${name(id)} is not in this combat` };
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return { ok: false, reason: "amounts must be whole numbers ≥ 0" };
      sum += v;
    }
    if (sum !== plan.total) return { ok: false, reason: `must total ${plan.total} (now ${sum})` };
    const got = (id) => (alloc[id] || 0);
    const lethal = (id) => got(id) >= needOf(plan.lethalNeed, id, plan.total);
    const everyoneLethal = options.every(lethal);
    let lastReason = "";
    for (const tier of readings(options, plan.tier)) {
      let bad = "";
      let partials = 0;
      for (const id of options) {
        const n = got(id);
        if (n > needOf(plan.lethalNeed, id, plan.total) && !everyoneLethal) { bad = `no excess on ${name(id)} while another unit isn't lethal (465.2.c.4)`; break; }
        if (n > 0 && !lethal(id)) partials++;
        if (n > 0) {
          const blocker = options.find(o => (tier[o] ?? 1) < (tier[id] ?? 1) && !lethal(o));
          if (blocker) { bad = `${name(blocker)} ${(tier[blocker] ?? 1) === 0 ? "(Tank) " : ""}must be lethal before ${name(id)} takes any`; break; }
        }
      }
      if (!bad && partials > 1) bad = "only one unit may be left partially damaged (465.2.c.3)";
      if (!bad) return { ok: true };
      lastReason = bad;
    }
    return { ok: false, reason: lastReason };
  }

  /** Drop zero buckets (the engine enumerates canonically without them). */
  function canonical(alloc) {
    const out = {};
    for (const [id, n] of Object.entries(alloc || {})) if (n > 0) out[id] = n;
    return out;
  }

  root.CombatAssign = { FLEX, greedyFill, checkOrder, normalizeOrder, moveTo, checkAllocation, canonical, needOf, tierOf };
})(typeof globalThis !== "undefined" ? globalThis : window);

/* ============================================================
   Renderer — called by renderPendingChoiceModal for type "combat-damage".
   ============================================================ */
let _cdLane = { key: null, order: [], advanced: false, manual: null, hint: "", focusId: null, dragId: null };

function ensureCombatAssignStyles() {
  if (typeof document === "undefined" || document.getElementById("combatAssignStyles")) return;
  const st = document.createElement("style");
  st.id = "combatAssignStyles";
  st.textContent = `
    .choice-modal.cd-wide { max-width: 920px; }
    .cd-sub { color: #a99fd0; font-size: 12px; margin: 2px 0 10px; line-height: 1.4; }
    .cd-lane-wrap { display: flex; align-items: stretch; gap: 12px; overflow-x: auto; padding: 6px 2px 10px; }
    .cd-total { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 92px;
      background: #2a1420; border: 2px solid #d04040; border-radius: 12px; color: #ffb0b0; padding: 8px; }
    .cd-total b { font-size: 34px; line-height: 1; color: #ff6a6a; }
    .cd-total span { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; }
    .cd-total i { font-style: normal; font-size: 26px; color: #ff6a6a; margin-top: 2px; }
    .cd-lane { display: flex; gap: 10px; align-items: stretch; list-style: none; margin: 0; padding: 0; }
    .cd-tile { position: relative; width: 132px; flex-shrink: 0; background: #221f3a; border: 2px solid #4a3f6a; border-radius: 10px; padding: 6px 6px 8px;
      display: flex; flex-direction: column; align-items: center; gap: 3px; cursor: grab; user-select: none; transition: border-color .12s, opacity .12s, transform .12s; }
    .cd-tile:focus { outline: none; border-color: #a0e0ff; }
    .cd-tile.cd-dragging { opacity: .4; }
    .cd-tile.cd-drop-before { box-shadow: -4px 0 0 #ffd070; }
    .cd-tile.cd-drop-after { box-shadow: 4px 0 0 #ffd070; }
    .cd-tile.cd-zero { opacity: .5; border-style: dashed; }
    .cd-tile.cd-lethal { border-color: #d04040; }
    .cd-tile.cd-snap { animation: cdSnap .45s ease; }
    @keyframes cdSnap { 0% { transform: translateX(0); } 25% { transform: translateX(-8px); } 50% { transform: translateX(8px); } 75% { transform: translateX(-4px); } 100% { transform: translateX(0); } }
    .cd-pos { position: absolute; top: -9px; left: -9px; width: 22px; height: 22px; border-radius: 11px; background: #ffd070; color: #1a1830; font-weight: 800; font-size: 12px; display: flex; align-items: center; justify-content: center; }
    .cd-img { width: 96px; height: 134px; object-fit: cover; border-radius: 6px; background: #0e0a1c; pointer-events: none; }
    .cd-fallback { width: 96px; height: 134px; border-radius: 6px; background: #241f38; border: 1px solid #4a4270; color: #cfc8ee; font-size: 11px; display: none; align-items: center; justify-content: center; text-align: center; padding: 4px; box-sizing: border-box; }
    .cd-name { font-size: 12px; font-weight: 600; color: #e0dced; text-align: center; line-height: 1.15; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cd-kw { font-size: 10px; color: #a0e0ff; text-align: center; min-height: 12px; }
    .cd-kw.cd-kw-tank { color: #ffd070; }
    .cd-amt { font-size: 30px; font-weight: 800; line-height: 1; color: #ff6a6a; margin-top: 2px; }
    .cd-tile.cd-zero .cd-amt { color: #6a6288; }
    .cd-leth { font-size: 10px; color: #8a82a6; text-align: center; min-height: 12px; }
    .cd-tile.cd-lethal .cd-leth { color: #ff8a8a; font-weight: 700; }
    .cd-mv { display: flex; gap: 4px; margin-top: 3px; }
    .cd-mv button { background: #1e1b30; border: 1px solid #3a3560; color: #e0dced; border-radius: 4px; width: 28px; height: 22px; cursor: pointer; font-size: 11px; padding: 0; }
    .cd-mv button:disabled { opacity: .3; cursor: default; }
    .cd-mv button:hover:not(:disabled) { border-color: #ffd070; }
    .cd-step { display: flex; align-items: center; gap: 4px; margin-top: 3px; }
    .cd-step button { background: #1e1b30; border: 1px solid #3a3560; color: #e0dced; border-radius: 4px; width: 24px; height: 24px; cursor: pointer; font-size: 14px; padding: 0; }
    .cd-step b { min-width: 20px; text-align: center; font-size: 15px; color: #ffd070; }
    .cd-status { font-size: 12px; color: #cfc8ee; margin: 4px 0 2px; }
    .cd-status.cd-bad { color: #ff8a8a; }
    .cd-hint { font-size: 12px; color: #ffd070; min-height: 16px; margin: 2px 0; }
    .cd-foot { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding-top: 6px; }
    .cd-foot .choice-modal-btn.cd-confirm { border-color: #ffd070; color: #ffd070; font-weight: 700; flex: 1; text-align: center; }
    .cd-foot .choice-modal-btn:disabled { opacity: .45; cursor: default; }
    .cd-adv { background: none; border: none; color: #8a82a6; font-size: 11px; cursor: pointer; text-decoration: underline; padding: 4px; }
  `;
  document.head.appendChild(st);
}

function _cdPlan(pending) {
  return { options: (pending.options || []).map(String), total: Number(pending.total) || 0, lethalNeed: pending.lethalNeed || {}, tier: pending.tier || {} };
}

/** Current allocation shown in the lane: manual (advanced) or derived from the order. */
function _cdCurrentAlloc(plan) {
  if (_cdLane.advanced && _cdLane.manual) return { ..._cdLane.manual };
  return CombatAssign.greedyFill(_cdLane.order, plan.lethalNeed, plan.total);
}

function _cdSend(pending, alloc) {
  const picks = availableMoves.filter(m => m.moveId === "resolvePendingChoice" && m.params && typeof m.params.allocation === "object");
  const me = picks[0]?.playerId ?? pending.playerId ?? viewingPlayer;
  const want = CombatAssign.canonical(alloc);
  const key = (a) => JSON.stringify(Object.keys(a).sort().map(k => [k, a[k]]));
  const exact = picks.find(m => key(CombatAssign.canonical(m.params.allocation)) === key(want));
  executeMove("resolvePendingChoice", exact ? exact.params : { playerId: me, allocation: want }, exact ? exact.playerId : me);
}

/** Try to apply a new order; illegal (Tank behind / Backline ahead) → snap back with a hint. */
function _cdApplyOrder(pending, next, movedId) {
  const plan = _cdPlan(pending);
  const chk = CombatAssign.checkOrder(next, plan.tier);
  if (!chk.ok) {
    const t = CombatAssign.tierOf(plan.tier, movedId);
    const nm = (id) => promptName(id);
    _cdLane.hint = chk.reason === "tank-behind"
      ? `🛡 ${nm(chk.offender)} has Tank — it must be assigned lethal damage before any non-Tank unit (815).`
      : t === 2 || chk.reason === "backline-ahead"
      ? `${nm(chk.offender === movedId ? movedId : chk.blocker ?? movedId)} has Backline — it is assigned damage last (826).`
      : `That order isn't legal: Tank first, Backline last.`;
    _cdLane.snapId = movedId;
  } else {
    _cdLane.order = next;
    _cdLane.hint = "";
    _cdLane.snapId = null;
    if (_cdLane.advanced) _cdLane.manual = CombatAssign.greedyFill(next, plan.lethalNeed, plan.total);
  }
  _cdLane.focusId = movedId;
  renderCombatDamageLane(pending, document.getElementById("choiceBox"));
}

function renderCombatDamageLane(pending, box) {
  ensureCombatAssignStyles();
  if (!box) return;
  box.classList.add("cd-wide");
  const plan = _cdPlan(pending);
  const key = JSON.stringify([pending.battlefieldId, pending.side, plan.options, plan.total, plan.lethalNeed]);
  if (_cdLane.key !== key) {
    _cdLane = { key, order: CombatAssign.normalizeOrder(plan.options, plan.tier), advanced: false, manual: null, hint: "", focusId: null, dragId: null, snapId: null };
  }
  // Keep the working order a permutation of the offered ids.
  const known = new Set(plan.options);
  _cdLane.order = [..._cdLane.order.filter(id => known.has(id)), ...plan.options.filter(id => !_cdLane.order.includes(id))];
  const order = _cdLane.order;
  const alloc = _cdCurrentAlloc(plan);
  const assigned = Object.values(alloc).reduce((s, n) => s + n, 0);
  const nm = (id) => promptName(id);
  const legality = CombatAssign.checkAllocation(plan, CombatAssign.canonical(alloc), nm);

  const title = typeof pendingChoiceTitle === "function" ? pendingChoiceTitle(pending) : `Assign ${plan.total} combat damage`;
  const youAre = pending.side === "defender" ? "You're defending — your units deal" : pending.side === "attacker" ? "You're attacking — your units deal" : "Your units deal";
  const them = pending.side === "defender" ? "attacking" : "enemy";
  let html = `<div class="chain-title">${typeof promptTitleHtml === "function" ? promptTitleHtml(title) : esc(title)}</div>`;
  html += `<div class="chain-subtitle">Play is paused until you choose</div>`;
  html += `<div class="cd-sub" data-cd-instruction>${esc(`${youAre} ${plan.total} damage. Drag the ${them} units into the order they take it (or use ◀ ▶ / arrow keys): each unit must be dealt lethal damage before the next one gets any, and any excess lands on the last unit reached.`)}${order.some(id => CombatAssign.tierOf(plan.tier, id) === 0) ? esc(" 🛡 Tank units must come first.") : ""}${order.some(id => CombatAssign.tierOf(plan.tier, id) === 2) ? esc(" Backline units come last.") : ""}</div>`;

  html += `<div class="cd-lane-wrap"><div class="cd-total" data-cd-total><span>assign</span><b>${plan.total}</b><span>dmg</span><i>→</i></div><ol class="cd-lane" data-cd-lane>`;
  order.forEach((id, idx) => {
    const card = typeof findCard === "function" ? findCard(id) : null;
    const defId = String(card?.definitionId ?? id).replace(/^player-[12]-(?:(?:main|rune)-\d+-|bf-|legend-|champion-)?/, "");
    const n = alloc[id] || 0;
    const need = CombatAssign.needOf(plan.lethalNeed, id, plan.total);
    const t = CombatAssign.tierOf(plan.tier, id);
    const isLethal = n >= need && n > 0;
    const kw = t === 0 ? `🛡 Tank — assigned first` : t === 2 ? `↧ Backline — assigned last` : t === CombatAssign.FLEX ? `🛡↧ Tank + Backline — first or last` : "";
    const lethTxt = n === 0 ? "no damage reaches" : isLethal ? `☠ lethal${n > need ? ` (+${n - need} excess)` : ""} · needs ${need}` : `${n}/${need} — survives`;
    const label = `${idx + 1}. ${card?.name ?? nm(id)}: ${n} damage${isLethal ? " (lethal)" : ""}`;
    html += `<li class="cd-tile${n === 0 ? " cd-zero" : ""}${isLethal ? " cd-lethal" : ""}${_cdLane.snapId === id ? " cd-snap" : ""}" data-cd-tile="${esc(id)}" data-card-id="${esc(id)}" draggable="true" tabindex="0" role="listitem" aria-label="${esc(label)}" title="${esc(label)}">
        <div class="cd-pos">${idx + 1}</div>
        <img class="cd-img" src="/card-image/${esc(defId)}" alt="" draggable="false" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="cd-fallback">${esc(card?.name ?? nm(id))}</div>
        <div class="cd-name">${esc(card?.name ?? nm(id))}</div>
        <div class="cd-kw${t === 0 ? " cd-kw-tank" : ""}" data-cd-kw>${esc(kw)}</div>
        ${_cdLane.advanced
          ? `<div class="cd-step"><button type="button" data-cd-step="-1" data-cd-unit="${esc(id)}" aria-label="Less damage to ${esc(card?.name ?? nm(id))}">−</button><b data-cd-amount="${esc(id)}">${n}</b><button type="button" data-cd-step="1" data-cd-unit="${esc(id)}" aria-label="More damage to ${esc(card?.name ?? nm(id))}">+</button></div>`
          : `<div class="cd-amt" data-cd-amount="${esc(id)}">${n}</div>`}
        <div class="cd-leth" data-cd-lethal-note>${esc(lethTxt)}</div>
        <div class="cd-mv"><button type="button" data-cd-left="${esc(id)}" title="Move earlier" aria-label="Move earlier" ${idx === 0 ? "disabled" : ""}>◀</button><button type="button" data-cd-right="${esc(id)}" title="Move later" aria-label="Move later" ${idx === order.length - 1 ? "disabled" : ""}>▶</button></div>
      </li>`;
  });
  html += `</ol></div>`;

  const kills = order.filter(id => (alloc[id] || 0) >= CombatAssign.needOf(plan.lethalNeed, id, plan.total) && (alloc[id] || 0) > 0).map(nm);
  html += `<div class="cd-status${legality.ok ? "" : " cd-bad"}" data-cd-status>${esc(`${assigned}/${plan.total} assigned`)}${kills.length ? esc(` · lethal to ${kills.join(", ")}`) : esc(" · nothing dies")}${legality.ok ? "" : esc(` — ${legality.reason}`)}</div>`;
  html += `<div class="cd-hint" data-cd-hint>${esc(_cdLane.hint || "")}</div>`;

  const summary = order.filter(id => (alloc[id] || 0) > 0).map(id => `${nm(id)} ${alloc[id]}`).join(" · ") || "No targets";
  html += `<div class="cd-foot">
      <button class="choice-modal-btn cd-confirm" type="button" data-cd-confirm ${legality.ok ? "" : "disabled"}>${esc(`Confirm — ${summary}`)}</button>
      <button class="cd-adv" type="button" data-cd-advanced>${_cdLane.advanced ? "◂ Back to drag order" : "Advanced: edit numbers ▸"}</button>
    </div>`;

  box.innerHTML = html;

  // ---- wiring ---------------------------------------------------------------
  const idxOf = (id) => _cdLane.order.indexOf(id);
  box.querySelectorAll("[data-cd-left]").forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); const id = b.dataset.cdLeft; _cdApplyOrder(pending, CombatAssign.moveTo(_cdLane.order, id, idxOf(id) - 1), id); }));
  box.querySelectorAll("[data-cd-right]").forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); const id = b.dataset.cdRight; _cdApplyOrder(pending, CombatAssign.moveTo(_cdLane.order, id, idxOf(id) + 1), id); }));
  box.querySelectorAll("[data-cd-step]").forEach(b => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = b.dataset.cdUnit;
    const d = Number(b.dataset.cdStep);
    const cur = _cdLane.manual || CombatAssign.greedyFill(_cdLane.order, plan.lethalNeed, plan.total);
    cur[id] = Math.max(0, Math.min(plan.total, (cur[id] || 0) + d));
    _cdLane.manual = cur;
    _cdLane.focusId = null;
    renderCombatDamageLane(pending, box);
  }));
  box.querySelector("[data-cd-advanced]")?.addEventListener("click", () => {
    _cdLane.advanced = !_cdLane.advanced;
    _cdLane.manual = _cdLane.advanced ? CombatAssign.greedyFill(_cdLane.order, plan.lethalNeed, plan.total) : null;
    _cdLane.hint = _cdLane.advanced ? "Editing numbers directly — the engine still enforces lethal-first / no-early-excess." : "";
    renderCombatDamageLane(pending, box);
  });
  box.querySelector("[data-cd-confirm]")?.addEventListener("click", () => {
    const a = _cdCurrentAlloc(plan);
    if (!CombatAssign.checkAllocation(plan, CombatAssign.canonical(a), nm).ok) return;
    _cdSend(pending, a);
  });
  box.querySelectorAll("[data-cd-tile]").forEach(tile => {
    const id = tile.dataset.cdTile;
    tile.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        _cdApplyOrder(pending, CombatAssign.moveTo(_cdLane.order, id, idxOf(id) + (e.key === "ArrowLeft" ? -1 : 1)), id);
      } else if (e.key === "Enter") {
        e.preventDefault();
        box.querySelector("[data-cd-confirm]")?.click();
      }
    });
    tile.addEventListener("dragstart", (e) => {
      _cdLane.dragId = id;
      tile.classList.add("cd-dragging");
      try { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; } catch (_) { /* synthetic */ }
    });
    tile.addEventListener("dragend", () => { _cdLane.dragId = null; tile.classList.remove("cd-dragging"); box.querySelectorAll(".cd-drop-before,.cd-drop-after").forEach(x => x.classList.remove("cd-drop-before", "cd-drop-after")); });
    tile.addEventListener("dragover", (e) => {
      if (!_cdLane.dragId || _cdLane.dragId === id) return;
      e.preventDefault();
      const r = tile.getBoundingClientRect();
      const before = (e.clientX || r.left) < r.left + r.width / 2;
      tile.classList.toggle("cd-drop-before", before);
      tile.classList.toggle("cd-drop-after", !before);
    });
    tile.addEventListener("dragleave", () => tile.classList.remove("cd-drop-before", "cd-drop-after"));
    tile.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = _cdLane.dragId || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
      if (!from || from === id) return;
      const r = tile.getBoundingClientRect();
      const before = (e.clientX || r.left) < r.left + r.width / 2;
      const rest = _cdLane.order.filter(k => k !== from);
      const at = rest.indexOf(id) + (before ? 0 : 1);
      rest.splice(at, 0, from);
      _cdLane.dragId = null;
      _cdApplyOrder(pending, rest, from);
    });
  });
  if (_cdLane.focusId) {
    box.querySelector(`[data-cd-tile="${CSS.escape(_cdLane.focusId)}"]`)?.focus?.();
  }
  _cdLane.snapId = null; // the snap-back shake plays once
}

/** Programmatic reorder for drivers/tests: move unit `id` to position `to` (0-based). */
function combatAssignMove(id, to) {
  const pending = gameState?.pendingChoice;
  if (!pending || pending.type !== "combat-damage") return false;
  _cdApplyOrder(pending, CombatAssign.moveTo(_cdLane.order, id, to), id);
  return true;
}

if (typeof window !== "undefined") {
  window.renderCombatDamageLane = renderCombatDamageLane;
  window.combatAssignMove = combatAssignMove;
}
