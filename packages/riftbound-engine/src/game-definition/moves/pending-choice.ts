/**
 * Pending-choice moves.
 *
 * Handles the "opponent reveals their hand, active player picks a card"
 * flow used by Sabotage, Mindsplitter, and Ashe Focused.
 *
 * A `reveal-hand` effect places a `PendingChoice` on the game state and
 * pauses play. `resolvePendingChoice` is the only legal move while the
 * choice is pending; it validates the pick against the filter, applies
 * the stored effect (recycle / banish / discard), and clears the state.
 */

import type { CardId as CoreCardId, ZoneId as CoreZoneId, GameMoveDefinitions } from "@tcg/core";
import { executeEffect } from "../../abilities/effect-executor";
import type { EffectContext, ExecutableEffect } from "../../abilities/effect-executor";
import { markContestedOnArrival } from "../../abilities/effects/move";
import { contestBattlefieldOnArrival } from "./movement/contest-arrival";
import { resolveTarget } from "../../abilities/target-resolver";
import { fireTriggers } from "../../abilities/trigger-runner";
import { addToChain, createInteractionState } from "../../chain";
import { cleanupAndFireDeaths } from "../../cleanup/post-move-cleanup";
import type { PostMoveCleanupContext } from "../../cleanup/post-move-cleanup";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type {
  PendingChoice,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../types";
import { buildEffectContext, executeResolvedItem } from "./chain-moves";
import { deductAbilityCost } from "./chain/activate-ability";
import { canAffordPower } from "./chain/effect-context";
import { getCardEffectiveMight, getOptionalPlayCost, staticEnterReadyApplies } from "./play/cost";
import { isLegalMultiTargetSet } from "./play/targeting";

const isBoardZone = (z: string): boolean => z === "base" || z.startsWith("battlefield-");

/**
 * rule 355.10 (sfd-039-221 Royal Entourage) — a modal ability's target belongs
 * to the CHOSEN mode ("ready or exhaust a legend"), so it is declared right
 * after the mode is picked. With two or more legal candidates the controller
 * must choose; a single candidate binds itself and zero candidates fizzle.
 * Returns true when a `choose-target` prompt was raised.
 */
function liftModalTarget(
  draft: RiftboundGameState,
  choice: { sourceCardId: string; playerId: string; controllerId?: string },
  effect: ExecutableEffect,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): boolean {
  const target = (effect as { target?: unknown }).target;
  if (
    typeof target !== "object" ||
    target === null ||
    typeof (target as { type?: unknown }).type !== "string"
  ) {
    return false;
  }
  const t = target as { type: string; quantity?: unknown };
  if (
    t.type === "self" ||
    t.type === "trigger-source" ||
    t.type === "player" ||
    t.type === "battlefield" ||
    t.quantity === "all"
  ) {
    return false;
  }
  const controller = choice.controllerId ?? choice.playerId;
  const options = resolveTarget({ ...t, quantity: "all" }, {
    cards: context.cards,
    choosing: true,
    draft,
    playerId: controller,
    sourceCardId: choice.sourceCardId,
    sourceZone: context.zones.getCardZone(choice.sourceCardId as CoreCardId),
    zones: context.zones,
  } as Parameters<typeof resolveTarget>[1]);
  if (options.length < 2) {
    return false;
  }
  draft.pendingChoice = {
    effect,
    options,
    playerId: controller,
    remaining: 1,
    sourceCardId: choice.sourceCardId,
    type: "choose-target",
  };
  return true;
}

/**
 * rule 355.14.c/f/g (ogn-041-298): a split-damage allocation is legal when
 * every keyed id is an option, each amount is a positive integer, at most
 * `total` targets are named, and the amounts sum to exactly `total` (or no
 * target is named at all — "any number of" includes zero).
 */
function isLegalSplitAllocation(
  options: readonly string[],
  total: number,
  allocation: unknown,
): allocation is Record<string, number> {
  if (!allocation || typeof allocation !== "object") return false;
  const entries = Object.entries(allocation as Record<string, unknown>).filter(
    ([, v]) => v !== 0,
  );
  let sum = 0;
  for (const [id, v] of entries) {
    if (!options.includes(id)) return false;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1) return false;
    sum += v;
  }
  if (entries.length === 0) return true;
  return entries.length <= total && sum === total;
}

/** rule 355.14 (ogn-041-298): every legal split of `total` over subsets of `options` (capped). */
function enumerateSplitAllocations(
  options: readonly string[],
  total: number,
  cap = 500,
): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  const walk = (idx: number, remaining: number, acc: Record<string, number>): void => {
    if (out.length >= cap) return;
    if (idx === options.length) {
      if (remaining === 0) out.push({ ...acc });
      return;
    }
    const id = options[idx] as string;
    // skip this option
    walk(idx + 1, remaining, acc);
    for (let k = 1; k <= remaining; k++) {
      acc[id] = k;
      walk(idx + 1, remaining - k, acc);
      delete acc[id];
    }
  };
  walk(0, total, {});
  // most-concentrated splits first so a lone target taking everything leads
  out.sort((a, b) => Object.keys(a).length - Object.keys(b).length);
  out.push({});
  return out;
}

/**
 * rule-id: sfd-109-221 (rule 356.1.b.3 / 560) — a pending "play it, ignoring
 * its cost" finalized via choose-destination is still a play: the unit's
 * optional "you may pay X as an additional cost" may be paid. Returns that
 * cost when `choice` is such a play (card entering the board from off-board)
 * and its controller can pay it from their pool right now.
 */
function pendingPlayOptionalCost(
  state: RiftboundGameState,
  choice: PendingChoice,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): { energy: number; power: readonly string[] } | undefined {
  if (choice.type !== "choose-destination" || choice.created) {
    return undefined;
  }
  const from = context.zones?.getCardZone?.(choice.cardId as CoreCardId) as string | undefined;
  if (from === undefined || isBoardZone(from)) {
    return undefined;
  }
  const optional = getOptionalPlayCost(choice.cardId as string);
  if (optional?.kind !== "pay" || (optional.cost?.xp ?? 0) > 0) {
    return undefined;
  }
  const cost = { energy: optional.cost?.energy ?? 0, power: optional.cost?.power ?? [] };
  return canPayOptInCost(state, choice.playerId, choice.cardId as string, cost, {
    counters: context.counters ?? {},
  })
    ? cost
    : undefined;
}

/**
 * rule-id: ogn-063-298 — a picked choice's effect (e.g. a buff) can change
 * what a static ability grants ("friendly buffed units have [Deflect]"), so
 * static recalc + SBA must run after it executes, same as after a chain
 * resolve. Guarded so unit-test stubs without full context bags don't crash.
 */
function postChoiceCleanup(draft: RiftboundGameState, context: unknown): void {
  const ctx = context as Partial<PostMoveCleanupContext> | undefined;
  if (ctx?.cards && ctx?.counters && ctx?.zones && typeof ctx.zones.getCardsInZone === "function") {
    cleanupAndFireDeaths(draft, ctx as PostMoveCleanupContext);
  }
}

/** rule-id: sfd-119-221 — the pay-cost carried on an opt-in choice's chain item. */
function optInCostOf(choice: PendingChoice): Record<string, unknown> | undefined {
  if (choice.type !== "opt-in") {
    return undefined;
  }
  const cost = (choice.resolved as { optInCost?: unknown } | undefined)?.optInCost;
  return cost && typeof cost === "object" ? (cost as Record<string, unknown>) : undefined;
}

/**
 * rule-id: sfd-119-221 — whether `playerId` can pay a "you may pay [N] to …"
 * trigger's cost right now (energy, power pips, and [Exhaust] on the source).
 */
function canPayOptInCost(
  state: RiftboundGameState,
  playerId: string,
  sourceCardId: string,
  cost: Record<string, unknown>,
  context: { counters: { getFlag?: (cardId: CoreCardId, flag: string) => boolean | undefined } },
): boolean {
  const pool = state.runePools[playerId];
  if (!pool) {
    return false;
  }
  const energyCost = (cost.energy as number) ?? 0;
  if (pool.energy < energyCost) {
    return false;
  }
  const powerCost = cost.power as string[] | undefined;
  if (powerCost && powerCost.length > 0) {
    const needed: Record<string, number> = {};
    for (const d of powerCost) {
      needed[d] = (needed[d] ?? 0) + 1;
    }
    if (!canAffordPower(pool.power, needed)) {
      return false;
    }
  }
  if (cost.exhaust === true && context.counters.getFlag?.(sourceCardId as CoreCardId, "exhausted")) {
    return false;
  }
  return true;
}

/**
 * rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost
 * Rule 821.1.c: Weaponmaster pays the chosen Equipment's Equip cost reduced
 * by [A] (one power of any domain); the non-power portion is still paid
 * (821.1.c.3). No Equip ability → the cost can't be paid (821.1.c.4).
 */
export function weaponmasterEquipCost(equipmentId: string): Record<string, unknown> | undefined {
  const abilities = getGlobalCardRegistry().getAbilities(equipmentId) ?? [];
  const equipAbility = abilities.find(
    (a) => a.type === "keyword" && (a as { keyword?: string }).keyword === "Equip",
  ) as { cost?: { energy?: number; power?: readonly string[] } } | undefined;
  if (!equipAbility) {
    return undefined;
  }
  const power = [...(equipAbility.cost?.power ?? [])];
  if (power.length > 0) {
    const rainbowIdx = power.indexOf("rainbow");
    power.splice(rainbowIdx === -1 ? 0 : rainbowIdx, 1);
  }
  return { energy: equipAbility.cost?.energy ?? 0, power };
}

/** rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost — 821.1.c.5 payability gate. */
function canPayWeaponmasterEquip(
  state: RiftboundGameState,
  playerId: string,
  equipmentId: string,
  context: Parameters<typeof canPayOptInCost>[4],
): boolean {
  const cost = weaponmasterEquipCost(equipmentId);
  return cost !== undefined && canPayOptInCost(state, playerId, equipmentId, cost, context);
}

/**
 * Returns true when the given card ID is a valid pick for the pending
 * choice (i.e., is in the revealed snapshot and passes the filter).
 */
export function isValidPendingPick(choice: PendingChoice, cardId: string): boolean {
  if (choice.type !== "reveal-and-pick") {
    return false;
  }
  if (!choice.revealed.includes(cardId)) {
    return false;
  }
  const excluded = choice.filter?.excludeCardTypes;
  if (excluded && excluded.length > 0) {
    const def = getGlobalCardRegistry().get(cardId);
    const cardType = def?.cardType;
    if (cardType && excluded.includes(cardType)) {
      return false;
    }
  }
  // rule-id: ogn-242-298 — "a unit … that has Might up to 1 more than the
  // killed unit": a Might ceiling on the pick, read from printed Might.
  const maxMight = choice.filter?.maxMight;
  if (typeof maxMight === "number") {
    if (getGlobalCardRegistry().getMight(cardId) > maxMight) {
      return false;
    }
  }
  return true;
}

/**
 * Pick a default (goldfish) card for the choice: the first revealed card
 * that passes the filter. Returns undefined if no valid pick exists.
 */
export function pickDefaultForChoice(choice: PendingChoice): string | number | undefined {
  if (choice.type === "name-card") {
    return choice.options[0];
  }
  if (choice.type === "choose-target" || choice.type === "choose-destination") {
    return choice.options[0];
  }
  if (choice.type === "choose-mode") {
    return choice.options[0];
  }
  if (choice.type === "opt-in") {
    return undefined;
  }
  // rule 444.2 (ogn-268-298): paying 0 is always legal, so goldfish pays nothing.
  if (choice.type === "pay-x") {
    return 0;
  }
  if (choice.type === "weaponmaster-equip") {
    return undefined;
  }
  return choice.revealed.find((id) => isValidPendingPick(choice, id));
}

/**
 * Returns the target zone a picked card is moved to based on the stored
 * `onPicked` action.
 */
function onPickedTargetZone(
  action: "recycle" | "banish" | "discard" | "draw" | "play",
): CoreZoneId {
  switch (action) {
    case "recycle": {
      return "mainDeck" as CoreZoneId;
    }
    // rule-id: ogn-062-298-look-banish-play — "banish … then play it": the
    // pick goes to banishment first; the play is added to the chain after.
    case "play":
    case "banish": {
      return "banishment" as CoreZoneId;
    }
    case "discard": {
      return "trash" as CoreZoneId;
    }
    case "draw": {
      return "hand" as CoreZoneId;
    }
  }
}

/**
 * rule-id: ogn-235-298 — emit one `recycle` event per batch of cards a player
 * recycles to the Main Deck so "When you recycle one or more cards to your
 * Main Deck" triggers (Karma, Channeler) fire. Guarded so unit-test stubs that
 * omit the full zone bag don't crash.
 */
function fireRecycleEvent(
  draft: RiftboundGameState,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
  playerId: string,
  cardIds: readonly string[],
): void {
  if (typeof context.zones?.getCardsInZone !== "function" || !context.cards) {
    return;
  }
  // "to YOUR Main Deck": only cards that went to the recycler's own deck count.
  const own = cardIds.filter(
    (id) => (context.cards.getCardOwner?.(id as CoreCardId) ?? playerId) === playerId,
  );
  if (own.length === 0) {
    return;
  }
  fireTriggers(
    { cardIds: own, playerId, type: "recycle" },
    { cards: context.cards, counters: context.counters, draft, zones: context.zones },
  );
}

export const pendingChoiceMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  resolvePendingChoice: {
    condition: (state, context) => {
      const choice = state.pendingChoice;
      if (!choice) {
        return false;
      }
      if (choice.type === "weaponmaster-equip") {
        // rule-id: ven-041-166-weaponmaster-on-play-equip
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        if (context.params.accept === false) {
          return true;
        }
        const pickedEquip = context.params.pickedCardId as string;
        // rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost (821.1.c.5)
        return (
          choice.options.includes(pickedEquip) &&
          canPayWeaponmasterEquip(state, choice.playerId, pickedEquip, context)
        );
      }
      if (choice.type === "pay-x") {
        // rule 204.3.b / 444.1 (ogn-268-298): X is Power paid at resolution.
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        const x = context.params.xAmount;
        if (typeof x !== "number" || !Number.isInteger(x) || x < 0) {
          return false;
        }
        return canAffordPower(state.runePools[choice.playerId]?.power ?? {}, { rainbow: x });
      }
      if (choice.type === "opt-in") {
        // Rule 583 (unl-021-219): controller may accept or decline.
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        if (typeof context.params.accept !== "boolean") {
          return false;
        }
        // rule-id: sfd-119-221 — accepting a "you may pay [N] to …" trigger
        // is only legal when the cost is payable.
        if (context.params.accept === true) {
          const cost = optInCostOf(choice);
          if (cost && !canPayOptInCost(state, choice.playerId, choice.sourceCardId, cost, context)) {
            return false;
          }
        }
        return true;
      }
      if (choice.type === "choose-mode") {
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        return choice.options.includes(context.params.pickedMode as number);
      }
      if (choice.type === "choose-target") {
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        // rule-id: ogn-256-298 (rule 355.13) — "any number of": declining
        // further picks is always legal.
        if (choice.anyNumber && context.params.accept === false) {
          return true;
        }
        // rule 355.13 (ogn-141-298): "up to N" / "any number of" targets may
        // be answered with several distinct picks at once, capped at N.
        const multiTargets = context.params.pickedCardIds as string[] | undefined;
        if (Array.isArray(multiTargets)) {
          if (!choice.anyNumber || multiTargets.length === 0) {
            return false;
          }
          if (new Set(multiTargets).size !== multiTargets.length) {
            return false;
          }
          const cap = choice.maxPicks ?? choice.options.length;
          if (multiTargets.length + (choice.picked?.length ?? 0) > cap) {
            return false;
          }
          return multiTargets.every((id) => choice.options.includes(id));
        }
        // rule 355.14.e (ogn-041-298): fixed-total split is answered with one allocation.
        if (choice.assign && typeof choice.total === "number") {
          return isLegalSplitAllocation(choice.options, choice.total, context.params.allocation);
        }
        return choice.options.includes(context.params.pickedCardId as string);
      }
      if (choice.type === "choose-destination") {
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        // rule-id: sfd-109-221 (rule 356.1.b.3) — paying the optional
        // additional cost on a pending play is only legal when payable.
        if (
          context.params.paidAdditionalCost === true &&
          !pendingPlayOptionalCost(state, choice, context)
        ) {
          return false;
        }
        return choice.options.includes(context.params.pickedZoneId as string);
      }
      if (choice.prompter !== context.params.playerId) {
        return false;
      }
      if (choice.type === "name-card") {
        // Rule 762: any legal card name is valid; the enumerated `options`
        // are the names known to this game's registry.
        const name = context.params.pickedName;
        return typeof name === "string" && choice.options.includes(name);
      }
      // rule-id: ogn-235-298-vision-optional-recycle
      if (choice.optional && context.params.accept === false) {
        return true;
      }
      // rule 422.1.a (ogn-030-298): a multi-pick prompt may be answered with
      // up to `remaining` distinct valid picks at once.
      const multi = context.params.pickedCardIds as string[] | undefined;
      if (Array.isArray(multi)) {
        if (choice.onPicked === "play" || multi.length === 0 || multi.length > (choice.remaining ?? 1)) {
          return false;
        }
        if (new Set(multi).size !== multi.length) {
          return false;
        }
        return multi.every((id) => isValidPendingPick(choice, id));
      }
      return isValidPendingPick(choice, context.params.pickedCardId as string);
    },
    enumerator: (state, context) => {
      const choice = state.pendingChoice;
      if (!choice) {
        return [];
      }
      if (choice.type === "weaponmaster-equip") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        // rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost — only
        // offer equipment whose reduced Equip cost is payable (821.1.c.5).
        return [
          ...choice.options
            .filter((eq) => canPayWeaponmasterEquip(state, choice.playerId, eq, context))
            .map((eq) => ({
              pickedCardId: eq,
              playerId: context.playerId as string,
            })),
          { accept: false, playerId: context.playerId as string },
        ];
      }
      if (choice.type === "pay-x") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        const pool = choice.playerId ? (state.runePools[choice.playerId]?.power ?? {}) : {};
        const max = Object.values(pool).reduce<number>((a, b) => a + (b ?? 0), 0);
        return Array.from({ length: max + 1 }, (_, x) => ({
          playerId: context.playerId as string,
          xAmount: x,
        }));
      }
      if (choice.type === "opt-in") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        // rule-id: sfd-119-221 — only offer "accept" when the pay-cost is payable.
        const cost = optInCostOf(choice);
        const canAccept =
          !cost || canPayOptInCost(state, choice.playerId, choice.sourceCardId, cost, context);
        return [
          ...(canAccept ? [{ accept: true, playerId: context.playerId as string }] : []),
          { accept: false, playerId: context.playerId as string },
        ];
      }
      if (choice.type === "choose-mode") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        return choice.options.map((idx) => ({
          pickedMode: idx,
          playerId: context.playerId as string,
        }));
      }
      if (choice.type === "choose-target") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        // rule 355.14.e (ogn-041-298): fixed-total split → one move per legal allocation.
        if (choice.assign && typeof choice.total === "number") {
          return enumerateSplitAllocations(choice.options, choice.total).map((allocation) => ({
            allocation,
            playerId: context.playerId as string,
          }));
        }
        const picks: { playerId: string; pickedCardId?: string; accept?: boolean }[] =
          choice.options.map((cardId) => ({
            pickedCardId: cardId,
            playerId: context.playerId as string,
          }));
        // rule-id: ogn-256-298 (rule 355.13) — "any number of": offer "done".
        if (choice.anyNumber) {
          picks.push({ accept: false, playerId: context.playerId as string });
        }
        return picks;
      }
      if (choice.type === "choose-destination") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        // rule-id: sfd-109-221 (rule 356.1.b.3 / 560) — a pending "play it,
        // ignoring its cost" still offers the unit's optional additional cost.
        const payable = pendingPlayOptionalCost(state, choice, context) !== undefined;
        return choice.options.flatMap((zoneId) => [
          { pickedZoneId: zoneId, playerId: context.playerId as string },
          ...(payable
            ? [{ paidAdditionalCost: true, pickedZoneId: zoneId, playerId: context.playerId as string }]
            : []),
        ]);
      }
      if (choice.prompter !== (context.playerId as string)) {
        return [];
      }
      if (choice.type === "name-card") {
        return choice.options.map((name) => ({
          pickedName: name,
          playerId: context.playerId as string,
        }));
      }
      const results: { playerId: string; pickedCardId?: string; accept?: boolean }[] = [];
      for (const cardId of choice.revealed) {
        if (isValidPendingPick(choice, cardId)) {
          results.push({
            pickedCardId: cardId,
            playerId: context.playerId as string,
          });
        }
      }
      // rule-id: ogn-235-298-vision-optional-recycle — "You may recycle it"
      // must offer a decline path that leaves the card on top.
      if (choice.optional) {
        results.push({ accept: false, playerId: context.playerId as string });
      }
      return results;
    },
    reducer: (draft, context) => {
      const choice = draft.pendingChoice;
      if (!choice) {
        return;
      }

      if (choice.type === "weaponmaster-equip") {
        // rule-id: ven-041-166-weaponmaster-on-play-equip
        // "You may Equip one of your Equipment to me … even if it's already
        // attached." Decline (`accept:false`) clears the prompt; a pick
        // detaches from any prior holder and re-attaches to the Weaponmaster.
        draft.pendingChoice = undefined;
        const picked = context.params.pickedCardId as string | undefined;
        if (context.params.accept === false || !picked || !choice.options.includes(picked)) {
          return;
        }
        // rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost
        // Rule 821.1.c: pay the Equip cost reduced by [A]; if it can't be
        // paid the Equipment stays where it is (821.1.c.5).
        const equipCost = weaponmasterEquipCost(picked);
        if (!equipCost || !canPayOptInCost(draft, choice.playerId, picked, equipCost, context)) {
          return;
        }
        deductAbilityCost(draft, choice.playerId, equipCost, context.zones, context.counters);
        const registry = getGlobalCardRegistry();
        const priorMeta = context.cards.getCardMeta(picked as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const priorHolder = priorMeta?.attachedTo;
        if (priorHolder && priorHolder !== choice.unitId) {
          const holderMeta = context.cards.getCardMeta(priorHolder as CoreCardId) as
            | Partial<RiftboundCardMeta>
            | undefined;
          context.cards.updateCardMeta(priorHolder as CoreCardId, {
            equippedWith: (holderMeta?.equippedWith ?? []).filter((id) => id !== picked),
          } as Partial<RiftboundCardMeta>);
        }
        const equipDef = registry.get(picked);
        const newEquipMeta: Partial<RiftboundCardMeta> = { attachedTo: choice.unitId };
        if (equipDef?.copyAttachedUnitText) {
          newEquipMeta.copiedFromCardId = choice.unitId;
        }
        context.cards.updateCardMeta(picked as CoreCardId, newEquipMeta);
        const unitMeta = context.cards.getCardMeta(choice.unitId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const already = unitMeta?.equippedWith ?? [];
        if (!already.includes(picked)) {
          context.cards.updateCardMeta(choice.unitId as CoreCardId, {
            equippedWith: [...already, picked],
          } as Partial<RiftboundCardMeta>);
        }
        fireTriggers(
          {
            cardId: choice.unitId,
            equipmentId: picked,
            playerId: choice.playerId,
            type: "attach-equipment",
          },
          { cards: context.cards, counters: context.counters, draft, zones: context.zones },
        );
        return;
      }

      if (choice.type === "pay-x") {
        // rule 204.3.b / 444.1-2 (ogn-268-298): remove X Power from the pool
        // (any Domain pays a [rainbow] pip) and resume the resolution with
        // `x` bound for `{ variable: "x" }` amounts.
        const x = Math.max(0, (context.params.xAmount as number) ?? 0);
        if (!canAffordPower(draft.runePools[choice.playerId]?.power ?? {}, { rainbow: x })) {
          return;
        }
        draft.pendingChoice = undefined;
        if (x > 0) {
          deductAbilityCost(
            draft,
            choice.playerId,
            { power: Array.from({ length: x }, () => "rainbow") },
            context.zones,
            context.counters,
          );
        }
        const resolved = choice.resolved as {
          cardId: string;
          effect?: unknown;
        };
        const registry = getGlobalCardRegistry();
        const baseEffect =
          resolved.effect ??
          (registry.getAbilities(resolved.cardId) ?? []).find((ab) => ab.type === "spell")?.effect;
        executeResolvedItem(
          {
            ...resolved,
            effect: baseEffect
              ? { ...(baseEffect as Record<string, unknown>), _variables: { x } }
              : baseEffect,
          } as Parameters<typeof executeResolvedItem>[0],
          draft,
          context,
        );
        if (!draft.pendingChoice) {
          postChoiceCleanup(draft, context);
        }
        return;
      }

      if (choice.type === "opt-in") {
        // Rule 583 (unl-021-219): on accept, resume executeResolvedItem with
        // the optional flag cleared so target selection etc. proceeds normally;
        // on decline the trigger fizzles.
        draft.pendingChoice = undefined;
        if (context.params.accept === true) {
          // rule-id: sfd-119-221 — "you may pay [N] to …": charge the cost
          // before the effect; if it became unpayable, the trigger fizzles.
          const cost = optInCostOf(choice);
          if (cost) {
            if (!canPayOptInCost(draft, choice.playerId, choice.sourceCardId, cost, context)) {
              if (choice.suspendedDeathCardId) {
                postChoiceCleanup(draft, context);
              }
              return;
            }
            deductAbilityCost(draft, choice.playerId, cost, context.zones, context.counters);
            if (cost.exhaust === true) {
              context.counters.setFlag(choice.sourceCardId as CoreCardId, "exhausted", true);
            }
          }
          executeResolvedItem(
            choice.resolved as Parameters<typeof executeResolvedItem>[0],
            draft,
            context,
          );
          // rule-id: ogn-125-298 — an accepted "you may spend a buff" changes
          // "while I'm buffed" static grants (e.g. [Ganking]); recalc statics
          // now, unless the resumed item parked a follow-up prompt.
          if (!draft.pendingChoice) {
            postChoiceCleanup(draft, context);
          }
        } else if (choice.suspendedDeathCardId) {
          // rule 372 (ogn-023-298): a declined "you may pay … instead" death
          // replacement — the suspended unit now dies via state-based checks.
          postChoiceCleanup(draft, context);
        }
        return;
      }

      if (choice.type === "choose-mode") {
        // Rule 355.8 (unl-182-219): execute the picked modal option; when
        // `notChosenThisTurn` is set, record the index on the source card's
        // meta so subsequent Repeat casts exclude it.
        const idx = context.params.pickedMode as number;
        if (!choice.options.includes(idx)) {
          return;
        }
        const modalOptions =
          (choice.effect as { options?: { effect: unknown }[] } | undefined)?.options ?? [];
        const picked = modalOptions[idx]?.effect;
        draft.pendingChoice = undefined;
        if (choice.notChosenThisTurn) {
          const prior =
            (
              context.cards.getCardMeta(choice.sourceCardId as CoreCardId) as
                | Partial<RiftboundCardMeta>
                | undefined
            )?.modesChosenThisTurn ?? [];
          context.cards.updateCardMeta(choice.sourceCardId as CoreCardId, {
            modesChosenThisTurn: [...prior, idx],
          } as Partial<RiftboundCardMeta>);
        }
        if (picked) {
          // rule 355.10 (sfd-039-221) — the picked mode's own caster-chosen
          // target ("ready or exhaust A LEGEND") is declared now, by the
          // ability's controller: with several candidates and nothing already
          // bound, prompt instead of letting the handler take the first one.
          if (
            !choice.boundTargets &&
            liftModalTarget(draft, choice, picked as ExecutableEffect, context)
          ) {
            return;
          }
          // rule-id: sfd-091-221 — keep chain-bound targets for the picked mode.
          // rule 355.10.e (ogn-071-298): an opponent-picked mode resolves for the controller.
          const effectCtx = {
            ...buildEffectContext(
              draft,
              choice.controllerId ?? choice.playerId,
              choice.sourceCardId,
              context,
            ),
            ...(choice.boundTargets ? { boundTargets: choice.boundTargets } : {}),
          };
          executeEffect(picked as ExecutableEffect, effectCtx);
          postChoiceCleanup(draft, context);
        }
        return;
      }

      if (choice.type === "choose-target") {
        const picked = context.params.pickedCardId as string;
        // rule 372: ordering two replacement effects on the same death. The
        // pick names a replacement SOURCE card, not a target — record it and
        // let the next state-based check apply that replacement.
        if (choice.replacementOrderFor !== undefined) {
          if (!choice.options.includes(picked)) {
            return;
          }
          (draft as { replacementOrderChoices?: Record<string, string> }).replacementOrderChoices = {
            ...((draft as { replacementOrderChoices?: Record<string, string> })
              .replacementOrderChoices ?? {}),
            [choice.replacementOrderFor as string]: picked,
          };
          draft.pendingChoice = undefined;
          postChoiceCleanup(draft, context);
          return;
        }
        // rule-id: ogn-080-298 (rule 355.9) — "You may make new choices for
        // it": the pick RE-TARGETS a chain item the chooser just gained
        // control of; rewrite that item's locked targets instead of executing
        // anything now (the stolen spell resolves later, on its own).
        if (choice.retargetChainItemId !== undefined) {
          if (!choice.options.includes(picked)) {
            return;
          }
          const items = draft.interaction?.chain?.items ?? [];
          const item = items.find((it) => it && it.id === choice.retargetChainItemId);
          if (item) {
            (item as { targets?: readonly string[] }).targets = [picked];
          }
          draft.pendingChoice = undefined;
          postChoiceCleanup(draft, context);
          return;
        }
        // rule-id: ogn-256-298 (rule 355.13) — "any number of <units>": each
        // pick accumulates; remaining options are re-pruned against the
        // target's aggregate constraints (one battlefield, `totalMight` cap)
        // and the prompt repeats until the chooser declines or none remain.
        if (choice.anyNumber) {
          const declined = context.params.accept === false;
          // rule 355.13 (ogn-141-298): several "up to N" picks in one answer.
          const multiPicked = context.params.pickedCardIds as string[] | undefined;
          const newPicks = declined ? [] : (multiPicked ?? [picked]);
          if (!declined && newPicks.some((id) => !choice.options.includes(id))) {
            return;
          }
          const pickedSoFar = [...(choice.picked ?? []), ...newPicks];
          // rule 355.13 (ogn-073-298): "up to N" caps the accumulated picks.
          const capped = typeof choice.maxPicks === "number" && pickedSoFar.length >= choice.maxPicks;
          if (!declined && !capped) {
            const tgt = (choice.effect as { target?: unknown }).target as
              | Parameters<typeof isLegalMultiTargetSet>[0]
              | undefined;
            const legalityCtx = {
              getCardZone: (c: string) => context.zones.getCardZone(c as CoreCardId),
              getMight: (c: string) =>
                getCardEffectiveMight(c, (m) =>
                  context.cards.getCardMeta(m) as Partial<RiftboundCardMeta> | undefined,
                ),
            };
            const remainingOptions = choice.options.filter(
              (id) =>
                !newPicks.includes(id) &&
                isLegalMultiTargetSet(tgt, [...pickedSoFar, id], legalityCtx),
            );
            if (remainingOptions.length > 0) {
              draft.pendingChoice = {
                ...choice,
                options: remainingOptions,
                picked: pickedSoFar,
                remaining: remainingOptions.length,
              };
              return;
            }
          }
          draft.pendingChoice = undefined;
          // rule 355.2 (ogn-187-298): a chained prompt ("starting with the next
          // player, each player may …") continues whether or not this chooser
          // declined, and the next prompt belongs to the SPELL's controller
          // chain, not this chooser.
          const chainedThen = (choice as { then?: unknown }).then as ExecutableEffect | undefined;
          if (pickedSoFar.length === 0) {
            if (chainedThen) {
              executeEffect(
                chainedThen,
                buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
              );
              postChoiceCleanup(draft, context);
            }
            return;
          }
          // Rule 359.2: "when you choose me" fires for each chosen target.
          const trigCtx = { cards: context.cards, counters: context.counters, draft, zones: context.zones };
          // rule-id: sfd-142-221 — tag spell- vs ability-sourced choices.
          const sourceType =
            getGlobalCardRegistry().get(choice.sourceCardId as string)?.cardType === "spell"
              ? "spell"
              : "ability";
          for (const id of pickedSoFar) {
            fireTriggers({ cardId: id, chooserId: choice.playerId, sourceType, type: "choose" }, trigCtx);
          }
          executeEffect(choice.effect as ExecutableEffect, {
            ...buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
            boundTargets: pickedSoFar,
          });
          if (chainedThen) {
            executeEffect(
              chainedThen,
              buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
            );
          }
          postChoiceCleanup(draft, context);
          return;
        }
        // rule 355.14.e/f (ogn-041-298): fixed-total split — the allocation is
        // encoded as one boundTargets occurrence per point of damage; every
        // allocated unit is a target (355.14.a → "when you choose me" fires).
        if (choice.assign && typeof choice.total === "number") {
          const allocation = context.params.allocation;
          if (!isLegalSplitAllocation(choice.options, choice.total, allocation)) {
            return;
          }
          draft.pendingChoice = undefined;
          const encoded: string[] = [];
          for (const [id, n] of Object.entries(allocation)) {
            for (let i = 0; i < n; i++) encoded.push(id);
          }
          if (encoded.length > 0) {
            const trigCtx = { cards: context.cards, counters: context.counters, draft, zones: context.zones };
            const sourceType =
              getGlobalCardRegistry().get(choice.sourceCardId as string)?.cardType === "spell"
                ? "spell"
                : "ability";
            for (const id of new Set(encoded)) {
              fireTriggers({ cardId: id, chooserId: choice.playerId, sourceType, type: "choose" }, trigCtx);
            }
            executeEffect(choice.effect as ExecutableEffect, {
              ...buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
              boundTargets: encoded,
            });
          }
          postChoiceCleanup(draft, context);
          return;
        }
        if (!choice.options.includes(picked)) {
          return;
        }
        // Rule 355.14.h (unl-192-219): a choose-target carrying boundTargets is
        // a split-target DROP prompt — remove the picked id and re-execute so
        // the split handler re-evaluates might vs remaining-target count.
        // Rule 355.14.e/f/g: with `assign` set it is instead a resolution-time
        // damage-distribution pick — APPEND the picked id (one occurrence per
        // surplus point) so the split handler credits it +1.
        const boundTargets = choice.assign
          ? [...(choice.boundTargets ?? []), picked]
          : choice.boundTargets
            ? choice.boundTargets.filter((id) => id !== picked)
            : [picked];
        draft.pendingChoice = undefined;
        const effectCtx = {
          ...buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
          boundTargets,
        };
        executeEffect(choice.effect as ExecutableEffect, effectCtx);
        // rule-id: ogn-063-298 — recalc statics after the picked effect so a
        // just-buffed unit picks up "friendly buffed units have [Deflect]".
        // Skip while a re-prompt (split/assign) is still pending.
        if (!draft.pendingChoice) {
          postChoiceCleanup(draft, context);
        }
        return;
      }

      if (choice.type === "choose-destination") {
        const zoneId = context.params.pickedZoneId as string;
        if (!choice.options.includes(zoneId)) {
          return;
        }
        // rule-id: unl-204-219-owner-chooses-top-or-bottom — owner-choice
        // recycle surfaces mainDeck-top / mainDeck-bottom as destinations.
        if (zoneId === "mainDeck-top" || zoneId === "mainDeck-bottom") {
          context.counters.clearAllCounters(choice.cardId as CoreCardId);
          context.zones.moveCard({
            cardId: choice.cardId as CoreCardId,
            position: zoneId === "mainDeck-top" ? "top" : "bottom",
            targetZoneId: "mainDeck" as CoreZoneId,
          });
          draft.pendingChoice = undefined;
          // rule-id: ogn-235-298 — the owner recycled a card to their Main Deck.
          fireRecycleEvent(draft, context, choice.playerId, [choice.cardId as string]);
          return;
        }
        // Rule 323.6 / 355.2 / 355.4 (rule-id: unl-184-219-choose-destination-zone-id,
        // sfd-200-221-choose-destination-battlefield):
        // the move/to:"choose" executor already emits ZONE ids (base /
        // battlefield-<bfId>); only prefix a bare battlefield id so we never
        // produce battlefield-battlefield-<bfId>.
        const targetZoneId =
          zoneId === "base" || zoneId.startsWith("battlefield-")
            ? zoneId
            : `battlefield-${zoneId}`;
        const fromZone =
          (context.zones.getCardZone?.(choice.cardId as CoreCardId) as string | undefined) ?? "";
        // rule-id: sfd-109-221 (rule 354.2 / 356.1.b.3 / 560) — finalizing a
        // pending "play it, ignoring its cost": the card enters the board from
        // off-board, so this is a play. Charge the optional additional cost if
        // elected (and still payable) before the card moves.
        const enteringPlay =
          !choice.created &&
          context.cards &&
          typeof context.zones.getCardsInZone === "function" &&
          fromZone !== "" &&
          !isBoardZone(fromZone);
        let paidAdditionalCost = false;
        if (enteringPlay && context.params.paidAdditionalCost === true) {
          const extra = pendingPlayOptionalCost(draft, choice, context);
          if (extra) {
            deductAbilityCost(draft, choice.playerId, extra, context.zones, context.counters);
            paidAdditionalCost = true;
          }
        }
        if (!(choice.created && fromZone === targetZoneId)) {
          context.zones.moveCard({
            cardId: choice.cardId as CoreCardId,
            targetZoneId: targetZoneId as CoreZoneId,
          });
        }
        draft.pendingChoice = undefined;
        // rule-id: ogs-015-024 (rule 439.2.a/.b.1) — a created token is placed,
        // not moved: skip the `move` event and prompt for the next queued token.
        if (choice.created) {
          const [next, ...rest] = choice.queue ?? [];
          if (next !== undefined) {
            draft.pendingChoice = { ...choice, cardId: next, queue: rest };
          }
          return;
        }
        // rule-id: unl-133-219 — a chosen-destination effect move is still a
        // move: emit the `move` event (owner / movedBy) so "When I move" /
        // "When you move an enemy unit" triggers fire. Guarded so unit-test
        // stubs that omit the full context bags don't crash.
        if (
          context.cards &&
          typeof context.zones.getCardsInZone === "function" &&
          (fromZone === "base" || fromZone.startsWith("battlefield-")) &&
          fromZone !== targetZoneId
        ) {
          const owner =
            (context.cards as { getCardController?: (id: CoreCardId) => string | undefined })
              .getCardController?.(choice.cardId as CoreCardId) ??
            (context.cards.getCardOwner(choice.cardId as CoreCardId) as string | undefined);
          fireTriggers(
            {
              cardId: choice.cardId,
              from: fromZone,
              movedBy: choice.playerId,
              owner,
              to: targetZoneId,
              type: "move",
            },
            { cards: context.cards, counters: context.counters, draft, zones: context.zones },
          );
        }
        // rule-id: ogn-173-298 — Rule 450 / 323.9 / 460: a unit arriving at a
        // battlefield its controller doesn't control contests it AND stages the
        // showdown (combat when opposing units stand there), exactly as a
        // Standard Move does. Fall back to the bare Contested mark when the
        // caller's context bags are stubbed (unit tests) or the card is no unit.
        if (
          targetZoneId.startsWith("battlefield-") &&
          context.cards &&
          context.counters &&
          typeof context.zones.getCardsInZone === "function" &&
          getGlobalCardRegistry().get(choice.cardId as string)?.cardType === "unit"
        ) {
          contestBattlefieldOnArrival({
            arrivingUnitIds: [choice.cardId as string],
            battlefieldId: targetZoneId.slice("battlefield-".length),
            cards: context.cards,
            counters: context.counters,
            draft,
            playerId: choice.playerId,
            zones: context.zones,
          });
        } else {
          markContestedOnArrival(draft, targetZoneId, choice.playerId);
        }
        draft.pendingChoice = undefined;
        // rule-id: sfd-109-221 (rule 354.2 / 419.4.a) — a card played by an
        // effect is still played: fire "When you play me" (carrying whether
        // the optional additional cost was paid) and "when you play a card",
        // and count it toward this turn's plays (rule 724), mirroring playUnit.
        if (enteringPlay) {
          const trigCtx = { cards: context.cards, counters: context.counters, draft, zones: context.zones };
          const cardId = choice.cardId as string;
          // rule 143.4: a unit entering the board is exhausted, however it was
          // played — unless a static "enters ready" ability applies.
          if (
            getGlobalCardRegistry().get(cardId)?.cardType === "unit" &&
            !staticEnterReadyApplies(cardId, draft, choice.playerId)
          ) {
            context.counters.setFlag(cardId as CoreCardId, "exhausted", true);
          }
          fireTriggers(
            { cardId, paidAdditionalCost, playerId: choice.playerId, type: "play-self" },
            trigCtx,
          );
          const cardType = getGlobalCardRegistry().get(cardId)?.cardType ?? "unit";
          fireTriggers({ cardId, cardType, playerId: choice.playerId, type: "play-card" }, trigCtx);
          if (draft.cardsPlayedThisTurn) {
            draft.cardsPlayedThisTurn[choice.playerId] =
              (draft.cardsPlayedThisTurn[choice.playerId] ?? 0) + 1;
          }
        }
        return;
      }

      if (choice.type === "name-card") {
        // Rule 762 / 383.2.b: record the chosen name on the source card so
        // linked abilities ("cards with that name") can read it.
        const name = context.params.pickedName;
        if (typeof name !== "string" || !choice.options.includes(name)) {
          return;
        }
        context.cards.updateCardMeta(choice.sourceCardId as CoreCardId, {
          namedCard: name,
        } as Partial<RiftboundCardMeta>);
        draft.pendingChoice = undefined;
        return;
      }

      // rule-id: ogn-235-298-vision-optional-recycle — declining leaves the
      // revealed card(s) where they are (on top of the deck for Vision).
      if (choice.optional && context.params.accept === false) {
        // rule-id: ogn-062-298-look-decline-recycle — a declined look that
        // says "Recycle the remaining cards" still recycles every revealed
        // card; only Vision-like looks (no onRest) leave them on top.
        if (choice.onRest === "recycle") {
          for (const restId of choice.revealed) {
            context.zones.moveCard({
              cardId: restId as CoreCardId,
              position: "bottom",
              targetZoneId: "mainDeck" as CoreZoneId,
            });
          }
        }
        draft.pendingChoice = undefined;
        // rule-id: ogn-235-298 — declined pick still recycled the rest.
        if (choice.onRest === "recycle") {
          fireRecycleEvent(draft, context, choice.prompter, choice.revealed as readonly string[]);
        }
        return;
      }

      // rule 422.1.a (ogn-030-298): a multi-pick prompt ("discard 2") takes
      // one pick per move or several via `pickedCardIds`; every pick is
      // applied here, and the prompt re-parks until `remaining` is spent.
      const multi = context.params.pickedCardIds as string[] | undefined;
      const picks: string[] =
        Array.isArray(multi) && multi.length > 0 ? [...multi] : [context.params.pickedCardId as string];
      if (!picks.every((id) => isValidPendingPick(choice, id))) {
        return;
      }
      const pickedCardId = picks[picks.length - 1] as string;
      let remaining = choice.remaining ?? 1;
      let taken = choice.taken ?? 0;
      let revealed = choice.revealed as readonly string[];

      const targetZoneId = onPickedTargetZone(choice.onPicked);
      for (const id of picks) {
        const moveParams: {
          cardId: CoreCardId;
          targetZoneId: CoreZoneId;
          position?: "top" | "bottom";
        } = {
          cardId: id as CoreCardId,
          targetZoneId,
        };
        // Recycle → bottom of main deck (rule: recycle places at bottom).
        if (choice.onPicked === "recycle") {
          moveParams.position = "bottom";
          // rule 424.4.a — recycling puts a card on the bottom of the
          // CORRESPONDING deck; a rune goes to its owner's Rune Deck.
          if (getGlobalCardRegistry().get(id)?.cardType === "rune") {
            moveParams.targetZoneId = "runeDeck" as CoreZoneId;
          }
        }
        context.counters.clearAllCounters(id as CoreCardId);
        context.zones.moveCard(moveParams);
        revealed = revealed.filter((r) => r !== id);

        // Rule ogn-006-298: emit the discard event so "When you discard me…"
        // self-triggers (Flame Chompers) can fire. Guarded so unit-test stubs
        // that omit the full zone bag don't crash. Rule ogn-202-298: tag the
        // batch position so "discard one or more" fires once per instruction.
        if (choice.onPicked === "discard" && typeof context.zones.getCardsInZone === "function") {
          fireTriggers(
            { batchIndex: taken, cardId: id, playerId: choice.revealer, type: "discard" },
            { cards: context.cards, counters: context.counters, draft, zones: context.zones },
          );
        }
        taken += 1;
        remaining -= 1;
      }
      if (remaining > 0) {
        const rest = { ...choice, revealed: [...revealed] } as typeof choice;
        if (revealed.some((id) => isValidPendingPick(rest, id))) {
          draft.pendingChoice = { ...rest, remaining, taken };
          return;
        }
      }

      // rule-id: ogn-062-298-look-banish-play — "banish a unit from among
      // them, then play it, reducing its cost by [N]": pay the discounted
      // cost from the prompter's pool and add the play to the chain (rule
      // 354.2/354.3) so its owner chooses a location when it finalizes.
      if (choice.onPicked === "play") {
        const pool = draft.runePools[choice.prompter];
        const raw = getGlobalCardRegistry().getCostToDeduct(pickedCardId as string);
        // rule 356.1.b.1 (ogn-025-298): "ignoring its cost" waives the whole
        // cost; rule-id ogn-115-298: "ignoring Energy costs" waives only the
        // energy — Power pips are still paid.
        const energy =
          choice.playIgnoreCost || choice.playIgnoreEnergy
            ? 0
            : Math.max(0, raw.energy - (choice.playEnergyReduction ?? 0));
        const power = choice.playIgnoreCost ? {} : raw.power;
        // rule 356.4 / 419.2.a: a discount reduces the cost, it does not waive
        // it — the reduced cost must still be payable in full, otherwise the
        // card cannot be played and simply stays where the pick put it.
        const affordable =
          pool === undefined ||
          (pool.energy >= energy &&
            Object.entries(power).every(
              ([domain, amount]) =>
                (pool.power[domain as keyof typeof pool.power] ?? 0) +
                  (pool.power.rainbow ?? 0) >=
                (amount ?? 0),
            ));
        if (affordable) {
          if (pool) {
            pool.energy = Math.max(0, pool.energy - energy);
            for (const [domain, amount] of Object.entries(power)) {
              const key = domain as keyof typeof pool.power;
              pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - (amount ?? 0));
            }
          }
          draft.interaction = addToChain(
            draft.interaction ?? createInteractionState(),
            {
              cardId: pickedCardId as string,
              controller: choice.prompter,
              effect: { target: pickedCardId as string, to: "choose", type: "move" },
              triggered: true,
              type: "ability",
            },
            Object.keys(draft.players),
          );
          // rule 356.1 / 145.2 (ogn-025-298 Blind Fury): the player who PLAYS
          // a card controls it, even when another player owns it.
          const owner = context.cards.getCardOwner(pickedCardId as CoreCardId);
          if (owner !== undefined && owner !== choice.prompter) {
            const metaNow = context.cards.getCardMeta(pickedCardId as CoreCardId) as
              | Partial<RiftboundCardMeta>
              | undefined;
            context.cards.updateCardMeta(pickedCardId as CoreCardId, {
              controlEffects: [
                ...(metaNow?.controlEffects ?? []),
                { controllerId: choice.prompter },
              ],
            } as Partial<RiftboundCardMeta>);
            (
              context.cards as {
                setCardController?: (cardId: CoreCardId, controllerId: string) => void;
              }
            ).setCardController?.(pickedCardId as CoreCardId, choice.prompter);
          }
        }
      }

      // Rule 435 (ogn-174-298): look/Vision recycles the unpicked cards.
      const recycledIds: string[] = choice.onPicked === "recycle" ? [...picks] : [];
      if (choice.onRest === "recycle") {
        for (const restId of revealed) {
          if (restId === pickedCardId) continue;
          context.zones.moveCard({
            cardId: restId as CoreCardId,
            position: "bottom",
            targetZoneId: "mainDeck" as CoreZoneId,
          });
          recycledIds.push(restId as string);
        }
      }

      // Clear the pending choice so play can resume.
      draft.pendingChoice = undefined;

      // rule-id: ogn-235-298 — one `recycle` event for the whole batch
      // (picked-to-recycle and/or recycled rest) so Karma's buff fires once.
      fireRecycleEvent(draft, context, choice.prompter, recycledIds);

      // Resume the originating effect's `then` clause (e.g. discard 1 → draw 1).
      if (choice.then) {
        // rule-id: ven-089-166-look-then-empower — "…play it. Then you may do
        // this: Empower it": the follow-up's "it" is the picked card.
        const effectCtx: EffectContext = {
          ...buildEffectContext(draft, choice.prompter, choice.sourceCardId ?? "", context),
          // rule 355.8 (ogn-008-298): the caster's play-time target survives the prompt.
          ...(choice.thenBoundTargets ? { boundTargets: [...choice.thenBoundTargets] } : {}),
          triggerSourceId: pickedCardId as string,
        };
        executeEffect(choice.then as ExecutableEffect, effectCtx);
      }
      // rule 319.7 / rule-id: ogn-019-298 — the pick changed game state (a
      // discard, recycle, banish…), so refresh statics + SBA like the other
      // choice kinds do, unless a follow-up prompt is still parked.
      if (!draft.pendingChoice) {
        postChoiceCleanup(draft, context);
      }
    },
  },
};
