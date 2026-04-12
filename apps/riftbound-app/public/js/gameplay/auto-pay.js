// auto-pay.js — Cost solver and sequencer for playing hand cards without manual rune clicks.
//
// Strategy
// --------
// Given a hand card with { energyCost: N, powerCost: ["fury","chaos",...] }, build a plan
// that exhausts/recycles untapped runes to satisfy both color (power) and generic (energy)
// requirements, then plays the card. The plan is a list of moves that are emitted one after
// another to the server using the same `/api/game/:id/move` endpoint the rest of the client
// already uses — so there is no new server endpoint to maintain.
//
// Algorithm
// ---------
// 1. Compute what the rune pool currently provides: { energy, power: { fury: 1, ... } }.
// 2. Iterate powerCost entries; for any color not already in the pool, find an untapped
//    rune matching that domain and schedule a `recycleRune` move.
// 3. For remaining energy not already in the pool, schedule `exhaustRune` moves on any
//    still-untapped runes.
// 4. If at any step no rune is available to satisfy the next requirement, return an error
//    string and emit nothing.
// 5. After the cost steps resolve, emit the matching `playUnit`/`playSpell`/`playGear`.
//
// Reuses the existing `/api/game/:id/move` endpoint by sequentially calling
// `autoPayExecuteMoveAsync` so state progresses after each step. Avoids the Rift Atlas
// "Equip button that fails to route the next click" anti-pattern: since drag/click
// resolves to a single pipeline that owns the whole gesture, there is no intermediate
// UI state a stray click can fall through.

/**
 * Produce a structured cost description for a hand card.
 * @returns {{ energy: number, power: string[] }}
 */
function describeCardCost(card) {
  const energy = typeof card?.energyCost === "number" ? card.energyCost : 0;
  const power = Array.isArray(card?.powerCost) ? card.powerCost.slice() : [];
  return { energy, power };
}

/** Return untapped runes owned by the viewing player, shaped as { id, domain }. */
function listUntappedRunes() {
  const runes = zoneForPlayer("runePool", viewingPlayer) || [];
  return runes
    .filter(r => !r.meta?.exhausted)
    .map(r => ({ id: r.id, domain: normalizeDomain(r.domain) }));
}

/** Normalize the domain field to a single string (some card defs use string[]). */
function normalizeDomain(domain) {
  if (Array.isArray(domain)) return domain[0] || "";
  return (typeof domain === "string") ? domain : "";
}

/**
 * Build a cost payment plan for a card. Returns either
 *   { ok: true, steps: [{moveId, params}] }   or
 *   { ok: false, error: "message" }.
 * The steps do NOT include the final play move; the caller appends that.
 */
function planCostPayment(card) {
  const { energy: energyNeeded, power: powerNeededList } = describeCardCost(card);
  const pool = gameState?.runePools?.[viewingPlayer];
  if (!pool && (energyNeeded > 0 || powerNeededList.length > 0)) {
    return { ok: false, error: "No rune pool available" };
  }

  // Snapshot available resources in the pool (before we spend them on this card).
  let availableEnergy = pool?.energy ?? 0;
  const availablePower = { ...(pool?.power || {}) };

  const untapped = listUntappedRunes();
  const usedRuneIds = new Set();
  const steps = [];

  // 1) Satisfy color requirements, first from pool then from recycling runes.
  const remainingPower = [];
  for (const color of powerNeededList) {
    if (color === "all" || color === "any") {
      const total = Object.values(availablePower).reduce((a, b) => a + b, 0);
      if (total > 0) {
        for (const d of Object.keys(availablePower)) {
          if (availablePower[d] > 0) { availablePower[d] -= 1; break; }
        }
        continue;
      }
      remainingPower.push(color);
      continue;
    }
    if ((availablePower[color] ?? 0) > 0) {
      availablePower[color] -= 1;
      continue;
    }
    remainingPower.push(color);
  }

  for (const color of remainingPower) {
    let rune;
    if (color === "all" || color === "any") {
      rune = untapped.find(r => !usedRuneIds.has(r.id));
    } else {
      rune = untapped.find(r => !usedRuneIds.has(r.id) && r.domain === color);
    }
    if (!rune) {
      return {
        ok: false,
        error: color === "all" || color === "any"
          ? "Not enough runes to pay rainbow cost"
          : `No untapped ${capitalizeDomain(color)} rune available`,
      };
    }
    usedRuneIds.add(rune.id);
    steps.push({
      moveId: "recycleRune",
      params: { runeId: rune.id, domain: color === "all" || color === "any" ? rune.domain : color },
    });
  }

  // 2) Satisfy remaining generic energy by exhausting runes.
  //
  // Colored pips count toward the card's total energy cost, so energyNeeded already
  // includes the colored portion; subtract the power we've just scheduled to find the
  // remaining generic slots.
  const genericNeeded = Math.max(0, energyNeeded - powerNeededList.length - availableEnergy);

  for (let i = 0; i < genericNeeded; i++) {
    const rune = untapped.find(r => !usedRuneIds.has(r.id));
    if (!rune) {
      return { ok: false, error: "Not enough runes — tap more manually" };
    }
    usedRuneIds.add(rune.id);
    steps.push({ moveId: "exhaustRune", params: { runeId: rune.id } });
  }

  return { ok: true, steps };
}

function capitalizeDomain(d) {
  if (!d) return "Power";
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/**
 * Execute a single move via the REST endpoint and wait for it to land.
 * Returns a promise that resolves to { success, error }.
 */
function autoPayExecuteMoveAsync(moveId, params) {
  return api(`/api/game/${gameId}/move`, "POST", {
    moveId,
    playerId: viewingPlayer,
    params,
  }).then(data => {
    if (data?.success) {
      if (data.state) gameState = data.state;
      return { success: true };
    }
    return { success: false, error: data?.error || "Move rejected" };
  }).catch(err => ({ success: false, error: String(err?.message || err) }));
}

/**
 * Attempt to auto-pay + play a hand card.
 * @param {string} cardId - The hand card to play.
 * @param {object} [opts] - { preferredMoveId, moveParamsOverrides }
 *   preferredMoveId lets callers force a specific play move (e.g. playUnit vs playGear).
 *   moveParamsOverrides merges into the play move params (e.g. `unitId` for equipment).
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function autoPayAndPlay(cardId, opts = {}) {
  const card = findCard(cardId);
  if (!card) return { success: false, error: "Card not found" };

  // If the card already has a direct play move, no cost planning needed — just play.
  const candidateMoves = availableMoves.filter(m =>
    (m.moveId === "playUnit" || m.moveId === "playSpell" || m.moveId === "playGear") &&
    m.params?.cardId === cardId
  );

  if (candidateMoves.length > 0) {
    const playMove = opts.preferredMoveId
      ? candidateMoves.find(m => m.moveId === opts.preferredMoveId) || candidateMoves[0]
      : candidateMoves[0];
    const params = { ...playMove.params, ...(opts.moveParamsOverrides || {}) };
    const result = await autoPayExecuteMoveAsync(playMove.moveId, params);
    if (!result.success) {
      showToast(result.error || "Could not play card");
    }
    return result;
  }

  // Otherwise plan a cost payment first.
  const plan = planCostPayment(card);
  if (!plan.ok) {
    showToast(plan.error);
    return { success: false, error: plan.error };
  }

  snapshotResources();
  for (const step of plan.steps) {
    const r = await autoPayExecuteMoveAsync(step.moveId, step.params);
    if (!r.success) {
      showToast(`Auto Pay failed: ${r.error}`);
      return r;
    }
  }

  // After paying, re-enumerate play moves. Prefer the server-provided list; fall back
  // to synthesizing params from the card definition if it has not been refreshed yet.
  const refreshed = availableMoves.filter(m =>
    (m.moveId === "playUnit" || m.moveId === "playSpell" || m.moveId === "playGear") &&
    m.params?.cardId === cardId
  );

  let playMove;
  if (refreshed.length > 0) {
    playMove = opts.preferredMoveId
      ? refreshed.find(m => m.moveId === opts.preferredMoveId) || refreshed[0]
      : refreshed[0];
  } else {
    const moveId = card.cardType === "spell" ? "playSpell"
      : card.cardType === "gear" ? "playGear"
      : "playUnit";
    playMove = {
      moveId: opts.preferredMoveId || moveId,
      params: { cardId, playerId: viewingPlayer },
      playerId: viewingPlayer,
    };
  }

  const params = { ...playMove.params, ...(opts.moveParamsOverrides || {}) };
  const finalResult = await autoPayExecuteMoveAsync(playMove.moveId, params);
  if (!finalResult.success) {
    showToast(`Could not play card: ${finalResult.error}`);
  }
  return finalResult;
}

/** Convenience: check whether a card is auto-payable right now (for the Auto Pay button). */
function canAutoPay(cardId) {
  const card = findCard(cardId);
  if (!card) return false;
  if (card.owner !== viewingPlayer) return false;
  const hasPlay = availableMoves.some(m =>
    (m.moveId === "playUnit" || m.moveId === "playSpell" || m.moveId === "playGear") &&
    m.params?.cardId === cardId
  );
  if (hasPlay) return true;
  return planCostPayment(card).ok;
}
