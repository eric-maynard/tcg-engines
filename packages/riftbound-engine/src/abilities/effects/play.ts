// Effect handler: "play"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { addToChain, createInteractionState } from "../../chain";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import {
  canAffordCard,
  type CostExtras,
  deductCost,
  getOptionalPlayCost,
  hasStaticEffect,
  staticEnterReadyApplies,
} from "../../game-definition/moves/play/cost";
import { extractBattlefieldId } from "../../zones/zone-configs";
import { battlefieldForbidsUnitPlays } from "../play-restrictions";
import { spellEffectHasLegalTargets, type SpellEffectTargetShape } from "../../game-definition/moves/play/targeting";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

/**
 * rule 358.3.a (rule-id: ogn-026-298 Brynhir Thundersong) — a "player can't play
 * cards" restriction applies to every play, including one an effect INSTRUCTS a
 * player to make (rule 419.1: putting the card on the chain is the play). The
 * instruction is then impossible for that player and is skipped; the rest of the
 * effect (e.g. ven-066-166's banish) still stands.
 */
function playerCannotPlay(ctx: EffectContext, playerId: string): boolean {
  return ctx.draft.cannotPlayCardsThisTurn?.[playerId] === true;
}

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
  // rule-id: ogn-194-298 (rules 355.13 / 356.1.a) — "you may play me for
  // [rainbow]" on a UNIT that has just left the deck: an optional self play
  // for a stated alternative cost, resolved outside the chain.
  if (
    (effect as { target?: unknown }).target === "self" &&
    getGlobalCardRegistry().getCardType(ctx.sourceCardId) === "unit" &&
    (effect as { cost?: unknown }).cost !== undefined
  ) {
    playSelfUnitForCost(effect, ctx);
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
  // rule-id: unl-179-219 (rule 356.1.b) — "play a unit from your hand to your
  // base, ignoring its Energy cost": the hand is not a board zone, and the
  // destination and remaining (Power) cost are both fixed, so the controller
  // simply picks an affordable hand unit and it enters their base.
  if (
    from === "hand" &&
    toLocation === "base" &&
    (effect as { ignoreCost?: unknown }).ignoreCost !== undefined
  ) {
    playFromHandToBase(effect, ctx);
    return;
  }
  // rule-id: sfd-111-221 (rule 355.2 / 356.1.b) — "play a unit from hand to a
  // battlefield you control, reducing its cost by [3]": the destination is
  // restricted to the controller's own battlefields (never an enemy's), and a
  // reduction leaves the rest of the cost payable, so the play is charged here.
  if (from === "hand" && isControlledBattlefieldDest(toLocation)) {
    playFromHandToControlledBattlefield(effect, ctx);
    return;
  }
  // rule-id: sfd-024-221 (rules 355.10.a / 356.1.b.1) — "play an Equipment with
  // Energy cost no more than [2], ignoring its cost": the hand is not a board
  // zone, the destination of a gear play is always base (rule 143.1.a.1), and
  // "ignoring its cost" waives the whole printed cost, so the play resolves
  // here instead of parking a pending chain item that needs a location choice.
  if (
    from === "hand" &&
    toLocation === undefined &&
    isGearTargetDescriptor((effect as { target?: unknown }).target)
  ) {
    playGearFromHand(effect, ctx);
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
      offerAccelerateOnInstructedPlay(targetId, ctx);
    }
    return;
  }
  // rule-id: ven-066-166 (rule 354.2 / 355.2) — "Banish a unit, then its owner
  // plays it to the same location, ignoring its cost": like any effect-driven
  // play the card waits in banishment as a pending chain item (rule 354.3),
  // but its destination is fixed to the board zone it just left, so its owner
  // is never asked to choose. rule 358.3.a: when that location can't receive a
  // unit (sfd-216-221 Rockfall Path) the play is impossible and is skipped —
  // the banish stands and the unit stays in its owner's banishment.
  if (toLocation === "same") {
    const turnOrderSame = Object.keys(ctx.draft.players);
    for (const targetId of targets) {
      const dest = (
        ctx.cards.getCardMeta?.(targetId as CoreCardId) as { banishedFrom?: string } | undefined
      )?.banishedFrom;
      if (dest === undefined) {
        continue;
      }
      if (
        dest.startsWith("battlefield-") &&
        battlefieldForbidsUnitPlays(extractBattlefieldId(dest) ?? "")
      ) {
        continue;
      }
      const sameOwner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId;
      if (playerCannotPlay(ctx, sameOwner)) {
        continue;
      }
      ctx.draft.interaction = addToChain(
        ctx.draft.interaction ?? createInteractionState(),
        {
          cardId: targetId,
          controller: sameOwner,
          // rule 143.4: however it was played, the unit enters exhausted.
          effect: {
            effects: [
              { target: targetId, to: dest, type: "move" },
              { target: targetId, type: "exhaust" },
            ],
            type: "sequence",
          },
          triggered: true,
          type: "ability",
        },
        turnOrderSame,
      );
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
  // rule-id: unl-184-219 (rule 355.2.b) — `toLocation: { battlefield: "any" }`
  // ("plays it to any battlefield"): the effect makes every battlefield a legal
  // destination, so the base is not offered and controlled-only filtering does
  // not apply.
  const dest = toLocation === "base" ? "base" : isAnyBattlefieldDest(toLocation) ? "any-battlefield" : "choose";
  for (const targetId of targets) {
    const owner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId;
    if (playerCannotPlay(ctx, owner)) {
      continue;
    }
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
 * rule 135.2.e.5 — pay a flat `{energy, power[]}` cost out of the player's
 * pool. A `[rainbow]` pip is paid from whichever Domain has the most left;
 * pooled universal Power covers a named-Domain shortfall. Kept local so the
 * effect layer does not depend on the activated-ability move.
 */
function payFlatCost(
  ctx: EffectContext,
  cost: { energy?: number; power?: readonly string[] },
): boolean {
  const pool = ctx.draft.runePools[ctx.playerId];
  if (!pool) {
    return false;
  }
  const energy = cost.energy ?? 0;
  if (pool.energy < energy) {
    return false;
  }
  const power: Record<string, number> = {};
  for (const [d, v] of Object.entries(pool.power)) {
    if (typeof v === "number" && v > 0) {
      power[d] = v;
    }
  }
  for (const domain of cost.power ?? []) {
    const key =
      domain === "rainbow"
        ? Object.entries(power).sort(([, a], [, b]) => b - a)[0]?.[0]
        : (power[domain] ?? 0) > 0
          ? domain
          : (power.rainbow ?? 0) > 0
            ? "rainbow"
            : undefined;
    if (key === undefined || (power[key] ?? 0) <= 0) {
      return false;
    }
    power[key] = (power[key] ?? 0) - 1;
  }
  pool.energy -= energy;
  for (const domain of Object.keys(pool.power)) {
    (pool.power as Record<string, number>)[domain] = power[domain] ?? 0;
  }
  return true;
}

/**
 * rule-id: ogn-194-298 (rules 355.13 / 356.1.a / 355.2) — "you may play me for
 * [rainbow]": an optional self play for a stated ALTERNATIVE cost (the printed
 * cost is replaced, not added to), offered while the card sits outside the
 * board. Accepting pays exactly that cost and the unit enters its controller's
 * base, or a battlefield they control when there is a choice.
 */
function playSelfUnitForCost(effect: ExecutableEffect, ctx: EffectContext): void {
  const cardId = ctx.sourceCardId;
  if (playerCannotPlay(ctx, ctx.playerId)) {
    return;
  }
  const cost = ((effect as { cost?: { energy?: number; power?: readonly string[] } }).cost ??
    {}) as { energy?: number; power?: readonly string[] };
  if ((effect as { optional?: unknown }).optional === true) {
    if (ctx.draft.pendingChoice) {
      return;
    }
    // Rule 355.8: never offer a play the controller could not pay for.
    const pool = ctx.draft.runePools[ctx.playerId];
    if (!pool || pool.energy < (cost.energy ?? 0)) {
      return;
    }
    const pips = (cost.power ?? []).length;
    const available = Object.values(pool.power).reduce<number>(
      (a, b) => a + (typeof b === "number" ? b : 0),
      0,
    );
    if (available < pips) {
      return;
    }
    ctx.draft.pendingChoice = {
      effect: { ...(effect as object), optional: false },
      playerId: ctx.playerId,
      sourceCardId: cardId,
      type: "confirm",
      // biome-ignore lint/suspicious/noExplicitAny: branded id types
    } as any;
    return;
  }
  if (!payFlatCost(ctx, cost)) {
    return;
  }
  const destinations = ["base", ...controlledBattlefieldZones(ctx)];
  if (destinations.length === 1) {
    enterUnitFromEffect(cardId, "base", ctx);
    return;
  }
  ctx.draft.pendingChoice = {
    cardId,
    options: destinations,
    playerId: ctx.playerId,
    sourceCardId: cardId,
    type: "choose-destination",
  } as typeof ctx.draft.pendingChoice;
}

/**
 * rule 355.1.a / 356.1.b.3 — ignoring a card's cost only waives the cost it
 * HAS: an optional additional cost such as [Accelerate] is still the playing
 * player's to elect and to pay in full. The unit has already entered (it is on
 * the board exhausted); accepting the prompt charges the Accelerate cost and
 * readies it (rule 356.2.b.1). The prompt is only raised when the cost is
 * actually payable, so a player who cannot pay is never asked.
 */
function offerAccelerateOnInstructedPlay(cardId: string, ctx: EffectContext): void {
  if (ctx.draft.pendingChoice) {
    return;
  }
  const optional = getOptionalPlayCost(cardId);
  if (optional?.kind !== "accelerate") {
    return;
  }
  const cost = { energy: optional.cost?.energy ?? 0, power: [...(optional.cost?.power ?? [])] };
  const pool = ctx.draft.runePools[ctx.playerId];
  if (!pool || pool.energy < cost.energy) {
    return;
  }
  const needed: Record<string, number> = {};
  for (const domain of cost.power) {
    needed[domain] = (needed[domain] ?? 0) + 1;
  }
  for (const [domain, count] of Object.entries(needed)) {
    if ((pool.power[domain as keyof typeof pool.power] ?? 0) < count) {
      return;
    }
  }
  ctx.draft.pendingChoice = {
    acceleratePlay: { cardId, cost, readyOnly: true },
    playerId: ctx.playerId,
    // rule 356.2.b.1 — accepting charges `optInCost` and then runs the
    // resolved effect: the unit that already entered flips to ready.
    resolved: {
      cardId,
      controller: ctx.playerId,
      effect: { target: cardId, type: "ready" },
      optInCost: cost,
      triggered: true,
      type: "ability",
    },
    sourceCardId: ctx.sourceCardId,
    type: "opt-in",
  } as NonNullable<EffectContext["draft"]["pendingChoice"]>;
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
  if (
    typeof raw === "object" &&
    raw !== null &&
    (raw as { might?: unknown }).might === "recycled" &&
    ctx.triggerSourceId !== undefined
  ) {
    // The recycled card already left the board, so its board state is gone —
    // its printed Might is the Might it had when it paid the cost.
    return Math.max(0, getGlobalCardRegistry().getMight(ctx.triggerSourceId));
  }
  return 0;
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
  // rule 356.4 (rule-id: sfd-026-221) — "Reduce its Energy cost by the Might of
  // the unit you recycled": the discount is only known once the cost has been
  // paid, so it is read from the recycled card (this effect's trigger source).
  const energyReduction = trashPlayEnergyReduction(effect, ctx);
  const extras: CostExtras =
    ignoreCost === true
      ? { ignoreBaseCost: true }
      : ignoreCost === "energy"
        ? { ignoreEnergyCost: true }
        : energyReduction > 0
          ? { additionalCost: { energy: -energyReduction } }
          : {};
  const trash = ctx.zones.getCardsInZone(
    "trash" as CoreZoneId,
    ctx.playerId as CorePlayerId,
  ) as readonly string[];
  // rule 206 (ogn-226-298): "a unit costing no more than [3] and no more than
  // [rainbow]" — printed-cost bounds on the descriptor gate the candidates.
  const costFilters = Array.isArray((target as { filter?: unknown } | undefined)?.filter)
    ? ((target as { filter: readonly unknown[] }).filter as readonly unknown[])
    : (target as { filter?: unknown } | undefined)?.filter !== undefined
      ? [(target as { filter: unknown }).filter]
      : [];
  const candidates = trash.filter((id) => {
    const cardType = registry.getCardType(id);
    if (target?.type && target.type !== "card" && target.type !== cardType) {
      return false;
    }
    if (!costFilters.every((f) => matchesPrintedCostFilter(id, f, ctx))) {
      return false;
    }
    // rule-id: sfd-026-221 (rule 355.8) — "play a MECH from your trash": a tag
    // bound on the descriptor gates the candidates too.
    if (!costFilters.every((f) => matchesCardTagFilter(id, f))) {
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
        playFrom: "trash",
        playIgnoreEnergy: extras.ignoreEnergyCost === true,
        playIgnoreCost: extras.ignoreBaseCost === true,
        // rule 356.4 (rule-id: sfd-026-221) — the discount survives the pick.
        playEnergyReduction: energyReduction,
        // rule-id: ogn-112-298 (rule 594) — "Then recycle it": a spell played
        // from the trash goes to the bottom of its owner's Main Deck instead of
        // back to the trash when it finishes resolving.
        playRecycleAfter: (effect as { recycleAfter?: unknown }).recycleAfter === true,
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
    return;
  }
  if (registry.getCardType(chosen) === "spell") {
    castSpellFromTrash(
      chosen,
      ctx.playerId,
      (effect as { recycleAfter?: unknown }).recycleAfter === true,
      ctx,
    );
  }
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
  const spellEffect = (getGlobalCardRegistry().getAbilities(cardId) ?? []).find(
    (a) => a.type === "spell",
  )?.effect;
  bag.zones.moveCard({ cardId: cardId as CoreCardId, targetZoneId: "chain" as CoreZoneId });
  bag.draft.interaction = addToChain(
    bag.draft.interaction ?? createInteractionState(),
    {
      cardId,
      controller: playerId,
      effect: spellEffect,
      resolveTo: recycleAfter ? "mainDeck" : "trash",
      type: "spell",
    },
    Object.keys(bag.draft.players),
  );
  // Rule 724 (Legion): a card played by an effect still counts as played.
  if (bag.draft.cardsPlayedThisTurn) {
    bag.draft.cardsPlayedThisTurn[playerId] = (bag.draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
  }
}

/**
 * rule-id: unl-179-219 — "play a unit from your hand to your base, ignoring
 * its Energy cost. (You must still pay its Power cost.)". Rule 355.8: only
 * hand cards whose remaining cost the controller can pay are legal choices;
 * rule 355.10: the choice is theirs alone, so it is offered even with one
 * candidate.
 */
function playFromHandToBase(effect: ExecutableEffect, ctx: EffectContext): void {
  const ignoreCost = (effect as { ignoreCost?: unknown }).ignoreCost;
  const extras: CostExtras = ignoreCost === true ? { ignoreBaseCost: true } : { ignoreEnergyCost: true };
  const candidates = playCandidatesFromHand(effect, ctx).filter((id) =>
    canAffordCard(ctx.draft, ctx.playerId, id, extras, ctx.cards.getCardMeta),
  );
  // The prompt hands the pick back through `then` as the trigger source.
  const fromPick = (effect as { pickedFromPrompt?: boolean }).pickedFromPrompt
    ? ctx.triggerSourceId
    : undefined;
  let chosen = [fromPick, ...(ctx.boundTargets ?? [])].find(
    (id): id is string => id !== undefined && candidates.includes(id),
  );
  if (chosen === undefined) {
    if (candidates.length === 0 || ctx.draft.pendingChoice) {
      return;
    }
    // The pick itself does nothing (the card is already in hand); the play
    // happens in `then`, which receives the picked card as its trigger source.
    ctx.draft.pendingChoice = {
      onPicked: "draw",
      optional: true,
      prompter: ctx.playerId,
      remaining: 1,
      revealed: [...candidates],
      revealer: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      then: { ...(effect as object), pickedFromPrompt: true },
      type: "reveal-and-pick",
    } as typeof ctx.draft.pendingChoice;
    return;
  }
  deductCost(ctx.draft, ctx.playerId, chosen, extras, ctx.cards.getCardMeta);
  enterUnitFromEffect(chosen, "base", ctx);
}

/** rule-id: sfd-111-221 — `toLocation: { battlefield: "controlled" }`. */
function isControlledBattlefieldDest(toLocation: unknown): boolean {
  return (
    typeof toLocation === "object" &&
    toLocation !== null &&
    (toLocation as { battlefield?: unknown }).battlefield === "controlled"
  );
}

/** rule-id: unl-184-219 (rule 355.2.b) — `toLocation: { battlefield: "any" }`. */
function isAnyBattlefieldDest(toLocation: unknown): boolean {
  return (
    typeof toLocation === "object" &&
    toLocation !== null &&
    (toLocation as { battlefield?: unknown }).battlefield === "any"
  );
}

/**
 * rule 355.2 (rule-id: sfd-111-221) — the battlefield zones the effect's
 * controller currently controls and that can legally receive a unit play.
 */
function controlledBattlefieldZones(ctx: EffectContext): string[] {
  const battlefields =
    (ctx.draft as { battlefields?: Record<string, { controller?: string | null }> }).battlefields ?? {};
  return Object.entries(battlefields)
    .filter(([id, bf]) => bf?.controller === ctx.playerId && !battlefieldForbidsUnitPlays(id))
    .map(([id]) => `battlefield-${id}`);
}

/**
 * rule-id: sfd-111-221 — "You may play a unit from hand to a battlefield you
 * control, reducing its cost by [3]". Rule 355.10.a: the hand is not a board
 * zone, so the controller picks the unit as this effect resolves; rule 356.1.b:
 * the reduction only discounts the Energy component, the rest is still paid;
 * rule 355.2: the destination is limited to their own battlefields, and is
 * prompted for only when more than one qualifies.
 */
function playFromHandToControlledBattlefield(effect: ExecutableEffect, ctx: EffectContext): void {
  if (playerCannotPlay(ctx, ctx.playerId)) {
    return;
  }
  const destinations = controlledBattlefieldZones(ctx);
  if (destinations.length === 0) {
    return;
  }
  const reduce = (effect as { reduceCost?: { energy?: number } }).reduceCost;
  const extras: CostExtras =
    reduce?.energy !== undefined ? { additionalCost: { energy: -reduce.energy } } : {};
  const candidates = playCandidatesFromHand(effect, ctx).filter(
    (id) =>
      getGlobalCardRegistry().getCardType(id) === "unit" &&
      canAffordCard(ctx.draft, ctx.playerId, id, extras, ctx.cards.getCardMeta),
  );
  // The prompt hands the pick back through `then` as the trigger source.
  const fromPick = (effect as { pickedFromPrompt?: boolean }).pickedFromPrompt
    ? ctx.triggerSourceId
    : undefined;
  const chosen = [fromPick, ...(ctx.boundTargets ?? [])].find(
    (id): id is string => id !== undefined && candidates.includes(id),
  );
  if (chosen === undefined) {
    if (candidates.length === 0 || ctx.draft.pendingChoice) {
      return;
    }
    // The pick itself does nothing (the card is already in hand); the play
    // happens in `then`, which receives the picked card as its trigger source.
    ctx.draft.pendingChoice = {
      onPicked: "draw",
      optional: true,
      prompter: ctx.playerId,
      remaining: 1,
      revealed: [...candidates],
      revealer: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      then: { ...(effect as object), pickedFromPrompt: true },
      type: "reveal-and-pick",
    } as typeof ctx.draft.pendingChoice;
    return;
  }
  deductCost(ctx.draft, ctx.playerId, chosen, extras, ctx.cards.getCardMeta);
  if (destinations.length === 1) {
    enterUnitFromEffect(chosen, destinations[0] as string, ctx);
    return;
  }
  // rule 355.2: more than one controlled battlefield — the controller chooses.
  // The choose-destination branch of `pending-choice.ts` finalizes the play
  // (exhaust, play-self / play-card triggers) for a card entering from hand.
  ctx.draft.pendingChoice = {
    cardId: chosen,
    options: destinations,
    playerId: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    type: "choose-destination",
  } as typeof ctx.draft.pendingChoice;
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

/** rule-id: sfd-024-221 — a target descriptor naming an Equipment/gear card. */
function isGearTargetDescriptor(target: unknown): boolean {
  const type = (target as { type?: unknown } | undefined)?.type;
  return type === "equipment" || type === "gear";
}

/**
 * rule-id: sfd-024-221 (rules 355.10.a / 356.1.b.1 / 143.1.a.1) — "play an
 * Equipment … ignoring its cost" from hand. The controller picks one of the
 * eligible cards as the effect resolves; the gear enters their base and the id
 * is reported back through `playedSink` so an enclosing sequence's
 * `pendingValue` ("Attach it to me") can bind the card that was actually played.
 */
function playGearFromHand(effect: ExecutableEffect, ctx: EffectContext): void {
  if (playerCannotPlay(ctx, ctx.playerId)) {
    return;
  }
  const ignoreCost = (effect as { ignoreCost?: unknown }).ignoreCost;
  const extras: CostExtras =
    ignoreCost === true
      ? { ignoreBaseCost: true }
      : ignoreCost === "energy"
        ? { ignoreEnergyCost: true }
        : {};
  const candidates = playCandidatesFromHand(effect, ctx).filter((id) =>
    canAffordCard(ctx.draft, ctx.playerId, id, extras, ctx.cards.getCardMeta),
  );
  const chosen =
    ctx.boundTargets?.find((id) => candidates.includes(id)) ??
    (candidates.length === 1 ? candidates[0] : undefined);
  if (chosen === undefined) {
    if (candidates.length > 1 && !ctx.draft.pendingChoice) {
      ctx.draft.pendingChoice = {
        effect,
        options: candidates,
        playerId: ctx.playerId,
        remaining: 1,
        sourceCardId: ctx.sourceCardId,
        type: "choose-target",
      };
    }
    return;
  }
  deductCost(ctx.draft, ctx.playerId, chosen, extras, ctx.cards.getCardMeta);
  enterGearFromEffect(chosen, ctx);
  const sink = (ctx as { playedSink?: { ids: string[] } }).playedSink;
  sink?.ids.push(chosen);
}

/**
 * rule 143.1.a.1 — gear played by an effect enters its controller's base ready
 * (rule 143.4 exhausts units only), firing its play triggers and counting
 * toward this turn's plays (rule 724), mirroring the playGear reducer.
 */
function enterGearFromEffect(cardId: string, ctx: EffectContext): void {
  ctx.zones.moveCard({ cardId: cardId as CoreCardId, targetZoneId: "base" as CoreZoneId });
  if (hasStaticEffect(cardId, "enters-exhausted")) {
    ctx.counters.setFlag(cardId as CoreCardId, "exhausted", true);
  }
  const owner = ctx.cards.getCardOwner(cardId as CoreCardId) ?? ctx.playerId;
  ctx.fireTriggers?.({ cardId, paidAdditionalCost: false, playerId: owner, type: "play-self" });
  ctx.fireTriggers?.({ cardId, cardType: "gear", playerId: owner, type: "play-card" });
  if (ctx.draft.cardsPlayedThisTurn) {
    ctx.draft.cardsPlayedThisTurn[owner] = (ctx.draft.cardsPlayedThisTurn[owner] ?? 0) + 1;
  }
}

/**
 * rule-id: ogn-107-298 — a unit played by an effect to a fixed location,
 * ignoring its cost, enters the board there: exhausted (rule 143.4), firing
 * its play triggers and counting toward this turn's plays (rule 724),
 * mirroring the playUnit reducer.
 */
export function enterUnitFromEffect(cardId: string, zoneId: string, ctx: EffectContext): void {
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
  // rule 143.4: a unit entering the board is exhausted however it was played,
  // unless a static "I enter ready" applies (rule-id: ven-013-166 — its
  // condition is checked here, after the card has left its origin zone).
  if (!staticEnterReadyApplies(cardId, ctx.draft, ctx.playerId, ctx.zones)) {
    ctx.counters.setFlag(cardId as CoreCardId, "exhausted", true);
  }
  const owner = ctx.cards.getCardOwner(cardId as CoreCardId) ?? ctx.playerId;
  ctx.fireTriggers?.({ cardId, paidAdditionalCost: false, playerId: owner, type: "play-self" });
  ctx.fireTriggers?.({ cardId, cardType: "unit", playerId: owner, type: "play-card" });
  if (ctx.draft.cardsPlayedThisTurn) {
    ctx.draft.cardsPlayedThisTurn[owner] = (ctx.draft.cardsPlayedThisTurn[owner] ?? 0) + 1;
  }
}
