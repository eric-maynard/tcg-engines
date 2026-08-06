// Effect handler: "play"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { addToChain, createInteractionState } from "../../chain";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { canAffordCard, type CostExtras, deductCost } from "../../game-definition/moves/play/cost";
import { spellEffectHasLegalTargets, type SpellEffectTargetShape } from "../../game-definition/moves/play/targeting";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_play(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule-id: unl-186-219 — "you may play this from your trash for [C]" on a
  // SPELL: the card re-enters the chain as a fresh spell play (rule 354).
  if (
    (effect as { target?: unknown }).target === "self" &&
    getGlobalCardRegistry().getCardType(ctx.sourceCardId) === "spell"
  ) {
    replaySelfSpell(effect, ctx);
    return;
  }
  // Rule 354.2: an effect that instructs a player to play a card adds that
  // card to the chain as a pending item; its play process pauses while the
  // enclosing effect finishes (rule 354.3). The pending item keeps the turn
  // in a closed state (rule 309.1) so cleanup step 4 does not strip
  // battlefield control (rule 323.6). When the pending item is later
  // finalized its owner chooses a location (rule 355.2) via the stored
  // move-choose effect and the card enters the board there (rule 337.2).
  const toLocation = (effect as unknown as { toLocation?: unknown }).toLocation;
  // rule-id: ogn-107-298 — "play a card with [Hidden] from your hand": the
  // hand is not a board zone the target resolver scans, so gather candidates
  // from the controller's hand and let them choose one (rule 355.10).
  let targets: string[];
  const from = (effect as { from?: unknown }).from;
  // rule-id: ogn-196-298 (rule 356.1.b) — "play a unit from your trash,
  // ignoring its Energy cost": the trash is not a board zone the target
  // resolver scans, so gather the controller's own trash units that they can
  // still pay the Power cost for and let them choose one (rule 355.10).
  // ("play THIS from your trash" — a bare `self` target — keeps the generic
  // path below: the card to play is already known.)
  if (from === "trash" && typeof (effect as { target?: unknown }).target === "object") {
    playFromTrash(effect, ctx);
    return;
  }
  if (from === "hand" && !ctx.boundTargets) {
    const candidates = playCandidatesFromHand(effect, ctx);
    if (candidates.length === 0) {
      return;
    }
    if (candidates.length > 1 && !ctx.draft.pendingChoice) {
      ctx.draft.pendingChoice = {
        effect,
        options: candidates,
        playerId: ctx.playerId,
        remaining: 1,
        sourceCardId: ctx.sourceCardId,
        type: "choose-target",
      };
      return;
    }
    targets = [candidates[0] as string];
  } else {
    targets = getTargetIds(effect, ctx);
  }
  // rule-id: ogn-107-298 — "If it's a unit, play it here", ignoring its cost:
  // location and payment are both fixed, so the pending play finalizes as
  // soon as this effect finishes (rule 354.3 → 355.2) and the permanent
  // enters the source's battlefield directly.
  const here = ctx.sourceZone;
  if (
    toLocation === "here" &&
    (effect as { ignoreCost?: unknown }).ignoreCost === true &&
    here &&
    (here === "base" || here.startsWith("battlefield-"))
  ) {
    for (const targetId of targets) {
      if (getGlobalCardRegistry().getCardType(targetId) !== "unit") {
        continue;
      }
      enterUnitFromEffect(targetId, here, ctx);
    }
    return;
  }
  // rule-id: ogn-102-298 — an explicit "to their base" destination fixes both
  // location and payment, so the play finalizes right here (rule 354.3 →
  // 355.2): the unit enters its owner's base as a newly played permanent.
  if (toLocation === "base" && (effect as { ignoreCost?: unknown }).ignoreCost === true) {
    for (const targetId of targets) {
      if (getGlobalCardRegistry().getCardType(targetId) !== "unit") {
        continue;
      }
      enterUnitFromEffect(targetId, "base", ctx);
    }
    return;
  }
  const turnOrder = Object.keys(ctx.draft.players);
  const dest = toLocation === "base" ? "base" : "choose";
  for (const targetId of targets) {
    const owner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId;
    ctx.draft.interaction = addToChain(
      ctx.draft.interaction ?? createInteractionState(),
      {
        cardId: targetId,
        controller: owner,
        effect: { target: targetId, to: dest, type: "move" },
        triggered: true,
        type: "ability",
      },
      turnOrder,
    );
  }
}

/**
 * rule-id: unl-186-219 — a spell instructing its controller to "play this from
 * your trash [for COST]". While the spell is still resolving it sits in the
 * `chain` zone (rule 354.3: the new play waits for the enclosing effect to
 * finish), so an optional / costed replay is surfaced as an opt-in prompt
 * (rule 583) that re-enters here once the card has settled into the trash;
 * accepting charges `cost` via the prompt's `optInCost`. The replayed spell
 * goes on the chain with no bound targets — its controller picks them as it
 * resolves (rule 355.10).
 */
function replaySelfSpell(effect: ExecutableEffect, ctx: EffectContext): void {
  const cardId = ctx.sourceCardId;
  const { optional, cost, from } = effect as { optional?: boolean; cost?: unknown; from?: string };
  const fromZone = from ?? "trash";
  const registry = getGlobalCardRegistry();
  const spellEffect = (registry.getAbilities(cardId) ?? []).find((a) => a.type === "spell")?.effect as
    | SpellEffectTargetShape
    | undefined;
  const zone = ctx.zones.getCardZone(cardId as CoreCardId);
  if (optional || cost !== undefined || zone === "chain") {
    // Rule 355.8: never offer a play that would have no legal target.
    const legal = spellEffectHasLegalTargets(spellEffect, {
      cards: ctx.cards,
      choosing: true,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sourceCardId: cardId,
      zones: ctx.zones,
    } as Parameters<typeof spellEffectHasLegalTargets>[1]);
    if (!legal) {
      return;
    }
    ctx.draft.pendingChoice = {
      playerId: ctx.playerId,
      resolved: {
        cardId,
        controller: ctx.playerId,
        effect: { from: fromZone, target: "self", type: "play" },
        ...(cost !== undefined ? { optInCost: cost } : {}),
        type: "ability",
      },
      sourceCardId: cardId,
      type: "opt-in",
    };
    return;
  }
  if (zone !== fromZone) {
    return;
  }
  ctx.zones.moveCard({ cardId: cardId as CoreCardId, targetZoneId: "chain" as CoreZoneId });
  ctx.draft.interaction = addToChain(
    ctx.draft.interaction ?? createInteractionState(),
    { cardId, controller: ctx.playerId, effect: spellEffect, resolveTo: "trash", type: "spell" },
    Object.keys(ctx.draft.players),
  );
  // Rule 724 (Legion): a replay is still a card played this turn.
  if (ctx.draft.cardsPlayedThisTurn) {
    ctx.draft.cardsPlayedThisTurn[ctx.playerId] = (ctx.draft.cardsPlayedThisTurn[ctx.playerId] ?? 0) + 1;
  }
}

/**
 * rule-id: ogn-196-298 — "play a unit from your trash, ignoring its Energy
 * cost. (You must still pay its Power cost.)". Rule 356.1.b: ignoring one cost
 * component leaves the others payable, so only trash cards whose remaining
 * cost the controller can pay are legal choices (rule 355.8).
 */
function playFromTrash(effect: ExecutableEffect, ctx: EffectContext): void {
  const registry = getGlobalCardRegistry();
  const target = (effect as { target?: unknown }).target as { type?: string } | undefined;
  const ignoreCost = (effect as { ignoreCost?: unknown }).ignoreCost;
  const extras: CostExtras =
    ignoreCost === true
      ? { ignoreBaseCost: true }
      : ignoreCost === "energy"
        ? { ignoreEnergyCost: true }
        : {};
  const trash = ctx.zones.getCardsInZone(
    "trash" as CoreZoneId,
    ctx.playerId as CorePlayerId,
  ) as readonly string[];
  const candidates = trash.filter((id) => {
    const cardType = registry.getCardType(id);
    if (target?.type && target.type !== "card" && target.type !== cardType) {
      return false;
    }
    return canAffordCard(ctx.draft, ctx.playerId, id, extras, ctx.cards.getCardMeta);
  });
  // Board targets bound by the chain resolver are meaningless here (the card
  // is in the trash): only a pick among the trash candidates counts.
  let chosen = ctx.boundTargets?.find((id) => candidates.includes(id));
  if (chosen === undefined) {
    if (candidates.length === 0) {
      return;
    }
    if (!ctx.draft.pendingChoice) {
      // rule 355.10: the controller chooses which trash unit to play; the
      // choice is theirs alone, so it is offered even with a single candidate.
      ctx.draft.pendingChoice = {
        onPicked: "play",
        optional: true,
        playIgnoreEnergy: extras.ignoreEnergyCost === true,
        playIgnoreCost: extras.ignoreBaseCost === true,
        prompter: ctx.playerId,
        remaining: 1,
        revealed: [...candidates],
        revealer: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        type: "reveal-and-pick",
      } as typeof ctx.draft.pendingChoice;
      return;
    }
    chosen = candidates[0] as string;
  }
  deductCost(ctx.draft, ctx.playerId, chosen, extras, ctx.cards.getCardMeta);
  if (registry.getCardType(chosen) === "unit") {
    enterUnitFromEffect(chosen, "base", ctx);
  }
}

/**
 * rule-id: ogn-107-298 — cards in the effect controller's hand matching the
 * play effect's target shape (`type` unit/spell/gear/card, `filter.keyword`).
 */
function playCandidatesFromHand(effect: ExecutableEffect, ctx: EffectContext): string[] {
  const registry = getGlobalCardRegistry();
  const target = (effect as { target?: unknown }).target as
    | { type?: string; filter?: { keyword?: unknown } | readonly { keyword?: unknown }[] }
    | undefined;
  const filters = Array.isArray(target?.filter)
    ? (target.filter as readonly { keyword?: unknown }[])
    : target?.filter
      ? [target.filter as { keyword?: unknown }]
      : [];
  const hand = ctx.zones.getCardsInZone("hand" as CoreZoneId, ctx.playerId as CorePlayerId) as readonly string[];
  return hand.filter((id) => {
    const cardType = registry.getCardType(id);
    if (target?.type && target.type !== "card" && target.type !== cardType) {
      return false;
    }
    for (const f of filters) {
      if (typeof f.keyword === "string" && !registry.hasKeyword(id, f.keyword)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * rule-id: ogn-107-298 — a unit played by an effect to a fixed location,
 * ignoring its cost, enters the board there: exhausted (rule 143.4), firing
 * its play triggers and counting toward this turn's plays (rule 724),
 * mirroring the playUnit reducer.
 */
function enterUnitFromEffect(cardId: string, zoneId: string, ctx: EffectContext): void {
  ctx.zones.moveCard({ cardId: cardId as CoreCardId, targetZoneId: zoneId as CoreZoneId });
  // rule 337.2: the played card is a new object — board state from its
  // previous existence (damage, buffs, stun, granted keywords) is gone.
  ctx.counters.setFlag(cardId as CoreCardId, "stunned", false);
  ctx.counters.setFlag(cardId as CoreCardId, "buffed", false);
  ctx.cards.updateCardMeta?.(cardId as CoreCardId, {
    buffed: false,
    combatRole: null,
    damage: 0,
    grantedKeywords: undefined,
    mightModifier: 0,
    stunned: false,
  } as Record<string, unknown>);
  ctx.counters.setFlag(cardId as CoreCardId, "exhausted", true);
  const owner = ctx.cards.getCardOwner(cardId as CoreCardId) ?? ctx.playerId;
  ctx.fireTriggers?.({ cardId, paidAdditionalCost: false, playerId: owner, type: "play-self" });
  ctx.fireTriggers?.({ cardId, cardType: "unit", playerId: owner, type: "play-card" });
  if (ctx.draft.cardsPlayedThisTurn) {
    ctx.draft.cardsPlayedThisTurn[owner] = (ctx.draft.cardsPlayedThisTurn[owner] ?? 0) + 1;
  }
}
