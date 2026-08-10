// Effect handler: "play"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { addToChain, createInteractionState } from "../../chain";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { getLKI } from "../../operations/leave-board";
import { playNamesPublicPile } from "../play-from-pile";
import { resolveTarget } from "../target-resolver";
import { getOptionalPlayCost } from "../../game-definition/moves/play/cost";
import {
  beginPlay,
  canPerformEffectPlay,
  type EffectPlaySpec,
  enterPlayedPermanent,
  type PlayIO,
  type PlayLocationSpec,
  type PlayVia,
  putPlayedSpellOnChain,
} from "../../game-definition/moves/play/play-pipeline";
import { spellEffectHasLegalTargets, type SpellEffectTargetShape } from "../../game-definition/moves/play/targeting";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { isEquipmentCard } from "./_attachment";
import { type EffectHelpers, getTargetIds } from "./_helpers";

/**
 * rule 208.3 / 476.1 — does a card satisfy a play instruction's `target.type`?
 * "card" matches anything; otherwise the registered card type must match, except
 * that a gear with the printed [Equip] ability IS Equipment (VEN gears are typed
 * "gear" in the set JSON), so an "equipment" target must accept it too — the same
 * predicate the attach mechanics use.
 */
function matchesPlayTargetType(cardId: string, targetType: unknown): boolean {
  if (typeof targetType !== "string" || targetType === "" || targetType === "card") {
    return true;
  }
  if (targetType === getGlobalCardRegistry().getCardType(cardId)) {
    return true;
  }
  return targetType === "equipment" && isEquipmentCard(cardId);
}

/** The play instruction's shape (parser / explicit abilities). */
interface PlayEffectShape {
  readonly target?: unknown;
  readonly from?: string;
  readonly toLocation?: unknown;
  readonly ignoreCost?: unknown;
  readonly reduceCost?: { energy?: unknown };
  readonly cost?: { energy?: number; power?: readonly string[] };
  readonly optional?: boolean;
  readonly player?: string;
  readonly recycleAfter?: boolean;
  readonly linkedToSource?: boolean;
  readonly then?: unknown;
}

/** rule 356.1.a / 356.1.b / 356.5.a — the instruction's words as a cost mode. */
export function costModeOfPlayEffect(
  effect: { ignoreCost?: unknown; cost?: { energy?: number; power?: readonly string[] } },
  energyReduction = 0,
): EffectPlaySpec["costMode"] {
  if (effect.cost !== undefined) {
    return { energy: effect.cost.energy ?? 0, kind: "fixed", power: [...(effect.cost.power ?? [])] };
  }
  switch (effect.ignoreCost) {
    case true:
    case "all":
      return { kind: "ignore-all" };
    case "energy":
      return { kind: "ignore-energy" };
    case "power":
      return { kind: "ignore-power" };
    case "any-and-all":
      return { kind: "ignore-any-and-all" };
    default:
      return energyReduction > 0 ? { energy: energyReduction, kind: "reduce" } : { kind: "full" };
  }
}

/** rule 355.2 / 355.2.b — the instruction's destination words as a location spec. */
function locationSpecOf(toLocation: unknown, ctx: EffectContext, performer: string): PlayLocationSpec | undefined {
  if (toLocation === undefined) {
    return "prompt";
  }
  if (toLocation === "same") {
    return "same-as-lki";
  }
  if (toLocation === "base") {
    return { fixed: "base" };
  }
  if (toLocation === "here") {
    const here = ctx.sourceZone;
    return here && (here === "base" || here.startsWith("battlefield-")) ? { fixed: here } : { fixed: "base" };
  }
  if (typeof toLocation === "object" && toLocation !== null) {
    const bf = (toLocation as { battlefield?: unknown }).battlefield;
    const all = Object.keys(ctx.draft.battlefields ?? {});
    if (bf === "controlled") {
      // rule-id: sfd-111-221 — "to a battlefield you control": never the base.
      return {
        only: all
          .filter((id) => ctx.draft.battlefields[id]?.controller === performer)
          .map((id) => `battlefield-${id}`),
      };
    }
    if (bf === "any") {
      // rule-id: unl-184-219 (355.2.b) — "to any battlefield": all of them, no base.
      return { only: all.map((id) => `battlefield-${id}`) };
    }
    if (typeof bf === "string" && ctx.draft.battlefields?.[bf]) {
      return { fixed: `battlefield-${bf}` };
    }
  }
  if (typeof toLocation === "string" && toLocation.startsWith("battlefield-")) {
    return { fixed: toLocation };
  }
  return "prompt";
}

/**
 * rule 419.3 — "play <card(s)>": every branch builds ONE `EffectPlaySpec` and
 * hands it to the play pipeline (`beginPlay`): the pending item on the Chain,
 * the performer's location / additional-cost dialog, payment under the
 * instruction's cost mode and the shared enter step all live there. Cards in
 * a private or off-board pile the performer must first CHOOSE from (hand,
 * trash, banishment) are offered through a `reveal-and-pick` prompt whose
 * pick re-enters the same pipeline (`pending-choice.ts`).
 */
export function handle_play(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const eff = effect as unknown as PlayEffectShape;
  const registry = getGlobalCardRegistry();
  // rule-id: unl-186-219 — "you may play this from your trash for [C]" on a
  // SPELL: the card re-enters the chain as a fresh spell play (rule 354).
  if (eff.target === "self" && registry.getCardType(ctx.sourceCardId) === "spell") {
    replaySelfSpell(effect, ctx);
    return;
  }
  const from = eff.from;
  const io = ctx as unknown as PlayIO;

  // A. "play ME" (Deathknell / leave-deck / permission triggers) — the card is known.
  if (eff.target === "self" || eff.target === undefined) {
    const cardId = ctx.sourceCardId;
    if (typeof from === "string" && from !== "anywhere" && ctx.zones.getCardZone(cardId as CoreCardId) !== from) {
      return;
    }
    beginPlay(
      io,
      {
        cardId,
        // "…pay [fury] to play me" / "[Deathknell] play me": the ability's own
        // cost (if any) was the price — the card's cost is not paid again unless
        // the instruction names one ("play me for [rainbow]" — 356.1.a).
        costMode:
          eff.cost === undefined && eff.ignoreCost === undefined && eff.reduceCost === undefined
            ? { kind: "ignore-all" }
            : costModeOfPlayEffect(eff, energyReductionOf(eff, ctx)),
        declinable: eff.optional === true,
        location: locationSpecOf(eff.toLocation, ctx, ctx.playerId),
        playerId: ctx.playerId,
        sourceCardId: cardId,
        via: "effect",
        ...(eff.then !== undefined ? { then: eff.then } : {}),
      },
    );
    return;
  }

  // B. "play a <card> from your trash / banishment" — the performer picks one
  // of the eligible cards in that pile (355.10), then plays it.
  if ((from === "trash" || from === "banishment") && typeof eff.target === "object") {
    offerPileCandidates(eff, ctx, from);
    return;
  }

  // C. "play a <card> from your hand …" — a private zone: the performer picks
  // (and may always decline — 128.6), then plays it.
  const boundInHand =
    ctx.boundTargets?.filter((id) => ctx.zones.getCardZone(id as CoreCardId) === "hand") ?? [];
  if (from === "hand" && boundInHand.length === 0) {
    const template = specTemplate(eff, ctx, ctx.playerId);
    const candidates = playCandidatesFromHand(effect, ctx).filter((id) =>
      canPerformEffectPlay(io, { ...template, cardId: id }),
    );
    if (candidates.length === 0 || ctx.draft.pendingChoice) {
      return;
    }
    ctx.draft.pendingChoice = {
      onPicked: "play",
      optional: true,
      playSpec: template,
      prompter: ctx.playerId,
      remaining: 1,
      revealed: [...candidates],
      revealer: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      type: "reveal-and-pick",
    } as unknown as typeof ctx.draft.pendingChoice;
    return;
  }

  // D. explicit objects ("banish a unit, then its owner plays it …", a card a
  // previous step named): one play per target. A player can only play their
  // OWN card this way (rule 103), so the performer is the card's owner —
  // whoever controlled it before ("its owner plays it", 191.1) — unless the
  // instruction explicitly hands the play to this effect's controller.
  const targets = from === "hand" ? boundInHand : getTargetIds(effect, ctx);
  for (const targetId of targets) {
    // rule 186.1 / 359.3.e — an earlier step of this same instruction may have
    // put the object into a non-board zone where it CEASED TO EXIST (a token
    // banished by "Banish a friendly unit, then its owner plays it"). It is in
    // no zone any more, so there is nothing left to play: do as much as you can.
    if (ctx.zones.getCardZone(targetId as CoreCardId) === undefined) {
      continue;
    }
    const type = registry.getCardType(targetId);
    if (type !== "unit" && type !== "gear" && type !== "equipment" && type !== "spell") {
      continue;
    }
    const owner = (ctx.cards.getCardOwner(targetId as CoreCardId) as string | undefined) ?? ctx.playerId;
    const performer = eff.player === "controller" || eff.player === "self" ? ctx.playerId : owner;
    beginPlay(
      io,
      {
        ...specTemplate(eff, ctx, performer),
        cardId: targetId,
        ...(performer !== ctx.playerId ? { stagedBy: ctx.playerId } : {}),
        via: eff.toLocation === "same" ? "replay" : "effect",
      },
    );
  }
}

/** The instruction's play bundle for `performer`, minus the card. */
function specTemplate(eff: PlayEffectShape, ctx: EffectContext, performer: string): Omit<EffectPlaySpec, "cardId"> {
  return {
    costMode: costModeOfPlayEffect(eff, energyReductionOf(eff, ctx)),
    location: locationSpecOf(eff.toLocation, ctx, performer),
    playerId: performer,
    sourceCardId: ctx.sourceCardId,
    via: "effect",
    ...(eff.recycleAfter === true ? { recycleAfter: true } : {}),
    ...(eff.then !== undefined ? { then: eff.then } : {}),
  };
}

/**
 * rule 355.10 / 419.3.c — "play a <card> from your trash / banishment": gather
 * the pile's cards that match the descriptor (type, printed-cost bounds — 206,
 * tags, "banished with this" link — 397, the caps set by a unit killed to pay
 * this card's own cost — 356.1.b.1 / 357.2) AND that the performer could
 * actually play right now, and let them pick one (declinable — the pick may
 * always be passed up). Nothing eligible: nothing happens.
 */
function offerPileCandidates(eff: PlayEffectShape, ctx: EffectContext, pile: "trash" | "banishment"): void {
  const registry = getGlobalCardRegistry();
  const target = eff.target as { type?: string; controller?: string; filter?: unknown } | undefined;
  // rule 356.1.b.1 / 357.2 — "Play a unit from your trash that costs no more
  // Energy and no more Power than the killed unit, ignoring its cost": the
  // unit killed to pay this card's mandatory additional cost sets two
  // independent caps, and the play itself is free. That unit is in the trash
  // by now but is not a candidate — targets are locked (355.5) before the
  // additional cost is paid (357).
  const mandatoryKill = getOptionalPlayCost(ctx.sourceCardId);
  const killedForCost =
    pile === "trash" && mandatoryKill?.kind === "kill" && mandatoryKill.mandatory === true
      ? ctx.draft.lastKilledUnitId
      : undefined;
  const killedCaps =
    killedForCost === undefined
      ? undefined
      : {
          energy: registry.getEnergyCost(killedForCost) ?? 0,
          id: killedForCost,
          power: (registry.getPowerCost(killedForCost) ?? []).length,
        };
  // rule 108.2 (ven-114-166 Kharox) — "a unit in THEIR trash": the opponent's
  // pile is the origin; the performer still plays (and so controls) the card.
  const pileOwner = pile === "trash" ? enemyTrashOwner(target, ctx) : ctx.playerId;
  const linked =
    eff.linkedToSource === true
      ? new Set(
          ((ctx.cards.getCardMeta?.(ctx.sourceCardId as CoreCardId) as { exiledByThis?: readonly string[] } | undefined)
            ?.exiledByThis ?? []) as readonly string[],
        )
      : undefined;
  const costFilters = Array.isArray(target?.filter)
    ? (target?.filter as readonly unknown[])
    : target?.filter !== undefined
      ? [target.filter]
      : [];
  const template: Omit<EffectPlaySpec, "cardId"> = {
    ...specTemplate(eff, ctx, ctx.playerId),
    ...(killedCaps !== undefined ? { costMode: { kind: "ignore-all" as const } } : {}),
  };
  const io = ctx as unknown as PlayIO;
  const cards = ctx.zones.getCardsInZone(pile as CoreZoneId, pileOwner as CorePlayerId) as readonly string[];
  const candidates = cards.filter((id) => {
    if (linked !== undefined && !linked.has(id)) {
      return false;
    }
    if (!matchesPlayTargetType(id, target?.type)) {
      return false;
    }
    if (killedCaps !== undefined) {
      if (
        id === killedCaps.id ||
        (registry.getEnergyCost(id) ?? 0) > killedCaps.energy ||
        (registry.getPowerCost(id) ?? []).length > killedCaps.power
      ) {
        return false;
      }
    }
    if (!costFilters.every((f) => matchesPrintedCostFilter(id, f, ctx) && matchesCardTagFilter(id, f))) {
      return false;
    }
    return canPerformEffectPlay(io, { ...template, cardId: id });
  });
  // rule 419.3 (sfd-090-221) — "Play ALL units banished with this": no choice
  // is involved, so every candidate is played, oldest first, with no prompt.
  if ((target as { quantity?: unknown } | undefined)?.quantity === "all") {
    for (const id of candidates) {
      beginPlay(io, { ...template, cardId: id });
    }
    return;
  }
  // rule 355.5 / 355.10.a — when the instruction's target was locked as the
  // card was played or the trigger finalized (a descriptor naming the pile),
  // THAT object is the play: if it can no longer be played the instruction just
  // does nothing more — a different card in the pile is never substituted for
  // it. A board pick bound by the chain resolver is meaningless here, so only
  // bindings that name a card in this pile count.
  const boundInPile = ctx.boundTargets?.filter((id) => cards.includes(id)) ?? [];
  if (boundInPile.length > 0) {
    for (const id of boundInPile) {
      if (candidates.includes(id)) {
        beginPlay(io, { ...template, cardId: id });
      }
    }
    return;
  }
  // rule 359.3.e.7 (rule-id: sfd-140-221 Fizz) — the card was NAMED as the item
  // was finalized; an opponent who recycled it out of the pile in response
  // makes the instruction do nothing. Its controller never picks a replacement.
  if (playNamesPublicPile(eff) && (ctx.boundTargets?.length ?? 0) > 0) {
    return;
  }
  if (candidates.length === 0 || ctx.draft.pendingChoice) {
    return;
  }
  // rule 355.10: the performer chooses which card to play; the choice is
  // theirs alone, so it is offered even with a single candidate.
  // rule 359.3.e.6 / 128.6 a-contrario: the trash and banishment are PUBLIC
  // zones, so "Play a <card> from your trash" is compulsory once a legal
  // candidate exists — only an explicit "you may" (`eff.optional`) makes the
  // pick declinable, unlike the hand (branch C, a private zone).
  ctx.draft.pendingChoice = {
    onPicked: "play",
    optional: eff.optional === true,
    playFrom: "trash",
    playSpec: template,
    prompter: ctx.playerId,
    remaining: 1,
    revealed: [...candidates],
    revealer: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    type: "reveal-and-pick",
  } as unknown as typeof ctx.draft.pendingChoice;
}

/** rule 356.4 — the instruction's flat Energy discount ("reducing its cost by [3]", or the recycled unit's Might). */
function energyReductionOf(eff: PlayEffectShape, ctx: EffectContext): number {
  return trashPlayEnergyReduction(eff as unknown as ExecutableEffect, ctx);
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
  const { optional, cost, from, player, escalate, accepted } = effect as {
    optional?: boolean;
    cost?: unknown;
    from?: string;
    player?: string;
    escalate?: boolean;
    accepted?: boolean;
  };
  const fromZone = from ?? "trash";
  const registry = getGlobalCardRegistry();
  const spellEffect = (registry.getAbilities(cardId) ?? []).find((a) => a.type === "spell")?.effect as
    | SpellEffectTargetShape
    | undefined;
  const zone = ctx.zones.getCardZone(cardId as CoreCardId);
  // rule 108.2 (rule-id: unl-020-219) — "ITS controller may play this spell
  // again": the player who gets the offer is the damaged unit's controller,
  // which may well be the opponent of the player resolving this spell.
  const replayPlayer =
    player === "target-controller"
      ? ((ctx.boundTargets?.[0] === undefined
          ? undefined
          : ((ctx.cards.getCardController?.(ctx.boundTargets[0] as CoreCardId) ??
              ctx.cards.getCardOwner(ctx.boundTargets[0] as CoreCardId)) as string | undefined)) ??
        ctx.playerId)
      : ctx.playerId;
  if (accepted !== true && (optional || cost !== undefined || zone === "chain")) {
    // Rule 355.8: never offer a play that would have no legal target.
    const legal = spellEffectHasLegalTargets(spellEffect, {
      cards: ctx.cards,
      choosing: true,
      draft: ctx.draft,
      playerId: replayPlayer,
      sourceCardId: cardId,
      zones: ctx.zones,
    } as Parameters<typeof spellEffectHasLegalTargets>[1]);
    if (!legal) {
      return;
    }
    ctx.draft.pendingChoice = {
      playerId: replayPlayer,
      resolved: {
        cardId,
        controller: replayPlayer,
        // `accepted` marks the re-entry: the answer IS the decision to play, so
        // the second pass performs the replay instead of asking again (the card
        // is still in the `chain` zone while its first resolution finishes).
        effect: {
          accepted: true,
          from: fromZone,
          target: "self",
          type: "play",
          ...(escalate === true ? { escalate: true } : {}),
        },
        ...(cost !== undefined ? { optInCost: cost } : {}),
        type: "ability",
      },
      sourceCardId: cardId,
      type: "opt-in",
    };
    return;
  }
  if (accepted !== true && zone !== fromZone) {
    return;
  }
  // rule 354.3 / 359.3.d — the card is being played again, so the parked
  // "place it in the trash" step of the resolution it is leaving no longer
  // applies; dropping it keeps the replayed card on the chain.
  if (ctx.draft.deferredSpellSettle?.cardId === cardId) {
    ctx.draft.deferredSpellSettle = undefined;
  }
  // rule 715.1 / 317.2.c (rule-id: unl-020-219) — "this deals 1 additional
  // Bonus Damage for each time this spell has dealt damage this turn": one
  // pip per replay, scoped to this card and expiring with the turn.
  if (escalate === true) {
    const entries = (ctx.draft.activeReplacements ?? []) as unknown as Record<string, unknown>[];
    entries.push({
      appliedToSourceId: cardId,
      bonusDamage: 1,
      duration: "next",
      replaces: "deals-bonus-damage",
    });
    (ctx.draft as { activeReplacements?: unknown }).activeReplacements = entries;
  }
  ctx.zones.moveCard({ cardId: cardId as CoreCardId, targetZoneId: "chain" as CoreZoneId });
  ctx.draft.interaction = addToChain(
    ctx.draft.interaction ?? createInteractionState(),
    { cardId, controller: replayPlayer, effect: spellEffect, resolveTo: "trash", type: "spell" },
    Object.keys(ctx.draft.players),
  );
  // Rule 724 (Legion): a replay is still a card played this turn.
  if (ctx.draft.cardsPlayedThisTurn) {
    ctx.draft.cardsPlayedThisTurn[replayPlayer] = (ctx.draft.cardsPlayedThisTurn[replayPlayer] ?? 0) + 1;
  }
  bindReplayTarget(ctx, cardId, replayPlayer, spellEffect);
}

/**
 * rule 355.5 / 355.8 — playing the card again follows the play process, so a
 * target the replayed spell names is chosen NOW, as it goes on the Chain (never
 * deferred to resolution: an item may only sit on the Chain once valid choices
 * exist for all of its targets). A single legal object locks itself; several
 * park a `choose-target` bound to the new item, exactly like a play-time slot.
 */
function bindReplayTarget(
  ctx: EffectContext,
  cardId: string,
  replayPlayer: string,
  spellEffect: SpellEffectTargetShape | undefined,
): void {
  const descriptor = spellEffect?.target;
  if (!descriptor || typeof descriptor !== "object" || (descriptor as { quantity?: unknown }).quantity === "all") {
    return;
  }
  const items = ctx.draft.interaction?.chain?.items;
  const item = items?.[items.length - 1];
  if (!item || item.cardId !== cardId) {
    return;
  }
  const options = resolveTarget({ ...(descriptor as object), quantity: "all" } as Parameters<typeof resolveTarget>[0], {
    cards: ctx.cards,
    choosing: true,
    draft: ctx.draft,
    playerId: replayPlayer,
    sourceCardId: cardId,
    zones: ctx.zones,
  } as Parameters<typeof resolveTarget>[1]) as string[];
  if (options.length === 0) {
    return;
  }
  if (options.length === 1) {
    (item as { targets?: readonly string[] }).targets = [options[0] as string];
    return;
  }
  ctx.draft.pendingChoice = {
    bindToChainItemId: item.id,
    effect: spellEffect,
    options,
    playerId: replayPlayer,
    remaining: 1,
    sourceCardId: cardId,
    type: "choose-target",
  } as unknown as typeof ctx.draft.pendingChoice;
}

/**
 * rule 206 — a printed-cost bound on a play target ("costing no more than [3]
 * and no more than [rainbow]"). Energy and Power are independent comparisons
 * and Power is counted in pips, so "[rainbow]" is `{ lte: 1 }`. Cards in the
 * trash / hand are outside the zones the target resolver scans, so the check
 * reads the registry directly.
 */
function matchesPrintedCostFilter(
  cardId: string,
  filter: unknown,
  ctx?: EffectContext,
): boolean {
  if (typeof filter !== "object" || filter === null) {
    return true;
  }
  const f = filter as {
    energyCost?: Record<string, unknown>;
    powerCost?: Record<string, unknown>;
  };
  const registry = getGlobalCardRegistry();
  // rule-id: ogn-112-298 (rule 206) — a bound may name a game value rather than
  // a printed number ("Energy cost less than your points"); it is read when the
  // candidates are gathered.
  const bound = (raw: unknown): number | undefined => {
    if (typeof raw === "number") {
      return raw;
    }
    if (raw && typeof raw === "object" && "points" in (raw as object) && ctx) {
      const whose = (raw as { points?: string }).points;
      const pid = whose === "opponent"
        ? Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId)
        : ctx.playerId;
      return ctx.draft.players[pid ?? ctx.playerId]?.victoryPoints ?? 0;
    }
    return undefined;
  };
  const cmp = (value: number, c: Record<string, unknown> | undefined): boolean => {
    if (!c) return true;
    const eq = bound(c.eq);
    const lt = bound(c.lt);
    const lte = bound(c.lte);
    const gt = bound(c.gt);
    const gte = bound(c.gte);
    if (eq !== undefined && value !== eq) return false;
    if (lt !== undefined && !(value < lt)) return false;
    if (lte !== undefined && !(value <= lte)) return false;
    if (gt !== undefined && !(value > gt)) return false;
    if (gte !== undefined && !(value >= gte)) return false;
    return true;
  };
  if ("energyCost" in f && !cmp(registry.getEnergyCost(cardId), f.energyCost)) {
    return false;
  }
  if ("powerCost" in f && !cmp(registry.getPowerCost(cardId).length, f.powerCost)) {
    return false;
  }
  return true;
}

/**
 * rule 355.8 — a tag/name bound on a play target ("play a MECH from your
 * trash"). Cards in the trash / hand are outside the zones the target resolver
 * scans, so the tags are read from the registry definition here.
 */
function matchesCardTagFilter(cardId: string, filter: unknown): boolean {
  if (typeof filter !== "object" || filter === null) {
    return true;
  }
  const f = filter as { tag?: unknown; excludeTag?: unknown; name?: unknown };
  const def = getGlobalCardRegistry().get(cardId) as
    | { tags?: readonly string[]; name?: string }
    | undefined;
  const tags = def?.tags ?? [];
  if (typeof f.tag === "string" && !tags.includes(f.tag)) {
    return false;
  }
  // rule 355.8 (rule-id: unl-167-219) — a tag list is a disjunction.
  if (Array.isArray(f.tag) && !(f.tag as readonly string[]).some((t) => tags.includes(t))) {
    return false;
  }
  if (typeof f.excludeTag === "string") {
    const ex = f.excludeTag.toLowerCase();
    if (tags.some((t) => t.toLowerCase() === ex)) {
      return false;
    }
  }
  if (typeof f.name === "string" && def?.name !== f.name) {
    return false;
  }
  return true;
}

/**
 * rule 356.4 (rule-id: sfd-026-221) — the Energy discount on a "play it from
 * your trash" instruction. A plain number is used as printed; the dynamic form
 * `{ might: "recycled" }` reads the Might of the card recycled to pay the
 * instruction's own cost, which the payment hands back as the trigger source.
 */
function trashPlayEnergyReduction(effect: ExecutableEffect, ctx: EffectContext): number {
  const raw = (effect as { reduceCost?: { energy?: unknown } }).reduceCost?.energy;
  if (typeof raw === "number") {
    return Math.max(0, raw);
  }
  if (typeof raw === "object" && raw !== null && (raw as { might?: unknown }).might === "recycled") {
    // rule 359.3.e.13 — look-back: the recycled card has already left the board,
    // so the discount is the Might it LAST had there (buff, +N this turn,
    // equipment), read from its last-known-information snapshot. Printed Might
    // is only a fallback for a card that never had a board state.
    // rule 404.1 — the unit was recycled to PAY the trigger at finalization: it
    // rides on the item as a paid object with that snapshot.
    const paidUnit = ctx.paidObjects?.[0];
    if (paidUnit !== undefined) {
      return Math.max(0, paidUnit.lki.might);
    }
    if (ctx.triggerSourceId === undefined) {
      return 0;
    }
    const lki = getLKI(ctx.draft, ctx.triggerSourceId);
    if (lki !== undefined) {
      return Math.max(0, lki.might);
    }
    return Math.max(0, getGlobalCardRegistry().getMight(ctx.triggerSourceId));
  }
  return 0;
}

/**
 * rule 108.2 (rule-id: ven-114-166 Kharox) — which trash a "play a unit from
 * the trash" instruction reads: an `enemy`/`opponent` controller on the
 * descriptor points at the opponent's pile, anything else at the controller's
 * own. The player who plays the card controls it either way.
 */
function enemyTrashOwner(
  target: { controller?: string } | undefined,
  ctx: EffectContext,
): string {
  const whose = target?.controller;
  if (whose !== "enemy" && whose !== "opponent") {
    return ctx.playerId;
  }
  return Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId) ?? ctx.playerId;
}

/**
 * rule-id: ogn-112-298 (rules 354.2 / 356.1.b / 594) — a spell an effect plays
 * from the trash goes on the chain like any other spell play: its controller is
 * the player the effect instructed, its targets are chosen as it resolves, and
 * when it leaves the chain it is recycled (bottom of the Main Deck) rather than
 * trashed if the instruction said so.
 */
export function castSpellFromTrash(
  cardId: string,
  playerId: string,
  recycleAfter: boolean,
  bag: {
    draft: EffectContext["draft"];
    zones: { moveCard: (p: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void };
  },
): void {
  putPlayedSpellOnChain(bag as unknown as PlayIO, {
    cardId,
    playerId,
    resolveTo: recycleAfter ? "mainDeck" : "trash",
    via: "effect",
  });
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
    if (!matchesPlayTargetType(id, target?.type)) {
      return false;
    }
    for (const f of filters) {
      if (typeof f.keyword === "string" && !registry.hasKeyword(id, f.keyword)) {
        return false;
      }
      if (!matchesCardTagFilter(id, f)) {
        return false;
      }
      // rule 206.1 (rule-id: sfd-024-221) — "with Energy cost no more than [2]"
      // reads the card's PRINTED Energy cost, whatever the play will actually
      // charge; an over-cost card is never an eligible choice.
      const energy = (f as { energyCost?: { lte?: number; gte?: number; eq?: number } }).energyCost;
      if (energy !== undefined) {
        const printed = registry.getEnergyCost(id) ?? 0;
        if (
          (energy.lte !== undefined && printed > energy.lte) ||
          (energy.gte !== undefined && printed < energy.gte) ||
          (energy.eq !== undefined && printed !== energy.eq)
        ) {
          return false;
        }
      }
    }
    return true;
  });
}

/**
 * rule 419.3 / 359.2 — a unit an effect plays enters the board at `zoneId`
 * through the ONE enter path shared with hand plays (`play-pipeline.ts`):
 * fresh object (124.1), exhausted unless an enter-ready effect / paid
 * Accelerate applies (143.4), controlled by `ctx.playerId` (191.1), play
 * triggers with `via:"effect"` + origin zone, Legion count, arrival contest,
 * [Weaponmaster].
 */
export function enterUnitFromEffect(
  cardId: string,
  zoneId: string,
  ctx: EffectContext,
  opts?: { entersReady?: boolean; paidIds?: readonly string[]; stun?: boolean; stagedBy?: string; via?: PlayVia },
): void {
  enterPlayedPermanent(ctx, {
    cardId,
    entryZone: zoneId,
    playerId: ctx.playerId,
    via: opts?.via ?? "effect",
    ...(opts?.entersReady ? { entersReady: true } : {}),
    ...(opts?.paidIds && opts.paidIds.length > 0 ? { paidAdditionalCost: true, paidIds: opts.paidIds } : {}),
    ...(opts?.stun ? { stun: true } : {}),
    ...(opts?.stagedBy ? { stagedBy: opts.stagedBy } : {}),
  });
}
