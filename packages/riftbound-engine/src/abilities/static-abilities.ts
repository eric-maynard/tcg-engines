/**
 * Static / Passive Ability Evaluator (rules 567-570)
 *
 * Static abilities are continuous effects that apply while a card is on the board.
 * They're identified by "while", "if", or statements of fact in card text.
 *
 * This module uses a **recalculate-from-scratch** approach:
 * 1. Strip all static modifications from all cards
 * 2. Scan all board cards for static abilities
 * 3. Evaluate each ability's condition
 * 4. Apply modifications to matching targets
 *
 * Called after every state mutation via performCleanup.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { GrantedKeyword, RiftboundCardMeta, RiftboundGameState } from "../types";

const MIGHTY_THRESHOLD = 5;

/**
 * Context needed for static ability evaluation.
 */
export interface StaticAbilityContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
  };
  readonly cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
}

/**
 * A board card with its location info.
 */
interface BoardCard {
  id: string;
  owner: string;
  zone: string;
}

/**
 * Collect all cards currently on the board (base + battlefields + legendZone).
 */
function getAllBoardCards(ctx: StaticAbilityContext): BoardCard[] {
  const cards: BoardCard[] = [];

  for (const playerId of Object.keys(ctx.draft.players)) {
    const baseCards = ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId);
    for (const cardId of baseCards) {
      cards.push({ id: cardId as string, owner: playerId, zone: "base" });
    }

    const legendCards = ctx.zones.getCardsInZone(
      "legendZone" as CoreZoneId,
      playerId as CorePlayerId,
    );
    for (const cardId of legendCards) {
      cards.push({ id: cardId as string, owner: playerId, zone: "legendZone" });
    }
  }

  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const bfCards = ctx.zones.getCardsInZone(bfZoneId);
    for (const cardId of bfCards) {
      const owner = ctx.cards.getCardOwner(cardId) ?? "";
      cards.push({ id: cardId as string, owner, zone: bfZoneId as string });
    }
  }

  // Get cards from battlefieldRow (battlefield cards themselves)
  const battlefieldRowCards = ctx.zones.getCardsInZone("battlefieldRow" as CoreZoneId);
  for (const cardId of battlefieldRowCards) {
    const owner = ctx.cards.getCardOwner(cardId) ?? "";
    cards.push({ id: cardId as string, owner, zone: "battlefieldRow" });
  }

  // Get cards from championZone (per player)
  for (const playerId of Object.keys(ctx.draft.players)) {
    const championCards = ctx.zones.getCardsInZone(
      "championZone" as CoreZoneId,
      playerId as CorePlayerId,
    );
    for (const cardId of championCards) {
      cards.push({ id: cardId as string, owner: playerId, zone: "championZone" });
    }
  }

  return cards;
}

/**
 * Evaluate whether a static ability's condition is met.
 */
export function evaluateCondition(
  condition: Record<string, unknown>,
  source: BoardCard,
  ctx: StaticAbilityContext,
): boolean {
  const condType = condition.type as string;

  switch (condType) {
    case "while-at-battlefield": {
      return source.zone.startsWith("battlefield");
    }

    case "while-mighty": {
      const registry = getGlobalCardRegistry();
      const def = registry.get(source.id);
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const baseMight = def?.might ?? 0;
      const buffBonus = meta?.buffed ? 1 : 0;
      const mightMod = meta?.mightModifier ?? 0;
      return baseMight + buffBonus + mightMod >= MIGHTY_THRESHOLD;
    }

    case "while-buffed": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.buffed === true;
    }

    case "while-damaged": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return (meta?.damage ?? 0) > 0;
    }

    case "while-ready": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.exhausted !== true;
    }

    case "while-exhausted": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.exhausted === true;
    }

    case "while-alone": {
      if (!source.zone.startsWith("battlefield")) {
        return false;
      }
      const cardsAtZone = ctx.zones.getCardsInZone(source.zone as CoreZoneId);
      const friendlyCount = cardsAtZone.filter(
        (id) => ctx.cards.getCardOwner(id) === source.owner,
      ).length;
      return friendlyCount === 1;
    }

    case "while-equipped": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return (meta?.equippedWith?.length ?? 0) > 0;
    }

    case "control-battlefield": {
      const comparison = condition.count as { gte?: number; lte?: number; eq?: number } | undefined;
      let controlledCount = 0;
      for (const bf of Object.values(ctx.draft.battlefields)) {
        if (bf.controller === source.owner) {
          controlledCount++;
        }
      }
      if (comparison?.gte !== undefined) {
        return controlledCount >= comparison.gte;
      }
      if (comparison?.eq !== undefined) {
        return controlledCount === comparison.eq;
      }
      return controlledCount > 0;
    }

    case "attacking": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.combatRole === "attacker";
    }

    case "defending": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.combatRole === "defender";
    }

    case "in-combat": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.combatRole === "attacker" || meta?.combatRole === "defender";
    }

    case "and": {
      const subConditions = condition.conditions as Record<string, unknown>[];
      return subConditions.every((c) => evaluateCondition(c, source, ctx));
    }

    case "or": {
      const subConditions = condition.conditions as Record<string, unknown>[];
      return subConditions.some((c) => evaluateCondition(c, source, ctx));
    }

    case "not": {
      const subCondition = condition.condition as Record<string, unknown>;
      return !evaluateCondition(subCondition, source, ctx);
    }

    case "paid-additional-cost": {
      return ctx.draft.additionalCostsPaid?.[source.id] === true;
    }

    case "while-level": {
      const threshold = (condition.threshold as number) ?? 0;
      const player = ctx.draft.players[source.owner];
      return (player?.xp ?? 0) >= threshold;
    }

    case "xp-gained-this-turn": {
      const gained = ctx.draft.xpGainedThisTurn?.[source.owner] ?? 0;
      return gained > 0;
    }

    case "event-this-turn": {
      const eventType = condition.event as string;
      const events = ctx.draft.turnEvents?.[source.owner] ?? [];
      return events.includes(eventType);
    }

    default: {
      // Unknown condition — default to true (apply the effect)
      return true;
    }
  }
}

/**
 * Resolve which cards a static ability's effect applies to.
 */
function resolveStaticTargets(
  affects: string | undefined,
  source: BoardCard,
  boardCards: BoardCard[],
): string[] {
  switch (affects) {
    case "self":
    case undefined: {
      return [source.id];
    }

    case "units": {
      // All friendly units at the same location
      const registry = getGlobalCardRegistry();
      return boardCards
        .filter((c) => c.owner === source.owner && c.zone === source.zone)
        .filter((c) => registry.get(c.id)?.cardType === "unit")
        .map((c) => c.id);
    }

    case "all-friendly": {
      const registry = getGlobalCardRegistry();
      return boardCards
        .filter((c) => c.owner === source.owner)
        .filter((c) => registry.get(c.id)?.cardType === "unit")
        .map((c) => c.id);
    }

    case "all-enemy": {
      const registry = getGlobalCardRegistry();
      return boardCards
        .filter((c) => c.owner !== source.owner)
        .filter((c) => registry.get(c.id)?.cardType === "unit")
        .map((c) => c.id);
    }

    case "battlefield": {
      // All units at the same battlefield
      if (!source.zone.startsWith("battlefield")) {
        return [];
      }
      const registry = getGlobalCardRegistry();
      return boardCards
        .filter((c) => c.zone === source.zone)
        .filter((c) => registry.get(c.id)?.cardType === "unit")
        .map((c) => c.id);
    }

    case "gear": {
      return boardCards
        .filter((c) => c.owner === source.owner)
        .filter((c) => {
          const reg = getGlobalCardRegistry();
          return reg.get(c.id)?.cardType === "gear" || reg.get(c.id)?.cardType === "equipment";
        })
        .map((c) => c.id);
    }

    default: {
      return [source.id];
    }
  }
}

/**
 * Apply a static effect (might modification or keyword grant) to target cards.
 *
 * Accumulates into `staticMightBonus` and adds keywords with `duration: "static"`.
 */
function applyStaticEffect(
  effect: Record<string, unknown>,
  targetIds: string[],
  ctx: StaticAbilityContext,
): void {
  const effectType = effect.type as string;

  if (effectType === "modify-might") {
    const amount = (effect.amount as number) ?? 0;
    for (const targetId of targetIds) {
      const meta = ctx.cards.getCardMeta(targetId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const current = meta?.staticMightBonus ?? 0;
      ctx.cards.updateCardMeta(
        targetId as CoreCardId,
        {
          staticMightBonus: current + amount,
        } as Partial<RiftboundCardMeta>,
      );
    }
  } else if (effectType === "grant-keyword") {
    const keyword = effect.keyword as string;
    if (!keyword) {
      return;
    }
    const value = effect.value as number | undefined;
    for (const targetId of targetIds) {
      const meta = ctx.cards.getCardMeta(targetId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const existing = meta?.grantedKeywords ?? [];
      // Only add if not already granted statically with same keyword
      const alreadyGranted = existing.some(
        (gk) => gk.keyword === keyword && gk.duration === "static",
      );
      if (!alreadyGranted) {
        ctx.cards.updateCardMeta(
          targetId as CoreCardId,
          {
            grantedKeywords: [
              ...existing,
              {
                duration: "static" as GrantedKeyword["duration"],
                keyword,
                value,
              } as GrantedKeyword,
            ],
          } as Partial<RiftboundCardMeta>,
        );
      }
    }
  } else if (effectType === "grant-keywords") {
    const keywords = (effect.keywords as string[]) ?? [];
    for (const targetId of targetIds) {
      const meta = ctx.cards.getCardMeta(targetId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const existing = meta?.grantedKeywords ?? [];
      const newEntries: GrantedKeyword[] = keywords
        .filter((kw) => !existing.some((gk) => gk.keyword === kw && gk.duration === "static"))
        .map(
          (kw) =>
            ({ duration: "static" as GrantedKeyword["duration"], keyword: kw }) as GrantedKeyword,
        );
      if (newEntries.length > 0) {
        ctx.cards.updateCardMeta(
          targetId as CoreCardId,
          {
            grantedKeywords: [...existing, ...newEntries],
          } as Partial<RiftboundCardMeta>,
        );
      }
    }
  }
}

/**
 * Recalculate all static ability effects on the board.
 *
 * This is the main entry point. Call after any state mutation:
 * 1. Strips all "static" duration keywords and staticMightBonus from all cards
 * 2. Scans board cards for static abilities
 * 3. Evaluates conditions
 * 4. Applies effects to matching targets
 *
 * @returns true if any static effects were applied
 */
export function recalculateStaticEffects(ctx: StaticAbilityContext): boolean {
  const boardCards = getAllBoardCards(ctx);
  const registry = getGlobalCardRegistry();
  let anyApplied = false;

  // Step 1: Strip all static modifications
  for (const card of boardCards) {
    const meta = ctx.cards.getCardMeta(card.id as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    if (!meta) {
      continue;
    }

    let changed = false;

    // Clear staticMightBonus
    if (meta.staticMightBonus && meta.staticMightBonus !== 0) {
      ctx.cards.updateCardMeta(
        card.id as CoreCardId,
        {
          staticMightBonus: 0,
        } as Partial<RiftboundCardMeta>,
      );
      changed = true;
    }

    // Remove static-duration granted keywords
    if (meta.grantedKeywords && meta.grantedKeywords.length > 0) {
      const nonStatic = meta.grantedKeywords.filter((gk) => gk.duration !== "static");
      if (nonStatic.length !== meta.grantedKeywords.length) {
        ctx.cards.updateCardMeta(
          card.id as CoreCardId,
          {
            grantedKeywords: nonStatic.length > 0 ? nonStatic : undefined,
          } as Partial<RiftboundCardMeta>,
        );
        changed = true;
      }
    }
  }

  // Step 2: Scan board cards for static abilities and apply
  for (const card of boardCards) {
    const abilities = registry.getAbilities(card.id) ?? [];

    for (const ability of abilities) {
      if (ability.type !== "static") {
        continue;
      }

      // Evaluate condition (if any)
      const condition = ability.condition as Record<string, unknown> | undefined;
      if (condition && !evaluateCondition(condition, card, ctx)) {
        continue; // Condition not met — skip this ability
      }

      // Resolve targets
      const { affects } = ability as unknown as { affects?: string };
      const targetIds = resolveStaticTargets(affects, card, boardCards);

      // Apply effect
      const effect = ability.effect as Record<string, unknown> | undefined;
      if (effect) {
        applyStaticEffect(effect, targetIds, ctx);
        anyApplied = true;
      }
    }
  }

  return anyApplied;
}
