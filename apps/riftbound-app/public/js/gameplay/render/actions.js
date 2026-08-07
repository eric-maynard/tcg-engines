// render/actions.js — Action panel (renderActions), move descriptions, and
// cost-payment re-evaluation. Classic script: everything is global.
// Split out of renderer.js.

/** Resolve a param value: if it's a card ID, return the card name */
function resolveParamValue(value) {
  if (typeof value !== "string") return value;
  const card = findCard(value);
  if (card && card.name) return card.name;
  return value.replace(/^player-[12]-/, "");
}

/** Fallback param formatter: show only resolved values without raw key names */
function formatParamsFallback(params) {
  if (!params) return "";
  const vals = Object.entries(params)
    .filter(([k]) => k !== "playerId" && k !== "method")
    .map(([, v]) => resolveParamValue(v))
    .filter(v => v != null && v !== "");
  return vals.join(", ");
}

/** Format a move's params into a natural-language description */
function formatMoveDescription(moveId, params) {
  if (!params) return null;
  const r = (v) => Array.isArray(v) ? v.map(resolveParamValue).join(", ") : resolveParamValue(v);
  const bf = (v) => typeof v === "string" ? getBattlefieldName(v) : String(v ?? "");
  switch (moveId) {
    case "playUnit": return `${r(params.cardId)} to ${params.location ?? "base"}`;
    // [rule:sfd-122-221 Repeat] repeatCount / paidAdditionalCost variants must be distinguishable.
    case "playSpell": return `${r(params.cardId)}${params.repeatCount ? ` (Repeat ×${params.repeatCount})` : ""}${params.paidAdditionalCost ? " (+ additional cost)" : ""}${params.targets?.length ? " → " + r(params.targets) : ""}`;
    case "playGear": return `${r(params.cardId)}${params.chosenTargetId ? " → " + r(params.chosenTargetId) : ""}`;
    case "exhaustRune": return `${r(params.runeId)}`;
    case "recycleRune": return `${r(params.runeId)}${params.domain ? " for " + params.domain : ""}`;
    case "standardMove": return `${r(params.unitIds)} to ${bf(params.destination)}`;
    case "gankingMove": return `${r(params.unitId)} to ${bf(params.toBattlefield)}`;
    case "assignAttacker": return `${r(params.unitId)}`;
    case "assignDefender": return `${r(params.unitId)}`;
    case "contestBattlefield": return `${bf(params.battlefieldId)}`;
    case "conquerBattlefield": return `${bf(params.battlefieldId)}`;
    case "recallUnit": return `${r(params.unitId)}`;
    case "hideCard": return `at ${bf(params.battlefieldId)}`;
    case "scorePoint": return `${bf(params.battlefieldId)}`;
    // Inherited abilities (Heimerdinger) share cardId — name the source card and
    // ability slot so the options are distinguishable.
    case "activateAbility": {
      const from = params.sourceCardId && params.sourceCardId !== params.cardId
        ? ` — ${r(params.sourceCardId)}${Number.isInteger(params.abilityIndex) ? ` ability ${params.abilityIndex + 1}` : ""}`
        : (Number.isInteger(params.abilityIndex) && params.abilityIndex > 0 ? ` — ability ${params.abilityIndex + 1}` : "");
      return `${r(params.cardId)}${from}${params.targets?.length ? " → " + r(params.targets) : ""}`;
    }
    case "resolveFullCombat": return `${bf(params.battlefieldId)}`;
    case "passChainPriority": return null;
    case "passShowdownFocus": return null;
    case "advancePhase": return null;
    case "endTurn": return null;
    case "channelRunes": return null;
    case "drawCard": return null;
    case "readyAll": return null;
    case "emptyRunePool": return null;
    case "concede": return null;
    case "pass": return null;
    default: return null;
  }
}

/** Re-evaluate cost payment mode after a state update */
function reevaluateCostPayment() {
  const pendingId = interaction.pendingCardId;
  const pendingCost = interaction.pendingCardCost;
  if (!pendingId || !pendingCost) {
    resetInteractionSilent();
    render();
    return;
  }

  // Check if the pending card is still in hand
  const card = findCard(pendingId);
  const zone = findCardZone(pendingId);
  if (!card || zone !== "hand") {
    // Card is gone, cancel
    resetInteractionSilent();
    render();
    return;
  }

  const pool = gameState?.runePools?.[viewingPlayer];
  const currentEnergy = pool?.energy ?? 0;

  // Check if play moves are now available (server says card is playable)
  const playMoves = availableMoves.filter(m =>
    (m.moveId === "playUnit" || m.moveId === "playSpell" || m.moveId === "playGear") &&
    m.params?.cardId === pendingId
  );

  if (playMoves.length > 0) {
    // Card is now affordable — transition to cardSelected with play moves
    interaction = {
      mode: "cardSelected",
      sourceCardId: pendingId,
      sourceZone: "hand",
      action: "playCard",
      validTargets: ["player-base"],
      matchingMoves: playMoves,
      pendingCardId: null,
      pendingCardCost: 0,
    };
    selectedCard = pendingId;
    clearRuneTappableHighlights();
    applyValidTargetHighlights();
    showCostPaymentActionBar(card, currentEnergy);
    return;
  }

  // Still can't afford — check if there are still rune moves available
  const runeExhaustMoves = availableMoves.filter(m =>
    m.moveId === "exhaustRune" || m.moveId === "recycleRune"
  );

  if (runeExhaustMoves.length === 0 && currentEnergy < pendingCost) {
    // No more runes to exhaust and still can't afford
    showToast(`Not enough energy (${currentEnergy}/${pendingCost}) — no more runes available`);
    resetInteractionSilent();
    render();
    return;
  }

  // Stay in costPayment mode — re-apply highlights and update action bar
  applyRuneTappableHighlights();
  showCostPaymentActionBar(card, currentEnergy);
}

function renderActions() {
  const list = document.getElementById("actionsList");
  if (!availableMoves || availableMoves.length === 0) {
    list.innerHTML = '<div style="color:#6a6288; font-size:11px; padding:4px;">No moves available</div>';
    return;
  }

  const MOVE_LABELS = {
    advancePhase: "Advance Phase",
    endTurn: "End Turn",
    pass: "Pass",
    channelRunes: "Channel Runes",
    drawCard: "Draw Card",
    readyAll: "Ready All",
    emptyRunePool: "Empty Rune Pool",
    playUnit: "Play Unit",
    playSpell: "Play Spell",
    playGear: "Play Gear",
    standardMove: "Move Unit",
    gankingMove: "Ganking Move",
    recallUnit: "Recall Unit",
    exhaustRune: "Exhaust Rune",
    recycleRune: "Recycle Rune",
    contestBattlefield: "Contest Battlefield",
    conquerBattlefield: "Conquer Battlefield",
    scorePoint: "Score Point",
    hideCard: "Hide Card",
    revealHidden: "Reveal Hidden",
    addResources: "Add Resources",
    spendResources: "Spend Resources",
    concede: "Concede",
    passChainPriority: "Pass Priority",
    passShowdownFocus: "Pass Focus",
    resolveChain: "Resolve Chain",
    startShowdown: "Start Showdown",
    endShowdown: "End Showdown",
    activateAbility: "Activate Ability",
    resolveFullCombat: "Resolve Combat",
  };

  // Categorize moves into sections
  const sections = {
    turn: { label: "Turn Actions", moveIds: ["advancePhase", "endTurn", "channelRunes", "drawCard", "readyAll", "emptyRunePool"], moves: [] },
    play: { label: "Play Cards", moveIds: ["playUnit", "playSpell", "playGear"], moves: [] },
    movement: { label: "Movement", moveIds: ["standardMove", "gankingMove", "recallUnit"], moves: [] },
    runes: { label: "Rune Actions", moveIds: ["exhaustRune", "recycleRune"], moves: [] },
    battlefield: { label: "Battlefield", moveIds: ["contestBattlefield", "conquerBattlefield", "scorePoint"], moves: [] },
    other: { label: "Other", moveIds: [], moves: [] },
  };

  for (const move of availableMoves) {
    let placed = false;
    for (const section of Object.values(sections)) {
      if (section.moveIds.includes(move.moveId)) {
        section.moves.push(move);
        placed = true;
        break;
      }
    }
    if (!placed) sections.other.moves.push(move);
  }

  let html = "";
  // Move groups whose variants differ only by target; the button enters
  // targeting mode (interactions.js) instead of executing a variant directly.
  const targetPlayGroups = [];
  const TARGETABLE_MOVES = ["playSpell", "playGear", "playUnit", "activateAbility"];

  // Pending choice (discard / pick-from-revealed / choose-target) — the engine
  // blocks every other move until this is answered, so surface it as a modal
  // panel at the top of the action list rather than burying it under "Other".
  const pending = gameState?.pendingChoice;
  if (pending) {
    const mine = (pending.prompter ?? pending.playerId) === viewingPlayer;
    // Rule ogn-067-298: opt-in ("you may …") triggers get a Yes/No prompt.
    const verb = pending.type === "opt-in"
      ? `Decide: use ${findCard(pending.sourceCardId)?.name ?? "optional"} ability`
      : pending.onPicked === "discard" ? "Discard a card"
      : pending.onPicked === "banish" ? "Banish a card"
      : pending.onPicked === "recycle" ? "Recycle a card"
      : pending.onPicked === "play" ? "Choose a card to play"
      : pending.type === "choose-destination" ? "Choose a destination"
      : "Choose a card";
    html += `<div class="action-section-title" style="background:#3a2a4a;color:#ffd070;padding:6px;border-radius:3px;">
      ${mine ? "⚠ " + esc(verb) : "Waiting for opponent to " + esc(verb.toLowerCase())}
    </div>`;
    // rule-729 (ogn-174-298): reveal-and-pick from a hidden zone (deck/hand)
    // must show the revealed card(s) so the prompter can see what they are
    // choosing between — the resolvePendingChoice buttons alone only carry
    // the name text.
    if (mine && Array.isArray(pending.revealed) && pending.revealed.length) {
      html += `<div class="pending-choice visible" data-pending-choice style="display:flex;gap:4px;flex-wrap:wrap;padding:4px 0;">`;
      for (const rid of pending.revealed) {
        const rc = findCard(rid);
        const imgId = rc?.definitionId ?? rid;
        html += `<img class="card-img" src="/card-image/${esc(imgId)}" alt="${esc(rc?.name ?? rid)}"
          title="${esc(rc?.name ?? rid)}" style="width:90px;border-radius:4px;">`;
      }
      html += `</div>`;
    }
    if (mine) {
      const picks = availableMoves.filter(m => m.moveId === "resolvePendingChoice");
      for (const m of picks) {
        const cid = m.params?.pickedCardId ?? m.params?.pickedZoneId ?? m.params?.pickedName;
        const card = typeof cid === "string" ? findCard(cid) : null;
        const accept = m.params?.accept;
        const zid = m.params?.pickedZoneId;
        // Rule ogn-155-298: choose-mode picks carry only pickedMode — name the
        // mode from pending.effect.options like the choice modal does.
        const modeIdx = m.params?.pickedMode;
        const modeOpt = pending.type === "choose-mode" && modeIdx != null ? pending.effect?.options?.[modeIdx] : null;
        const label = modeOpt
          ? (modeOpt.label ?? modeOpt.text ?? modeOpt.effect?.text ?? `${modeOpt.effect?.type ?? "mode"}${modeOpt.effect?.amount != null ? ` ${modeOpt.effect.amount}` : ""}`)
          : typeof accept === "boolean" ? (accept ? "Yes" : "No")  // Rule ogn-067-298
          // Rule unl-144-219: humanize destination zone ids like the choice modal does.
          : (!m.params?.pickedCardId && zid != null)
          // Rule sfd-109-221 (356.1.b.3): a pending play may offer the optional additional cost.
          ? (zid === "base" ? "Base" : getBattlefieldName(String(zid).replace(/^battlefield-/, ""))) + (m.params?.paidAdditionalCost ? " (pay additional cost)" : "")
          : (card?.name ?? String(cid));
        html += `<button class="action-btn highlighted"
          onclick='executeMove("resolvePendingChoice", ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})'>
          ${esc(label)}
        </button>`;
      }
    }
  }

  for (const section of Object.values(sections)) {
    if (section.moves.length === 0) continue;

    html += `<div class="action-section-title">${esc(section.label)}</div>`;

    // Group moves within section by moveId
    const grouped = {};
    for (const move of section.moves) {
      if (!grouped[move.moveId]) grouped[move.moveId] = [];
      grouped[move.moveId].push(move);
    }

    for (const [moveId, moves] of Object.entries(grouped)) {
      const label = MOVE_LABELS[moveId] || moveId;
      const isPrimary = ["advancePhase", "endTurn", "channelRunes", "drawCard", "readyAll"].includes(moveId);

      // Check if any of these moves relate to the currently selected card
      const isHighlighted = interaction.sourceCardId &&
        moves.some(m =>
          m.params?.cardId === interaction.sourceCardId ||
          m.params?.unitIds?.includes(interaction.sourceCardId) ||
          m.params?.unitId === interaction.sourceCardId
        );

      if (TARGETABLE_MOVES.includes(moveId) && typeof moveTargetId === "function" && moves.some(m => moveTargetId(m))) {
        // Per-target variants: one button per source card (+ability) that
        // enters targeting mode — never a silent first-target pick.
        const groups = {};
        for (const m of moves) {
          const key = `${m.params?.cardId ?? ""}#${m.params?.abilityIndex ?? ""}#${m.params?.sourceCardId ?? ""}`;
          (groups[key] ??= []).push(m);
        }
        for (const variants of Object.values(groups)) {
          const cid = variants[0].params?.cardId;
          const srcId = variants[0].params?.sourceCardId;
          const baseName = findCard(cid)?.name ?? cid ?? label;
          const name = srcId && srcId !== cid
            ? `${baseName} — ${findCard(srcId)?.name ?? srcId}`
            : baseName;
          const targetIds = [...new Set(variants.map(moveTargetId).filter(Boolean))];
          const detail = targetIds.length
            ? `${name} — ${targetIds.length} target${targetIds.length === 1 ? "" : "s"}…`
            : name;
          const highlighted = interaction.sourceCardId === cid;
          html += `
            <button class="action-btn ${highlighted ? "highlighted" : ""}"
                    data-target-play="${targetPlayGroups.length}">
              ${esc(label)}
              <div class="action-detail">${esc(detail)}</div>
            </button>`;
          targetPlayGroups.push({ moves: variants, sourceCardId: cid });
        }
      } else if (moves.length === 1) {
        const m = moves[0];
        const paramStr = formatMoveDescription(moveId, m.params) || formatParamsFallback(m.params);
        const onclick = `executeMove(${JSON.stringify(moveId)}, ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})`;

        html += `
          <button class="action-btn ${isPrimary ? "primary" : ""} ${isHighlighted ? "highlighted" : ""}"
                  onclick='${onclick}'>
            ${esc(label)}
            ${paramStr ? `<div class="action-detail">${esc(paramStr)}</div>` : ""}
          </button>
        `;
      } else if (moveId === "playUnit" || moveId === "playFromChampionZone") {
        // Group by cardId — a card with ≥2 variants (base vs Accelerate /
        // sacrifice) opens the play-cost choice modal instead of listing
        // near-identical sub-buttons.
        const byCard = {};
        for (const m of moves) {
          const key = m.params?.cardId ?? "__champion";
          (byCard[key] ??= []).push(m);
        }
        for (const [cid, variants] of Object.entries(byCard)) {
          const card = cid === "__champion" ? null : findCard(cid);
          const name = card?.name ?? (cid === "__champion" ? "Champion" : cid);
          const highlighted = interaction.sourceCardId === cid;
          if (variants.length === 1) {
            const m = variants[0];
            const paramStr = formatMoveDescription(moveId, m.params) || formatParamsFallback(m.params);
            html += `
              <button class="action-btn ${highlighted ? "highlighted" : ""}"
                      onclick='executeMove(${JSON.stringify(moveId)}, ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})'>
                ${esc(label)}
                ${paramStr ? `<div class="action-detail">${esc(paramStr)}</div>` : ""}
              </button>`;
          } else {
            html += `
              <button class="action-btn ${highlighted ? "highlighted" : ""}"
                      data-play-cost-card="${esc(cid)}">
                Play ${esc(name)}
                <div class="action-detail">${variants.length} play options…</div>
              </button>`;
          }
        }
      } else if (moveId === "exhaustRune" || moveId === "recycleRune") {
        // Group rune moves by domain so we don't list 11+ individual runes.
        // [rule:ui-recycle-rune-ready-split] For recycleRune, a ready rune and an
        // exhausted rune of the same domain are NOT interchangeable (recycling the
        // ready one forfeits its energy) — split groups by exhausted state and list
        // exhausted runes first so the default click never burns a ready rune.
        const isExh = (m) => findCard(m.params?.runeId)?.meta?.exhausted === true;
        const splitByState = moveId === "recycleRune";
        // [rule:ui-recycle-rune-ready-autotap] Recycling a ready rune from the panel
        // routes through quickRecycleRune so it auto-taps for +1 energy first, same
        // as the right-click path — recycling it ready is strictly worse.
        const runeClick = (m) =>
          splitByState && !isExh(m) && typeof quickRecycleRune === "function"
            ? `quickRecycleRune(${JSON.stringify(m.params?.runeId)}, this)`
            : `executeMove(${JSON.stringify(moveId)}, ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})`;
        const byDomain = {};
        for (const m of moves) {
          const card = findCard(m.params?.runeId);
          const domain = card?.domain || card?.meta?.domain || "unknown";
          const d = Array.isArray(domain) ? domain[0] : domain;
          const key = splitByState ? `${d}|${isExh(m) ? "exhausted" : "ready"}` : d;
          if (!byDomain[key]) byDomain[key] = [];
          byDomain[key].push(m);
        }
        const domainEntries = Object.entries(byDomain).sort(
          ([a], [b]) => Number(a.endsWith("|ready")) - Number(b.endsWith("|ready")),
        );
        if (domainEntries.length === 1 && domainEntries[0][1].length === 1) {
          // Only one rune — render as single button
          const m = domainEntries[0][1][0];
          const paramStr = formatMoveDescription(moveId, m.params) || formatParamsFallback(m.params);
          html += `
            <button class="action-btn ${isHighlighted ? "highlighted" : ""}"
                    onclick='${runeClick(m)}'>
              ${esc(label)}
              ${paramStr ? `<div class="action-detail">${esc(paramStr)}</div>` : ""}
            </button>
          `;
        } else {
          // Multiple runes — show grouped by domain
          const DOMAIN_DISPLAY = { fury: "Fury", calm: "Calm", mind: "Mind", body: "Body", chaos: "Chaos", order: "Order" };
          const isExpanded = isHighlighted;
          html += `
            <button class="action-btn ${isHighlighted ? "highlighted" : ""}"
                    onclick="toggleMoveGroup('${moveId}')">
              ${esc(label)} (${moves.length} available)
            </button>
            <div id="move-group-${moveId}" class="${isExpanded ? "" : "hidden"}" style="padding-left:8px; display:flex; flex-direction:column; gap:2px;">
              ${domainEntries.map(([key, domMoves]) => {
                const [domain, state] = key.split("|");
                const domLabel = `${DOMAIN_DISPLAY[domain] || domain} Rune${state ? ` (${state})` : ""}`;
                if (domMoves.length === 1) {
                  const m = domMoves[0];
                  return `
                    <button class="action-btn"
                            onclick='${runeClick(m)}'>
                      ${esc(domLabel)}
                    </button>
                  `;
                }
                // Multiple interchangeable runes (same domain + state) — show count, click uses first
                const m = domMoves[0];
                return `
                  <button class="action-btn"
                          onclick='${runeClick(m)}'>
                    ${esc(domLabel)} (${domMoves.length} available)
                  </button>
                `;
              }).join("")}
            </div>
          `;
        }
      } else {
        // Collapsible group
        const isExpanded = isHighlighted; // auto-expand if highlighted
        html += `
          <button class="action-btn ${isPrimary ? "primary" : ""} ${isHighlighted ? "highlighted" : ""}"
                  onclick="toggleMoveGroup('${moveId}')">
            ${esc(label)} (${moves.length} options)
          </button>
          <div id="move-group-${moveId}" class="${isExpanded ? "" : "hidden"}" style="padding-left:8px; display:flex; flex-direction:column; gap:2px;">
            ${moves.slice(0, 15).map((m, i) => {
              const paramStr = formatMoveDescription(moveId, m.params) || formatParamsFallback(m.params);
              const moveHighlighted = interaction.sourceCardId &&
                (m.params?.cardId === interaction.sourceCardId ||
                 m.params?.unitIds?.includes(interaction.sourceCardId) ||
                 m.params?.unitId === interaction.sourceCardId);
              const onclick = `executeMove(${JSON.stringify(moveId)}, ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})`;
              return `
                <button class="action-btn ${moveHighlighted ? "highlighted" : ""}"
                        onclick='${onclick}'>
                  ${esc(paramStr || `Option ${i + 1}`)}
                </button>
              `;
            }).join("")}
            ${moves.length > 15 ? `<div style="color:#6a6288;font-size:10px;padding:4px;">+${moves.length - 15} more...</div>` : ""}
          </div>
        `;
      }
    }
  }

  list.innerHTML = html;
  list.querySelectorAll("[data-play-cost-card]").forEach(el => {
    el.addEventListener("click", () => openPlayCostModal(el.dataset.playCostCard));
  });
  list.querySelectorAll("[data-target-play]").forEach(el => {
    el.addEventListener("click", () => {
      const g = targetPlayGroups[Number(el.dataset.targetPlay)];
      if (g) beginTargetingOrPlay(g.moves, g.sourceCardId);
    });
  });
}

function toggleMoveGroup(moveId) {
  // Opening a sidebar action group is a new intent: drop any armed targeting mode
  // first so the target banner and a move submenu can never be live at once.
  // (The document click-cancel handler in interactions.js skips #actionsList.)
  if (typeof isChoosingTarget === "function" && isChoosingTarget()) {
    cancelInteraction(); // re-renders the action list, so re-look-up below
  }
  const el = document.getElementById(`move-group-${moveId}`);
  if (el) el.classList.toggle("hidden");
}
