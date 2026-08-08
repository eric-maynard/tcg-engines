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
  // Card picks are mirrored as board glows (applyPendingChoiceHighlights); let
  // clicks reach the board by making the backdrop pass-through for those prompts.
  const hasBoardPicks = pending.type === "choose-target" || availableMoves.some(m =>
    m.moveId === "resolvePendingChoice" && m.params?.pickedCardId &&
    document.querySelector(`#game-scale-wrapper [data-card-id="${CSS.escape(m.params.pickedCardId)}"]`));
  overlay.classList.toggle("targeting", !!hasBoardPicks);
  if (typeof closeZoom === "function") closeZoom();

  // Rule ogn-067-298: opt-in ("you may …") triggers carry only {accept} —
  // title names the source card and buttons read Yes/No instead of "—".
  const optInSrc = pending.type === "opt-in" ? findCard(pending.sourceCardId) : null;
  // Rule 583 (sfd-119-221): a "you may pay X to …" trigger carries its cost on
  // the chain item as `optInCost` — name it, so Yes is never a blind click.
  const optInCostText = pending.type === "opt-in"
    ? describeOptInCost(pending.resolved?.optInCost) : null;
  const title = pending.type === "opt-in"
    ? `Use ${optInSrc?.name ?? "optional"} ability?${optInCostText ? ` (${optInCostText})` : ""}`
    : pending.onPicked === "discard" ? "Discard a card"
    : pending.onPicked === "banish" ? "Banish a card"
    : pending.onPicked === "recycle" ? "Recycle a card"
    : pending.onPicked === "draw" ? "Choose a card to draw"
    : pending.onPicked === "play" ? "Choose a card to play"
    : pending.type === "name-card" ? "Name a card"
    : pending.type === "choose-destination" ? "Choose a destination"
    // Rule ogn-256-298: "any number of" multi-pick — picks accumulate until Done.
    : pending.type === "choose-target" && pending.anyNumber
      ? `Choose any number of targets${pending.picked?.length ? ` (${pending.picked.length} chosen)` : ""}`
    // Rule 355.14 (ogn-041-298): fixed-total split damage — one button per legal split.
    : pending.type === "choose-target" && pending.assign && typeof pending.total === "number"
      ? `Split ${pending.total} damage`
    // Rule 355.5: a play-time target prompt may name what is being chosen.
    : pending.type === "choose-target" ? (pending.prompt ?? `Choose a target${findCard(pending.sourceCardId)?.name ? ` for ${findCard(pending.sourceCardId).name}` : ""}`)
    : pending.type === "choose-mode" ? `${findCard(pending.sourceCardId)?.name ?? "Choose one"} — choose one`  // Rule 355.3 / sfd-091-221
    // Rules 372/373/383.3.d/355.11.b: generic order / pick-many prompts carry their own prompt text.
    : (pending.type === "order" || pending.type === "pick-many") ? (pending.prompt ?? (pending.type === "order" ? "Choose an order" : "Choose"))
    : "Choose a card";

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
  ];

  if (shownIds.length) {
    html += `<div class="choice-modal-cards">`;
    for (const cid of shownIds) {
      const card = findCard(cid);
      const imgId = (card?.definitionId ?? cid).replace(/^player-[12]-(?:main|rune)-\d+-/, "");
      const idx = pickIdxOf.get(cid);
      const attrs = idx == null
        ? `class="choice-modal-card choice-modal-card-ineligible" style="opacity:.4;cursor:default"`
        : `class="choice-modal-card" data-pick-idx="${idx}"`;
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
    html += `<div class="choice-modal-btns">`;
    for (let i = 0; i < otherPicks.length; i++) {
      // Rule ogn-102-298: humanize destination zone ids ("base" /
      // "battlefield-<id>") the same way describePlayVariant does.
      const zid = otherPicks[i].params?.pickedZoneId;
      const accept = otherPicks[i].params?.accept;
      // Rule sfd-091-221: choose-mode buttons name the mode ("draw 1" / "buff me").
      const modeIdx = otherPicks[i].params?.pickedMode;
      const modeOpt = pending.type === "choose-mode" && modeIdx != null ? pending.effect?.options?.[modeIdx] : null;
      // Rule 355.14 (ogn-041-298): split-damage allocation → "Unit 2 · Other 3" / "No targets".
      const alloc = otherPicks[i].params?.allocation;
      const allocLabel = alloc && typeof alloc === "object"
        ? (Object.keys(alloc).length
          ? Object.entries(alloc).map(([cid, n]) => `${findCard(cid)?.name ?? cid} ${n}`).join(" · ")
          : "No targets")
        : null;
      const label = allocLabel != null
        ? allocLabel
        : modeOpt
        // Rule 355.3: printed bullet (server `optionLabels` / parser `label`), never a raw effect id.
        ? modeOptionText(pending, modeIdx)
        : typeof accept === "boolean"
        // Rule ogn-067-298 / ogn-256-298 / 355.13: an optional reveal-and-pick
        // is declined AFTER the hand is revealed, so "Decline" reads better
        // than "No" next to the revealed cards.
        ? (pending.type === "choose-target" && pending.anyNumber ? "Done"
          : accept ? "Yes"
          : pending.type === "reveal-and-pick" ? "Decline" : "No")
        : zid != null
        // Rule sfd-109-221 (356.1.b.3): a pending play may offer the optional additional cost.
        ? (zid === "base" ? "Base" : getBattlefieldName(String(zid).replace(/^battlefield-/, ""))) + (otherPicks[i].params?.paidAdditionalCost ? " (pay additional cost)" : "")
        // Rules 372/373/355.11.b: order / pick-many variants ship a display `label`.
        : (otherPicks[i].params?.pickedName ?? otherPicks[i].params?.label ?? "—");
      html += `<button class="choice-modal-btn" data-other-idx="${i}">${esc(String(label))}</button>`;
    }
    html += `</div>`;
  }

  box.innerHTML = html;
  // Attach handlers via delegation instead of inline onclick — avoids
  // interpolating server-derived params into an HTML attribute.
  box.querySelectorAll(".choice-modal-card").forEach(el => {
    el.addEventListener("click", () => {
      const m = cardPicks[Number(el.dataset.pickIdx)];
      if (m) executeMove("resolvePendingChoice", m.params, m.playerId);
    });
  });
  box.querySelectorAll(".choice-modal-btn").forEach(el => {
    el.addEventListener("click", () => {
      const m = otherPicks[Number(el.dataset.otherIdx)];
      if (m) executeMove("resolvePendingChoice", m.params, m.playerId);
    });
  });
  overlay.classList.add("visible");
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
  // cardId-less champion move doesn't leak into another card's modal.
  const variants = availableMoves.filter(m =>
    // rule-id: ven-008-166 — spells and gear carry optional additional costs
    // too, so their variants must reach this modal instead of silently
    // defaulting to the unpaid play.
    (m.moveId === "playUnit" ||
      m.moveId === "playFromChampionZone" ||
      m.moveId === "playSpell" ||
      m.moveId === "playGear") &&
    (m.params?.cardId ?? "__champion") === cardId,
  );
  if (variants.length === 0) return;
  const card = findCard(cardId);
  const { overlay, box } = ensureChoiceOverlay();
  overlay.dataset.mode = "playCost";
  overlay.classList.remove("targeting");
  if (typeof closeZoom === "function") closeZoom();

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
  box.querySelector(".choice-modal-cancel")?.addEventListener("click", closeChoiceModal);
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
      html += `
        <div class="chain-item ${isTop ? "top-item" : ""}">
          <div class="ci-order">${isTop ? "Next" : items.length - i}</div>
          <img class="ci-img" src="/card-image/${esc(imgId)}" alt="" onerror="this.style.display='none'">
          <div class="ci-info">
            <div class="ci-name">${esc(cardName)}</div>
            <div class="ci-detail">${esc(controller)} — ${esc(item.type)}${item.countered ? " (Countered)" : ""}</div>
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
