// render/modals.js — Choice modals (pending choice, play-cost) and the chain
// overlay. Classic script: everything is global. Split out of renderer.js.

// Choice Modals — shared Arena-style overlay for pending choices and
// optional-cost play prompts.

function ensureChoiceOverlay() {
  let overlay = document.getElementById("choiceOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "choiceOverlay";
    overlay.className = "chain-overlay";
    overlay.innerHTML = '<div class="chain-box choice-modal" id="choiceBox"></div>';
    document.body.appendChild(overlay);
  }
  return { overlay, box: document.getElementById("choiceBox") };
}

function closeChoiceModal() {
  const overlay = document.getElementById("choiceOverlay");
  if (overlay) overlay.classList.remove("visible");
}

// Rule 583 / 422: render an optional cost ({xp, energy, power:[…], discard,
// exhaust}) as short prose — an opt-in trigger's `optInCost` or a
// reveal-and-pick's `pickCost` (unl-135-219 "you may pay 2 XP to choose a
// card"). Returns null when the choice is free, so titles stay unchanged.
function describeOptInCost(cost) {
  if (!cost || typeof cost !== "object") return null;
  const parts = [];
  if (cost.energy) parts.push(`${cost.energy} energy`);
  if (Array.isArray(cost.power) && cost.power.length) parts.push(cost.power.join(" + "));
  if (cost.xp) parts.push(`${cost.xp} XP`);
  if (cost.discard) parts.push(`discard ${cost.discard}`);
  if (cost.exhaust) parts.push("exhaust");
  return parts.length ? `pay ${parts.join(", ")}` : null;
}

/** Display name of a card id / zone id / seat for prompt labels. */
function promptName(id) {
  if (typeof id !== "string") return String(id ?? "");
  const c = findCard(id);
  if (c?.name) return c.name;
  if (id === "base") return "Base";
  if (/^battlefield-/.test(id)) return getBattlefieldName(id.replace(/^battlefield-/, ""));
  if (gameState?.players?.[id]) return pName(id);
  return id.replace(/^player-[12]-(?:(?:main|rune)-\d+-)?/, "");
}

/**
 * The prompt's headline for EVERY pendingChoice type the engine can park —
 * shared by the modal and the sidebar so neither falls back to "Choose a card"
 * for a yes/no, an X amount or a damage split.
 */
function pendingChoiceTitle(pending) {
  const src = findCard(pending.sourceCardId)?.name;
  switch (pending.type) {
    case "opt-in": {
      // Rule 583 (sfd-119-221): a "you may pay X to …" trigger names its cost.
      const cost = describeOptInCost(pending.resolved?.optInCost ?? pending.acceleratePlay?.cost);
      if (pending.acceleratePlay) return `Pay Accelerate for ${promptName(pending.acceleratePlay.cardId)}?${cost ? ` (${cost})` : ""} — enters ready`;
      if (pending.counterRansom) return `Pay to stop ${src ?? "the counter"}?${cost ? ` (${cost})` : ""}`;
      return `Use ${src ?? "optional"} ability?${cost ? ` (${cost})` : ""}`;
    }
    case "confirm": return pending.prompt ?? `${src ? `${src}: ` : ""}Do it?`;
    case "reveal-and-pick":
      return pending.onPicked === "discard" ? "Discard a card"
        : pending.onPicked === "banish" ? "Banish a card"
        : pending.onPicked === "recycle" ? "Recycle a card"
        : pending.onPicked === "draw" ? "Choose a card to draw"
        : pending.onPicked === "play" ? "Choose a card to play"
        : "Choose a card";
    case "name-card": return `Name a ${pending.cardType === "tag" ? "tag" : (pending.cardType ?? "card")}${src ? ` for ${src}` : ""}`;
    case "choose-destination": return `Choose where ${promptName(pending.cardId)} goes`;
    case "choose-target":
      // Rule ogn-256-298: "any number of" multi-pick — picks accumulate until Done.
      if (pending.anyNumber) return `Choose any number of targets${pending.picked?.length ? ` (${pending.picked.length} chosen)` : ""}`;
      // Rule 355.14 (ogn-041-298): fixed-total split damage.
      if (pending.assign && typeof pending.total === "number") return `Split ${pending.total} damage${src ? ` from ${src}` : ""}`;
      // rule 372 (RPL): which replacement applies to this death.
      if (pending.replacementOrderFor) return `Which effect saves ${promptName(pending.replacementOrderFor)}?`;
      // Rule 355.5: a play-time target prompt may name what is being chosen.
      return pending.prompt ?? `Choose a target${src ? ` for ${src}` : ""}`;
    case "choose-mode": return `${src ?? "Choose one"} — choose one`;  // Rule 355.3 / sfd-091-221
    case "choose-player": return pending.prompt ?? `Choose a player${src ? ` for ${src}` : ""}`;
    case "combat-damage": return `Assign ${pending.total} combat damage${pending.battlefieldId ? ` at ${getBattlefieldName(pending.battlefieldId)}` : ""}${pending.side ? ` (${pending.side})` : ""}`;
    case "pay-x": return pending.prompt ?? `${src ?? "Pay X"} — choose X`;
    case "order-cards": return `${src ? `${src}: ` : ""}Put the cards back in any order (first = top)`;
    case "weaponmaster-equip": return `Weaponmaster: equip ${promptName(pending.unitId)} for [rainbow] less?`;
    // rule 372 die-order / 373 die-assign / 383.3.d trigger-batch / 355.11.b subset — the producer ships the
    // prompt; name the card it is about ("which death does Zhonya's Hourglass replace?").
    case "order": {
      const about = pending.resume?.kind === "die-order" ? promptName(pending.resume.dyingCardId) : src;
      return `${about ? `${about}: ` : ""}${pending.prompt ?? "Choose an order"}`;
    }
    case "pick-many": {
      const range = pending.min === pending.max ? `${pending.min}` : `${pending.min}–${pending.max}`;
      return `${src ? `${src}: ` : ""}${pending.prompt ?? "Choose"} (${range})`;
    }
    default: return pending.prompt ?? "Choose";
  }
}

/**
 * Label for ONE resolvePendingChoice variant, whatever its answer shape —
 * pickedCardId / pickedZoneId / pickedMode / pickedName / pickedPlayerId /
 * accept / allocation / xAmount / orderedKeys / pickedKeys / orderedCardIds.
 */
function pendingPickLabel(pending, p) {
  p = p || {};
  // Rule 355.14 (ogn-041-298) / 465.2.c: damage allocation → "Unit 2 · Other 3" / "No targets".
  if (p.allocation && typeof p.allocation === "object") {
    const parts = Object.entries(p.allocation).filter(([, n]) => n > 0).map(([cid, n]) => `${promptName(cid)} ${n}`);
    return parts.length ? parts.join(" · ") : "No targets";
  }
  // Rule 355.3: printed bullet (server `optionLabels` / parser `label`), never a raw effect id.
  if (p.pickedMode != null && pending?.type === "choose-mode") return modeOptionText(pending, p.pickedMode);
  if (typeof p.xAmount === "number") return `X = ${p.xAmount}`;
  if (Array.isArray(p.pickedCardIds)) return p.pickedCardIds.map(promptName).join(" + ");
  if (Array.isArray(p.orderedCardIds)) return p.orderedCardIds.map(promptName).join(" → ");
  if (Array.isArray(p.orderedKeys)) {
    if (p.label) return p.label;
    if (p.orderedKeys.length === 0) return "Keep this order";
    return p.orderedKeys.map(k => pending?.items?.find(i => i.key === k)?.label ?? promptName(k)).join(" → ");
  }
  if (Array.isArray(p.pickedKeys)) {
    if (p.label) return p.label;
    return p.pickedKeys.length ? p.pickedKeys.map(k => pending?.options?.find?.(o => o.key === k)?.label ?? promptName(k)).join(" + ") : "None";
  }
  if (p.pickedCardId) return promptName(p.pickedCardId) + (p.paidAdditionalCost ? " (pay additional cost)" : "");
  if (p.pickedPlayerId) return pName(p.pickedPlayerId);
  if (p.pickedName != null) return String(p.pickedName);
  // Rule ogn-102-298 / sfd-109-221: destination zone (+ optional additional cost of a pending play).
  if (p.pickedZoneId != null) return promptName(String(p.pickedZoneId).startsWith("battlefield-") || p.pickedZoneId === "base" ? p.pickedZoneId : `battlefield-${p.pickedZoneId}`) + (p.paidAdditionalCost ? " (pay additional cost)" : "");
  if (typeof p.accept === "boolean") {
    if (pending?.type === "choose-target" && pending.anyNumber) return p.accept ? "Yes" : "Done";
    if (pending?.type === "weaponmaster-equip") return p.accept ? "Yes" : "Don't equip";
    if (pending?.type === "choose-destination") return p.accept ? "Yes" : "Don't move";
    // Rule ogn-067-298 / 355.13: an optional reveal-and-pick is declined AFTER the reveal.
    if (pending?.type === "reveal-and-pick" || (pending?.type === "choose-target" && pending.optional)) return p.accept ? "Yes" : "Decline";
    if (pending?.type === "opt-in" && pending.acceleratePlay) return p.accept ? "Pay — enters ready" : "No — enters exhausted";
    return p.accept ? "Yes" : "No";
  }
  return p.label ?? "Choose";
}

/** Prompts answered with a composed value (sequence / subset / amount) rather than one click per enumerated variant. */
function isCompositePending(pending) {
  return !!pending && (pending.type === "order" || pending.type === "pick-many" || pending.type === "pay-x" || pending.type === "order-cards");
}

// Local, un-sent state of the composite choosers (reset whenever the prompt changes).
let _compose = { key: null, seq: [], set: [], x: null };

function renderPendingChoiceModal() {
  const pending = gameState?.pendingChoice;
  const mine = pending && (pending.prompter ?? pending.playerId) === viewingPlayer;
  const { overlay, box } = ensureChoiceOverlay();

  if (!pending || !mine) {
    // Don't stomp a play-cost modal that's currently open.
    if (overlay.dataset.mode === "pending") closeChoiceModal();
    overlay.classList.remove("targeting");
    return;
  }
  overlay.dataset.mode = "pending";
  overlay.dataset.pendingType = pending.type ?? "";
  // Card picks are mirrored as board glows (applyPendingChoiceHighlights); let
  // clicks reach the board by making the backdrop pass-through for those prompts.
  const hasBoardPicks = pending.type === "choose-target" || availableMoves.some(m =>
    m.moveId === "resolvePendingChoice" && m.params?.pickedCardId &&
    document.querySelector(`#game-scale-wrapper [data-card-id="${CSS.escape(m.params.pickedCardId)}"]`));
  overlay.classList.toggle("targeting", !!hasBoardPicks);
  if (typeof closeZoom === "function") closeZoom();
  // A floating hover preview left over from the click that caused the prompt must not cover it.
  if (!overlay.classList.contains("visible") && typeof hidePreview === "function") hidePreview();

  if (isCompositePending(pending)) {
    renderCompositeChoice(pending, box);
    overlay.classList.add("visible");
    return;
  }

  const title = pendingChoiceTitle(pending);

  let html = `<div class="chain-title">${esc(title)}</div>`;
  // Rule 356.1 (unl-135-219): a pick that costs something must say so before
  // the player commits — Decline is always the free way out.
  const pickCostText = describeOptInCost(pending.pickCost);
  html += `<div class="chain-subtitle">${pickCostText
    ? esc(`Choosing a card costs ${pickCostText.replace(/^pay /, "")} — or decline`)
    : "Play is paused until you choose"}</div>`;

  const picks = availableMoves.filter(m => m.moveId === "resolvePendingChoice");
  const cardPicks = picks.filter(m => m.params?.pickedCardId);
  const otherPicks = picks.filter(m => !m.params?.pickedCardId);
  // rule 355.14 / 465.2.c: a damage split names the units it is spread over —
  // show them (inert) above the allocation buttons so "Recruit 2 · Poro 1" can be read against the board.
  const contextIds = (pending.type === "combat-damage" || (pending.type === "choose-target" && pending.assign)) && Array.isArray(pending.options)
    ? pending.options.map(String) : [];

  // Rule 355.13 (ogn-062-298): a look/reveal prompt must show EVERY card that
  // was looked at, not just the ones an eligibility filter kept ("Look at the
  // top 5 … you may play a unit from among them"). The modal covers the board,
  // so a card absent here is invisible to the player. Ineligible reveals render
  // dimmed and inert next to the pickable ones.
  const revealedIds = (Array.isArray(pending.revealed) ? pending.revealed : []).map(String);
  const pickIdxOf = new Map(cardPicks.map((m, i) => [String(m.params.pickedCardId), i]));
  const shownIds = [
    ...revealedIds,
    ...cardPicks.map(m => String(m.params.pickedCardId)).filter(id => !revealedIds.includes(id)),
    ...contextIds.filter(id => !revealedIds.includes(id) && !pickIdxOf.has(id)),
  ];

  if (shownIds.length) {
    html += `<div class="choice-modal-cards">`;
    for (const cid of shownIds) {
      const card = findCard(cid);
      const imgId = (card?.definitionId ?? cid).replace(/^player-[12]-(?:main|rune)-\d+-/, "");
      const idx = pickIdxOf.get(cid);
      const isContext = contextIds.includes(cid) && idx == null;
      const attrs = idx == null
        ? `class="choice-modal-card choice-modal-card-ineligible${isContext ? " choice-modal-card-context" : ""}" data-card-id="${esc(cid)}" style="opacity:${isContext ? ".85" : ".4"};cursor:default"`
        : `class="choice-modal-card" data-pick-idx="${idx}" data-card-id="${esc(cid)}" role="button" tabindex="0" aria-label="${esc(card?.name ?? cid)}"`;
      // Tokens (definitionId `token-def-<slug>`) usually have no art on disk or
      // in the CDN map, so the bare <img> 404s into a broken-image icon. Mirror
      // renderCard's fallback tile: hide the image and show a named tile.
      const label = esc(card?.name ?? cid);
      html += `<div ${attrs} title="${label}"><img class="choice-modal-card-img" src="/card-image/${esc(imgId)}"
        alt="${label}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
        ><div class="card-fallback" style="display:none">
        <div class="fallback-cost">${card?.energyCost != null ? esc(card.energyCost) : "&mdash;"}</div>
        <div class="fallback-name">${label}</div>
        <div class="fallback-type">${esc(card?.cardType ?? "")}</div>
      </div></div>`;
    }
    html += `</div>`;
  }
  if (otherPicks.length) {
    // Rule 762 (name-card): hundreds of legal names — add a filter box above the buttons.
    const many = otherPicks.length > 12;
    if (many) html += `<input class="choice-modal-filter" type="text" placeholder="Type to filter…" style="width:100%;margin:6px 0;padding:6px 8px;background:#1e1b30;border:1px solid #3a3560;border-radius:4px;color:#e0dced;">`;
    html += `<div class="choice-modal-btns${many ? " choice-modal-btns--many" : ""}"${many ? ' style="max-height:320px;overflow-y:auto;"' : ""}>`;
    for (let i = 0; i < otherPicks.length; i++) {
      const label = pendingPickLabel(pending, otherPicks[i].params);
      html += `<button class="choice-modal-btn" data-other-idx="${i}">${esc(String(label))}</button>`;
    }
    html += `</div>`;
  }

  box.innerHTML = html;
  // Attach handlers via delegation instead of inline onclick — avoids
  // interpolating server-derived params into an HTML attribute.
  box.querySelectorAll(".choice-modal-card").forEach(el => {
    const pickIt = () => {
      const m = cardPicks[Number(el.dataset.pickIdx)];
      if (m) executeMove("resolvePendingChoice", m.params, m.playerId);
    };
    el.addEventListener("click", pickIt);
    // Card tiles are the controls of a mandatory prompt: keyboard-operable too.
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickIt(); } });
  });
  box.querySelectorAll(".choice-modal-btn").forEach(el => {
    el.addEventListener("click", () => {
      const m = otherPicks[Number(el.dataset.otherIdx)];
      if (m) executeMove("resolvePendingChoice", m.params, m.playerId);
    });
  });
  const filter = box.querySelector(".choice-modal-filter");
  if (filter) {
    filter.addEventListener("input", () => {
      const q = filter.value.trim().toLowerCase();
      box.querySelectorAll(".choice-modal-btn[data-other-idx]").forEach(b => {
        b.style.display = !q || b.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    });
  }
  overlay.classList.add("visible");
}

/**
 * Composite prompts — an order (rule 372 / 383.3.d / 386.2), a subset (rule
 * 355.11.b / 373) or an amount (Pay X): the player builds ONE answer here and
 * confirms it. When the engine enumerated that exact answer its variant is
 * sent verbatim; longer lists (only a few arrangements enumerated) send the
 * composed value, which the move validates server-side.
 */
function renderCompositeChoice(pending, box) {
  const picks = availableMoves.filter(m => m.moveId === "resolvePendingChoice");
  const me = picks[0]?.playerId ?? viewingPlayer;
  const key = JSON.stringify([pending.type, pending.sourceCardId, pending.items ?? pending.options ?? pending.cards ?? null, picks.length]);
  if (_compose.key !== key) _compose = { key, seq: [], set: [], x: null };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const send = (params) => {
    const exact = picks.find(m => Object.keys(params).every(k => same(m.params?.[k], params[k])));
    executeMove("resolvePendingChoice", exact ? exact.params : { playerId: me, ...params }, exact ? exact.playerId : me);
  };
  const title = pendingChoiceTitle(pending);
  let html = `<div class="chain-title">${esc(title)}</div>`;

  if (pending.type === "order" || pending.type === "order-cards") {
    const items = pending.type === "order"
      ? (pending.items || []).map(i => ({ key: i.key, label: i.label ?? promptName(i.cardId ?? i.key), cardId: i.cardId }))
      : (pending.cards || []).map(id => ({ key: id, label: promptName(id), cardId: id }));
    const seq = _compose.seq.filter(k => items.some(i => i.key === k));
    html += `<div class="chain-subtitle">Click the items in the order you want (${pending.type === "order-cards" ? "first = top of deck" : "first = applied / resolves first"}).</div>`;
    html += `<div class="choice-modal-btns choice-compose" data-compose="order">`;
    for (const it of items) {
      const pos = seq.indexOf(it.key);
      html += `<button class="choice-modal-btn choice-seq-item${pos >= 0 ? " chosen" : ""}" data-seq-key="${esc(it.key)}" ${pos >= 0 ? 'style="opacity:.55"' : ""}>${pos >= 0 ? `<b>${pos + 1}.</b> ` : ""}${esc(it.label)}</button>`;
    }
    html += `</div><div class="choice-modal-btns">`;
    html += `<button class="choice-modal-btn choice-compose-confirm" data-compose-confirm ${seq.length === items.length ? "" : "disabled style=\"opacity:.5\""}>Confirm order${seq.length ? ` (${seq.map(k => items.find(i => i.key === k)?.label).join(" → ")})` : ""}</button>`;
    if (seq.length) html += `<button class="choice-modal-btn" data-compose-reset>Reset</button>`;
    if (pending.type === "order" && pending.defaultable !== false) html += `<button class="choice-modal-btn" data-compose-default>Keep listed order</button>`;
    html += `</div>`;
    box.innerHTML = html;
    box.querySelectorAll("[data-seq-key]").forEach(el => el.addEventListener("click", () => {
      const k = el.dataset.seqKey;
      _compose.seq = _compose.seq.includes(k) ? _compose.seq.filter(x => x !== k) : [..._compose.seq, k];
      renderCompositeChoice(pending, box);
    }));
    box.querySelector("[data-compose-reset]")?.addEventListener("click", () => { _compose.seq = []; renderCompositeChoice(pending, box); });
    box.querySelector("[data-compose-default]")?.addEventListener("click", () => send({ orderedKeys: items.map(i => i.key) }));
    box.querySelector("[data-compose-confirm]")?.addEventListener("click", () => {
      if (seq.length !== items.length) return;
      send(pending.type === "order" ? { orderedKeys: seq } : { orderedCardIds: seq });
    });
    return;
  }

  if (pending.type === "pick-many") {
    const opts = (pending.options || []).map(o => ({ key: o.key, label: o.label ?? promptName(o.cardId ?? o.key), cardId: o.cardId }));
    const set = _compose.set.filter(k => opts.some(o => o.key === k));
    const min = pending.min ?? 0, max = pending.max ?? opts.length;
    const ok = set.length >= min && set.length <= max;
    html += `<div class="chain-subtitle">Tick ${min === max ? min : `${min} to ${max}`} — ${set.length} chosen</div>`;
    html += `<div class="choice-modal-btns choice-compose" data-compose="pick-many">`;
    for (const o of opts) {
      const on = set.includes(o.key);
      const full = !on && set.length >= max;
      html += `<button class="choice-modal-btn choice-check-item${on ? " chosen" : ""}" data-check-key="${esc(o.key)}" ${full ? 'disabled style="opacity:.4"' : ""}>${on ? "☑" : "☐"} ${esc(o.label)}</button>`;
    }
    html += `</div><div class="choice-modal-btns">`;
    html += `<button class="choice-modal-btn choice-compose-confirm" data-compose-confirm ${ok ? "" : 'disabled style="opacity:.5"'}>Done (${set.length})</button>`;
    if (min === 0) html += `<button class="choice-modal-btn" data-compose-none>None</button>`;
    html += `</div>`;
    box.innerHTML = html;
    box.querySelectorAll("[data-check-key]").forEach(el => el.addEventListener("click", () => {
      const k = el.dataset.checkKey;
      _compose.set = _compose.set.includes(k) ? _compose.set.filter(x => x !== k) : [..._compose.set, k];
      renderCompositeChoice(pending, box);
    }));
    box.querySelector("[data-compose-none]")?.addEventListener("click", () => send({ pickedKeys: [] }));
    box.querySelector("[data-compose-confirm]")?.addEventListener("click", () => { if (ok) send({ pickedKeys: opts.map(o => o.key).filter(k => set.includes(k)) }); });
    return;
  }

  // pay-x: a stepper over the enumerated amounts.
  const amounts = picks.map(m => m.params?.xAmount).filter(n => typeof n === "number").sort((a, b) => a - b);
  const lo = amounts[0] ?? 0, hi = amounts[amounts.length - 1] ?? 0;
  if (_compose.x == null || _compose.x < lo || _compose.x > hi) _compose.x = lo;
  html += `<div class="chain-subtitle">Choose how much to pay (${lo}–${hi})</div>`;
  html += `<div class="choice-modal-btns choice-compose" data-compose="pay-x" style="align-items:center;justify-content:center;">
    <button class="choice-modal-btn" data-x-step="-1" ${_compose.x <= lo ? 'disabled style="opacity:.4"' : ""}>−</button>
    <span class="choice-x-value" style="min-width:64px;text-align:center;font-size:20px;font-weight:700;color:#ffd070;">X = ${_compose.x}</span>
    <button class="choice-modal-btn" data-x-step="1" ${_compose.x >= hi ? 'disabled style="opacity:.4"' : ""}>+</button>
  </div><div class="choice-modal-btns"><button class="choice-modal-btn choice-compose-confirm" data-compose-confirm>Pay ${_compose.x}</button></div>`;
  box.innerHTML = html;
  box.querySelectorAll("[data-x-step]").forEach(el => el.addEventListener("click", () => {
    _compose.x = Math.max(lo, Math.min(hi, (_compose.x ?? lo) + Number(el.dataset.xStep)));
    renderCompositeChoice(pending, box);
  }));
  box.querySelector("[data-compose-confirm]")?.addEventListener("click", () => send({ xAmount: _compose.x }));
}

/**
 * Build a human label for one play-variant of a card. `describePlayVariantBase`
 * describes the COST; the wrapper adds the destination, which for a card whose
 * additional cost is mandatory (unl-166-219 Stalking Wolf) is the only thing
 * telling two otherwise identical paid variants apart.
 */
function describePlayVariant(m, card) {
  const out = describePlayVariantBase(m, card);
  const loc = m.params?.location;
  if (!loc || !m.params?.paidAdditionalCost) {
    return out;
  }
  const where =
    loc === "base" ? "to base" : `to ${getBattlefieldName(String(loc).replace(/^battlefield-/, ""))}`;
  return { label: `${out.label} ${where}`, detail: `${out.detail} — played ${where}` };
}

function describePlayVariantBase(m, card) {
  const baseCost = card?.energyCost ?? 0;
  // Rule ogn-193-298: location-only variants (base vs open battlefield) must
  // name their destination or they render as identical buttons.
  const loc = m.params?.location;
  const where = !loc || loc === "base"
    ? "to base"
    : `to ${getBattlefieldName(String(loc).replace(/^battlefield-/, ""))}`;
  if (!m.params?.paidAdditionalCost) {
    return { label: `Play ${where}`, detail: `${baseCost} energy` };
  }
  const spec = m.params.additionalCostSpec;
  // Rule ogn-231-298: the "kill any number" additional cost enumerates one
  // variant per subset (`sacrificeIds`), with `sacrificeId` set only for the
  // single-unit ones — name every victim or all multi-kill subsets render as
  // identical "Play + Accelerate" buttons.
  const sacIds = Array.isArray(m.params.sacrificeIds) && m.params.sacrificeIds.length
    ? m.params.sacrificeIds
    : (m.params.sacrificeId ? [m.params.sacrificeId] : null);
  // rule-id: ven-008-166 (rule 356.2.b) — "you may discard 1" enumerates one
  // variant per discardable card; name the card or every variant renders the same.
  if (m.params?.discardId) {
    const name = findCard(m.params.discardId)?.name ?? m.params.discardId;
    return {
      label: `Play + discard ${name}`,
      detail: `${baseCost} energy — discard ${name} as an additional cost`,
    };
  }
  if (sacIds) {
    const names = sacIds.map(id => findCard(id)?.name ?? id);
    const list = names.join(" + ");
    return {
      label: `Play + sacrifice ${list}`,
      detail: `${baseCost} energy — kill ${list} as an additional cost`,
    };
  }
  const parts = [];
  if (spec?.energy) parts.push(`${spec.energy} energy`);
  if (spec?.power?.length) parts.push(spec.power.join(" + "));
  if (spec?.xp) parts.push(`${spec.xp} XP`);
  const extra = parts.length ? parts.join(" + ") : "additional cost";
  // Rule unl-164-219: only the Accelerate cost makes the unit enter ready; an
  // XP (or other) additional cost is a different option and must not borrow
  // Accelerate's label or its "enters ready" rider.
  if (spec?.xp && !spec.energy && !spec.power?.length) {
    return {
      label: `Play + pay ${spec.xp} XP`,
      detail: `${baseCost} energy + ${spec.xp} XP as an additional cost`,
    };
  }
  // rule 805.2 / 717: only [Accelerate] makes the unit enter ready. The
  // enumerator emits the same `{paidAdditionalCost, additionalCostSpec}` shape
  // for a generic "you may pay N as an additional cost" (ven-101-166 Gust
  // Monk), so check the printed keyword before promising a ready entry.
  const text = card?.rulesText ?? "";
  const hasAccelerate = /\[\s*Accelerate\b/i.test(text)
    || (Array.isArray(card?.keywords)
      && card.keywords.some(k => String(k?.name ?? k).toLowerCase() === "accelerate"));
  if (hasAccelerate && (spec?.energy || spec?.power?.length)) {
    return {
      label: `Play + Accelerate`,
      detail: `${baseCost} + ${extra} — enters ready`,
    };
  }
  // sfd-079-221 (Bard): the exhaust-a-legend cost ships no spec at all.
  if (!parts.length && /exhaust\s+(your|my)\s+legend/i.test(text)) {
    return {
      label: `Play + exhaust legend`,
      detail: `${baseCost} energy — exhaust your legend as an additional cost`,
    };
  }
  return {
    label: parts.length ? `Play + pay ${extra}` : `Play + additional cost`,
    detail: parts.length
      ? `${baseCost} energy + ${extra} as an additional cost`
      : `${baseCost} energy + an additional cost`,
  };
}

/**
 * Open the Arena-style play-cost modal for a card that has ≥2 play variants
 * (base vs paidAdditionalCost / sacrifice).
 */
function openPlayCostModal(cardId) {
  // Rule ogn-193-298: match the action-panel grouping key exactly so a
  // cardId-less champion move doesn't leak into another card's modal. The
  // champion may be named by "__champion" (sidebar) or its real id (card click).
  const isChampion = cardId === "__champion" || findCardZone(cardId) === "championZone";
  const variants = availableMoves.filter(m =>
    // rule-id: ven-008-166 — spells and gear carry optional additional costs
    // too, so their variants must reach this modal instead of silently
    // defaulting to the unpaid play.
    isChampion
      ? m.moveId === "playFromChampionZone"
      : (m.moveId === "playUnit" || m.moveId === "playSpell" || m.moveId === "playGear") &&
        m.params?.cardId === cardId,
  );
  // rule 723 (Hidden): "Hide at <battlefield>" is another way to use the card — listed after the plays.
  const hides = isChampion ? [] : availableMoves.filter(m => m.moveId === "hideCard" && m.params?.cardId === cardId);
  if (variants.length === 0 && hides.length === 0) return;
  const card = isChampion
    ? (typeof zoneForPlayer === "function" ? zoneForPlayer("championZone", viewingPlayer)[0] : null) ?? findCard(cardId)
    : findCard(cardId);
  const { overlay, box } = ensureChoiceOverlay();
  overlay.dataset.mode = "playCost";
  overlay.classList.remove("targeting");
  if (typeof closeZoom === "function") closeZoom();
  if (typeof hidePreview === "function") hidePreview();

  const imgId = (card?.definitionId ?? cardId).replace(/^player-[12]-(?:main|rune)-\d+-/, "");
  let html = `<div class="chain-title">Play ${esc(card?.name ?? cardId)}</div>`;
  html += `<div class="chain-subtitle">Choose how to play</div>`;
  html += `<div class="choice-modal-cards"><img class="choice-modal-card" style="margin:0" src="/card-image/${esc(imgId)}" alt=""></div>`;
  html += `<div class="choice-modal-btns">`;
  for (let i = 0; i < variants.length; i++) {
    const { label, detail } = describePlayVariant(variants[i], card);
    html += `<button class="choice-modal-btn" data-variant-idx="${i}">
      ${esc(label)}<small>${esc(detail)}</small>
    </button>`;
  }
  for (let i = 0; i < hides.length; i++) {
    const where = getBattlefieldName(String(hides[i].params?.battlefieldId ?? ""));
    html += `<button class="choice-modal-btn" data-hide-idx="${i}">
      ${esc(`Hide at ${where}`)}<small>${esc("facedown — pay [rainbow] now, reveal later for 0")}</small>
    </button>`;
  }
  html += `</div>`;
  html += `<button class="choice-modal-cancel">Cancel</button>`;

  box.innerHTML = html;
  box.querySelectorAll(".choice-modal-btn[data-variant-idx]").forEach(el => {
    el.addEventListener("click", () => {
      const m = variants[Number(el.dataset.variantIdx)];
      closeChoiceModal();
      if (m) executeMove(m.moveId, m.params, m.playerId);
    });
  });
  box.querySelectorAll(".choice-modal-btn[data-hide-idx]").forEach(el => {
    el.addEventListener("click", () => {
      const m = hides[Number(el.dataset.hideIdx)];
      closeChoiceModal();
      if (m) executeMove(m.moveId, m.params, m.playerId);
    });
  });
  box.querySelector(".choice-modal-cancel")?.addEventListener("click", () => {
    closeChoiceModal();
    if (typeof cancelInteraction === "function" && interaction.mode !== "idle") cancelInteraction();
  });
  overlay.classList.add("visible");
}

// Chain / Showdown Overlay

function renderChainOverlay() {
  const overlay = document.getElementById("chainOverlay");
  const box = document.getElementById("chainBox");
  if (!overlay || !box) return;

  const interaction_state = gameState?.interaction;
  const chain = interaction_state?.chain;

  // W9: showdown rendering has moved to the per-battlefield inline panel
  // (see showdown.js + renderBattlefields). The chain overlay now only
  // reacts to the spell chain itself.
  if (!chain || !chain.active) {
    overlay.classList.remove("visible");
    box.classList.remove("showdown-active");
    // [rule:chain-overlay-stale-buttons] Clear the box so a stale Pass/Resolve
    // button wired to a closed chain doesn't linger in the hidden overlay.
    box.innerHTML = "";
    return;
  }

  if (!overlay.classList.contains("visible") && typeof closeZoom === "function") closeZoom();
  overlay.classList.add("visible");
  box.classList.remove("showdown-active");

  const isMyPriority = chain?.activePlayer === viewingPlayer;
  const hasChain = chain?.active && chain.items?.length > 0;

  // [rule:no-console-errors] Legend/champion/battlefield instance ids are
  // `${pid}-legend-${defId}` etc. (no index) — strip those too so
  // /card-image/ gets a bare defId instead of 404ing.
  const CHAIN_ID_PREFIX_RE = /^player-[12]-(?:(?:main|rune)-\d+|legend|champion|bf)-/;

  // Resolve card name helper
  function resolveChainCard(cardId) {
    if (!gameState?.zones) return cardId;
    for (const zoneCards of Object.values(gameState.zones)) {
      const found = zoneCards.find(c => c.id === cardId);
      if (found) return found.name || cardId;
    }
    const stripped = cardId.replace(CHAIN_ID_PREFIX_RE, "");
    for (const zoneCards of Object.values(gameState.zones)) {
      const found = zoneCards.find(c => c.definitionId === stripped);
      if (found) return found.name || cardId;
    }
    return cardId;
  }

  let html = "";

  // ---- Chain active ----
  // W9: showdown-specific DOM was removed from this overlay. Per-battlefield
  // inline panels (showdown.js) own all showdown UI now.
  if (hasChain) {
    html += `<div class="chain-title">The Chain</div>`;
    html += `<div class="chain-subtitle">Spells and abilities resolving — play reactions or pass</div>`;

    html += `<div class="chain-stack">`;
    const items = [...(chain.items || [])].reverse();
    items.forEach((item, i) => {
      const isTop = i === 0;
      const cardName = resolveChainCard(item.cardId);
      const controller = pName(item.controller);
      const imgId = item.cardId.replace(CHAIN_ID_PREFIX_RE, "");
      // rule 355.5 / 355.8: what the item will do — its chosen targets and, for a
      // "Choose one —" effect whose mode is already locked, that mode's text.
      const targetNames = (Array.isArray(item.targets) ? item.targets : []).map(t => resolveChainCard(String(t)));
      const eff = item.effect && typeof item.effect === "object" ? item.effect : null;
      const modeIdxs = Array.isArray(item.chosenModes) ? item.chosenModes : (Number.isInteger(item.mode) ? [item.mode] : (Number.isInteger(eff?.mode) ? [eff.mode] : []));
      const modeText = eff?.type === "choice" && Array.isArray(eff.options)
        ? (modeIdxs.length
          ? modeIdxs.map(ix => modeOptionText({ effect: eff }, ix)).join(" + ")
          : "mode chosen on resolution")
        : (eff && typeof humanizeEffect === "function" ? humanizeEffect(eff) : "");
      const what = [modeText, targetNames.length ? `→ ${targetNames.join(", ")}` : ""].filter(Boolean).join(" ");
      html += `
        <div class="chain-item ${isTop ? "top-item" : ""}">
          <div class="ci-order">${isTop ? "Next" : items.length - i}</div>
          <img class="ci-img" src="/card-image/${esc(imgId)}" alt="" onerror="this.style.display='none'">
          <div class="ci-info">
            <div class="ci-name">${esc(cardName)}</div>
            <div class="ci-detail">${esc(controller)} — ${esc(item.triggered ? "trigger" : item.type)}${item.countered ? " (Countered)" : ""}</div>
            ${what ? `<div class="ci-detail ci-what" data-chain-what>${esc(what)}</div>` : ""}
          </div>
        </div>
      `;
    });
    html += `</div>`;

    html += `<div class="chain-priority">`;
    if (isMyPriority) {
      html += `<span class="priority-player">${esc(pName(chain.activePlayer))} has Priority</span> — play a reaction spell or pass`;
    } else if (chain.activePlayer) {
      const name = pName(chain.activePlayer);
      html += `<span class="priority-waiting">${esc(name)} has Priority</span> — waiting...`;
    } else {
      html += `All players passed — resolving top item`;
    }
    html += `</div>`;
  }

  // ---- Action buttons ----
  // W9: showdown-focus passing is handled by the per-battlefield inline
  // panel; this block now only offers chain-priority passing / resolving.
  html += `<div class="chain-actions">`;
  if (isMyPriority) {
    const passMove = availableMoves.find(m => m.moveId === "passChainPriority");
    if (passMove) {
      const passParams = JSON.stringify(passMove.params).replace(/'/g, "\\'");
      html += `<button class="chain-pass-btn" onclick='executeMove("${passMove.moveId}", ${passParams}, "${passMove.playerId}")'>Pass (Space)</button>`;
      html += `<div class="chain-hint">Press Space to pass</div>`;
    }

    const resolveMove = availableMoves.find(m => m.moveId === "resolveChain");
    if (resolveMove) {
      const resolveParams = JSON.stringify(resolveMove.params).replace(/'/g, "\\'");
      html += `<button class="chain-resolve-btn" onclick='executeMove("${resolveMove.moveId}", ${resolveParams}, "${resolveMove.playerId}")'>Resolve</button>`;
    }
  }
  html += `</div>`;

  box.innerHTML = html;
}
