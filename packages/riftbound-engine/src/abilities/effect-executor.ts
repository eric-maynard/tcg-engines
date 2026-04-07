/**
 * Effect Executor
 *
 * Executes ability effects by resolving targets and applying
 * game state mutations.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { GrantedKeyword, RiftboundCardMeta, RiftboundGameState } from "../types";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import { checkReplacement } from "./replacement-effects";
import type { TargetDescriptor } from "./target-resolver";
import { resolveTarget } from "./target-resolver";

/**
 * Simplified effect interface for execution.
 */
export interface ExecutableEffect {
  readonly type: string;
  readonly amount?: number | Record<string, unknown>;
  readonly target?: TargetDescriptor;
  readonly duration?: string;
  readonly token?: { name: string; type: string; might?: number; keywords?: string[] };
  readonly location?: string;
  readonly description?: string;
  readonly effects?: ExecutableEffect[];
  /** For attach effect: the equipment to attach */
  readonly equipment?: TargetDescriptor;
  /** For attach effect: the unit to attach to */
  readonly to?: TargetDescriptor;
  /** For detach: ready state override */
  readonly ready?: boolean;
  /** For grant-keyword: the keyword to grant */
  readonly keyword?: string;
  /** For grant-keywords: multiple keywords */
  readonly keywords?: string[];
  /** For grant-keyword: optional numeric value */
  readonly value?: number;
  /** For add-resource: energy amount */
  readonly energy?: number;
  /** For add-resource: power domains */
  readonly power?: string[];
  /** For heal: player specifier */
  readonly player?: string;
}

/**
 * Context for effect execution.
 */
export interface EffectContext {
  readonly playerId: string;
  readonly sourceCardId: string;
  readonly sourceZone?: string;
  readonly draft: RiftboundGameState;
  readonly zones: {
    moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void;
    drawCards: (params: {
      count: number;
      from: CoreZoneId;
      to: CoreZoneId;
      playerId: CorePlayerId;
    }) => void;
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    getCardZone: (cardId: CoreCardId) => string | undefined;
  };
  readonly cards: {
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardMeta?: (cardId: CoreCardId) => Record<string, unknown> | undefined;
    updateCardMeta?: (cardId: CoreCardId, meta: Record<string, unknown>) => void;
  };
  readonly counters: {
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
    addCounter: (cardId: CoreCardId, counter: string, amount: number) => void;
    removeCounter: (cardId: CoreCardId, counter: string, amount: number) => void;
    clearCounter: (cardId: CoreCardId, counter: string) => void;
  };
  /**
   * Create a new card instance directly in a zone.
   * Used for token creation (rule 170-178).
   * If not provided, create-token effects are silently skipped.
   */
  readonly createCardInZone?: (cardId: string, zoneId: string, ownerId: string) => void;
  /**
   * Fire triggers for a game event.
   * If not provided, trigger-dependent effects (become-mighty) are silently skipped.
   */
  readonly fireTriggers?: (event: import("./game-events").GameEvent) => void;
}

/**
 * Resolve targets for an effect using the target resolver.
 */
function getTargetIds(effect: ExecutableEffect, ctx: EffectContext): string[] {
  return resolveTarget(effect.target, {
    cards: ctx.cards,
    draft: ctx.draft,
    playerId: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    sourceZone: ctx.sourceZone,
    zones: ctx.zones,
  });
}

/** Mighty threshold — units with Might >= 5 are "Mighty" */
const MIGHTY_THRESHOLD = 5;

/**
 * Calculate a unit's effective Might from its definition and metadata.
 */
function getEffectiveMight(cardId: string, ctx: EffectContext): number {
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId);
  const baseMight = def?.might ?? 0;
  if (baseMight === 0) {
    return 0;
  } // Not a unit

  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  const buffBonus = meta?.buffed ? 1 : 0;
  const mightMod = meta?.mightModifier ?? 0;
  const staticBonus = meta?.staticMightBonus ?? 0;

  let equipBonus = 0;
  for (const equipId of meta?.equippedWith ?? []) {
    equipBonus += registry.getMightBonus(equipId);
  }

  return Math.max(0, baseMight + buffBonus + mightMod + staticBonus + equipBonus);
}

/**
 * Resolve an AmountExpression to a numeric value.
 *
 * Handles dynamic amounts like "equal to this unit's Might",
 * "number of cards in hand", "number of cards in trash", or "count of matching targets".
 */
function resolveAmount(amount: number | Record<string, unknown>, ctx: EffectContext): number {
  if (typeof amount === "number") {
    return amount;
  }

  // Handle AmountExpression objects
  if ("might" in amount) {
    const target = amount.might as string;
    if (target === "self") {
      return getEffectiveMight(ctx.sourceCardId, ctx);
    }
  }
  if ("cardsInHand" in amount) {
    const whose = amount.cardsInHand as string;
    const pid =
      whose === "opponent"
        ? (Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId) ?? ctx.playerId)
        : ctx.playerId;
    return ctx.zones.getCardsInZone("hand" as CoreZoneId, pid as CorePlayerId).length;
  }
  if ("cardsInTrash" in amount) {
    const whose = amount.cardsInTrash as string;
    const pid =
      whose === "opponent"
        ? (Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId) ?? ctx.playerId)
        : ctx.playerId;
    return ctx.zones.getCardsInZone("trash" as CoreZoneId, pid as CorePlayerId).length;
  }
  if ("count" in amount) {
    // Count matching targets
    const target = amount.count as TargetDescriptor;
    return resolveTarget(target, {
      cards: ctx.cards,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      sourceZone: ctx.sourceZone,
      zones: ctx.zones,
    }).length;
  }
  return 0;
}

/**
 * Check if a Might change crosses the Mighty threshold upward,
 * and fire the "become-mighty" trigger if so.
 * Returns true if the trigger fired.
 */
function checkBecomesMighty(cardId: string, mightBefore: number, ctx: EffectContext): boolean {
  const mightAfter = getEffectiveMight(cardId, ctx);
  if (mightBefore < MIGHTY_THRESHOLD && mightAfter >= MIGHTY_THRESHOLD) {
    // Fire become-mighty trigger if fireTriggers is available
    if (ctx.fireTriggers) {
      const owner = ctx.cards.getCardOwner(cardId as CoreCardId) ?? "";
      ctx.fireTriggers({ cardId, owner, type: "become-mighty" });
    }
    return true;
  }
  return false;
}

/**
 * Execute a single effect.
 */
export function executeEffect(effect: ExecutableEffect, ctx: EffectContext): void {
  switch (effect.type) {
    case "draw": {
      const rawDrawCount = effect.amount ?? 1;
      const drawCount =
        typeof rawDrawCount === "number" ? rawDrawCount : resolveAmount(rawDrawCount, ctx);
      for (let i = 0; i < drawCount; i++) {
        // Check if deck is empty → Burn Out (rule 518)
        const deckCards = ctx.zones.getCardsInZone(
          "mainDeck" as CoreZoneId,
          ctx.playerId as CorePlayerId,
        );
        if (deckCards.length === 0) {
          // Move trash to deck
          const trashCards = ctx.zones.getCardsInZone(
            "trash" as CoreZoneId,
            ctx.playerId as CorePlayerId,
          );
          for (const cardId of trashCards) {
            ctx.zones.moveCard({
              cardId,
              targetZoneId: "mainDeck" as CoreZoneId,
            });
          }
          // Opponent scores 1 point
          for (const opponentId of Object.keys(ctx.draft.players)) {
            if (opponentId !== ctx.playerId) {
              const opponent = ctx.draft.players[opponentId];
              if (opponent) {
                opponent.victoryPoints += 1;
              }
            }
          }
          // If deck is still empty after burn out, can't draw
          const refreshedDeck = ctx.zones.getCardsInZone(
            "mainDeck" as CoreZoneId,
            ctx.playerId as CorePlayerId,
          );
          if (refreshedDeck.length === 0) {
            break;
          }
        }
        // Draw 1 card
        ctx.zones.drawCards({
          count: 1,
          from: "mainDeck" as CoreZoneId,
          playerId: ctx.playerId as CorePlayerId,
          to: "hand" as CoreZoneId,
        });
      }
      break;
    }

    case "damage": {
      const rawAmount = effect.amount ?? 1;
      const amount =
        typeof rawAmount === "number"
          ? rawAmount
          : resolveAmount(rawAmount as Record<string, unknown>, ctx);
      const targets = getTargetIds(effect, ctx);
      for (const targetId of targets) {
        // Check for "take-damage" replacement effects
        const owner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? "";
        const replacementCtx = {
          cards: {
            getCardMeta: ctx.cards.getCardMeta ?? (() => undefined),
            getCardOwner: ctx.cards.getCardOwner,
          },
          draft: ctx.draft,
          zones: { getCardsInZone: ctx.zones.getCardsInZone },
        };
        const replacement = checkReplacement(
          { amount, cardId: targetId, owner, type: "take-damage" },
          replacementCtx as Parameters<typeof checkReplacement>[1],
        );
        if (replacement) {
          // Damage was replaced (e.g., "prevent" or alternative effect)
          if (replacement.replacement !== "prevent" && replacement.replacement) {
            executeEffect(replacement.replacement as ExecutableEffect, ctx);
          }
          continue;
        }
        ctx.counters.addCounter(targetId as CoreCardId, "damage", amount);
      }
      break;
    }

    case "kill": {
      const targets = getTargetIds(effect, ctx);
      for (const targetId of targets) {
        ctx.zones.moveCard({
          cardId: targetId as CoreCardId,
          targetZoneId: "trash" as CoreZoneId,
        });
      }
      break;
    }

    case "buff": {
      const targets = getTargetIds(effect, ctx);
      const buffTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      for (const targetId of buffTargets) {
        // Enforce max 1 buff per unit (rule)
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        if (meta?.buffed) {
          continue; // Already buffed — skip
        }
        const mightBefore = getEffectiveMight(targetId, ctx);
        ctx.counters.setFlag(targetId as CoreCardId, "buffed", true);
        checkBecomesMighty(targetId, mightBefore, ctx);
      }
      break;
    }

    case "score": {
      const amount = resolveAmount(effect.amount ?? 1, ctx);
      const player = ctx.draft.players[ctx.playerId];
      if (player) {
        player.victoryPoints += amount;
      }
      break;
    }

    case "channel": {
      const count = resolveAmount(effect.amount ?? 1, ctx);
      for (let i = 0; i < count; i++) {
        const runes = ctx.zones.getCardsInZone(
          "runeDeck" as CoreZoneId,
          ctx.playerId as CorePlayerId,
        );
        if (runes[0]) {
          ctx.zones.moveCard({
            cardId: runes[0],
            targetZoneId: "base" as CoreZoneId,
          });
        }
      }
      break;
    }

    case "ready": {
      const targets = getTargetIds(effect, ctx);
      if (targets.length === 0) {
        ctx.counters.setFlag(ctx.sourceCardId as CoreCardId, "exhausted", false);
      } else {
        for (const targetId of targets) {
          ctx.counters.setFlag(targetId as CoreCardId, "exhausted", false);
        }
      }
      break;
    }

    case "exhaust": {
      const targets = getTargetIds(effect, ctx);
      if (targets.length === 0) {
        ctx.counters.setFlag(ctx.sourceCardId as CoreCardId, "exhausted", true);
      } else {
        for (const targetId of targets) {
          ctx.counters.setFlag(targetId as CoreCardId, "exhausted", true);
        }
      }
      break;
    }

    case "stun": {
      const targets = getTargetIds(effect, ctx);
      if (targets.length === 0) {
        ctx.counters.setFlag(ctx.sourceCardId as CoreCardId, "stunned", true);
      } else {
        for (const targetId of targets) {
          ctx.counters.setFlag(targetId as CoreCardId, "stunned", true);
        }
      }
      break;
    }

    case "recall": {
      const targets = getTargetIds(effect, ctx);
      if (targets.length === 0) {
        ctx.zones.moveCard({
          cardId: ctx.sourceCardId as CoreCardId,
          targetZoneId: "base" as CoreZoneId,
        });
      } else {
        for (const targetId of targets) {
          ctx.zones.moveCard({
            cardId: targetId as CoreCardId,
            targetZoneId: "base" as CoreZoneId,
          });
        }
      }
      break;
    }

    case "discard": {
      const count = resolveAmount(effect.amount ?? 1, ctx);
      const hand = ctx.zones.getCardsInZone("hand" as CoreZoneId, ctx.playerId as CorePlayerId);
      for (let i = 0; i < Math.min(count, hand.length); i++) {
        if (hand[i]) {
          ctx.zones.moveCard({
            cardId: hand[i],
            targetZoneId: "trash" as CoreZoneId,
          });
        }
      }
      break;
    }

    case "return-to-hand": {
      const targets = getTargetIds(effect, ctx);
      if (targets.length === 0) {
        ctx.zones.moveCard({
          cardId: ctx.sourceCardId as CoreCardId,
          targetZoneId: "hand" as CoreZoneId,
        });
      } else {
        for (const targetId of targets) {
          ctx.zones.moveCard({
            cardId: targetId as CoreCardId,
            targetZoneId: "hand" as CoreZoneId,
          });
        }
      }
      break;
    }

    case "modify-might": {
      const targets = getTargetIds(effect, ctx);
      const amount = resolveAmount(effect.amount ?? 0, ctx);
      for (const targetId of targets) {
        const mightBefore = getEffectiveMight(targetId, ctx);
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const currentMod = meta?.mightModifier ?? 0;
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          {
            mightModifier: currentMod + amount,
          } as unknown as Record<string, unknown>,
        );
        checkBecomesMighty(targetId, mightBefore, ctx);
      }
      break;
    }

    case "heal": {
      const healAmount = resolveAmount(effect.amount ?? 1, ctx);
      const targets = getTargetIds(effect, ctx);
      const healTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      for (const targetId of healTargets) {
        ctx.counters.removeCounter(targetId as CoreCardId, "damage", healAmount);
        // Healing can cross the Mighty threshold (less damage = higher effective Might)
        // But we track Might via base stats, not damage. Damage only matters for death checks.
      }
      break;
    }

    case "grant-keyword": {
      const kw = effect.keyword;
      if (!kw) {
        break;
      }
      const targets = getTargetIds(effect, ctx);
      const kwTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      const duration = (effect.duration ?? "turn") as "turn" | "permanent" | "combat";
      for (const targetId of kwTargets) {
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const existing = meta?.grantedKeywords ?? [];
        const entry: GrantedKeyword = { duration, keyword: kw, value: effect.value };
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          {
            grantedKeywords: [...existing, entry],
          } as unknown as Record<string, unknown>,
        );
      }
      break;
    }

    case "grant-keywords": {
      const kws = effect.keywords;
      if (!kws || kws.length === 0) {
        break;
      }
      const targets = getTargetIds(effect, ctx);
      const kwTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      const duration = (effect.duration ?? "turn") as "turn" | "permanent" | "combat";
      for (const targetId of kwTargets) {
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const existing = meta?.grantedKeywords ?? [];
        const entries: GrantedKeyword[] = kws.map((k) => ({ duration, keyword: k }));
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          {
            grantedKeywords: [...existing, ...entries],
          } as unknown as Record<string, unknown>,
        );
      }
      break;
    }

    case "add-resource": {
      const pool = ctx.draft.runePools[ctx.playerId];
      if (pool) {
        if (effect.energy) {
          pool.energy += effect.energy;
        }
        if (effect.power) {
          for (const domain of effect.power) {
            const key = domain as keyof typeof pool.power;
            pool.power[key] = (pool.power[key] ?? 0) + 1;
          }
        }
      }
      break;
    }

    case "banish": {
      const targets = getTargetIds(effect, ctx);
      for (const targetId of targets) {
        ctx.zones.moveCard({
          cardId: targetId as CoreCardId,
          targetZoneId: "banishment" as CoreZoneId,
        });
      }
      break;
    }

    case "counter": {
      // Counter a spell — mark the next item on the chain as countered
      // So its effect is skipped during resolution (rule 543)
      const chain = ctx.draft.interaction?.chain;
      if (chain && chain.items.length > 0) {
        // The item below the counter on the stack is the target
        // (counter was on top, already popped; the new top is the target)
        const { items } = chain;
        if (items.length > 0) {
          const targetItem = items[items.length - 1];
          if (targetItem && !targetItem.countered) {
            // Mutate in-place (we're inside an Immer draft)
            (targetItem as { countered: boolean }).countered = true;
          }
        }
      }
      break;
    }

    case "create-token": {
      if (!ctx.createCardInZone) {
        break;
      }
      const tokenDef = effect.token;
      if (!tokenDef) {
        break;
      }
      const count = resolveAmount(effect.amount ?? 1, ctx);
      let targetZone: string;
      if (effect.location === "here" && ctx.sourceZone) {
        targetZone = ctx.sourceZone;
      } else if (effect.location && effect.location !== "here") {
        targetZone = effect.location as string;
      } else {
        targetZone = "base";
      }

      const registry = getGlobalCardRegistry();
      for (let i = 0; i < count; i++) {
        const tokenId = `token-${tokenDef.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${i}`;
        ctx.createCardInZone(tokenId, targetZone, ctx.playerId);
        registry.register(tokenId, {
          cardType: tokenDef.type === "gear" ? "gear" : "unit",
          id: tokenId,
          keywords: tokenDef.keywords,
          might: tokenDef.might,
          name: tokenDef.name,
        });
      }
      break;
    }

    case "attach": {
      const equipTargets = getTargetIds(
        { ...effect, target: effect.equipment } as ExecutableEffect,
        ctx,
      );
      const unitTargets = getTargetIds({ ...effect, target: effect.to } as ExecutableEffect, ctx);
      if (equipTargets[0] && unitTargets[0]) {
        ctx.counters.setFlag(equipTargets[0] as CoreCardId, "attachedTo", true);
      }
      break;
    }

    case "detach": {
      const detachTargets = getTargetIds(
        { ...effect, target: effect.equipment } as ExecutableEffect,
        ctx,
      );
      if (detachTargets[0]) {
        ctx.counters.setFlag(detachTargets[0] as CoreCardId, "attachedTo", false);
      }
      break;
    }

    case "sequence": {
      if (effect.effects) {
        for (const subEffect of effect.effects) {
          executeEffect(subEffect, ctx);
        }
      }
      break;
    }

    // ================================================================
    // Control-Flow Effects
    // ================================================================

    case "conditional": {
      // If condition is met, execute "then"; otherwise execute "else"
      // For now, always execute "then" (condition evaluation requires static ability layer)
      const thenEffect = (effect as unknown as { then?: ExecutableEffect }).then;
      if (thenEffect) {
        executeEffect(thenEffect, ctx);
      }
      break;
    }

    case "optional": {
      // "You may..." — execute the inner effect (auto-apply for now)
      const innerEffect = (effect as unknown as { effect?: ExecutableEffect }).effect;
      if (innerEffect) {
        executeEffect(innerEffect, ctx);
      }
      break;
    }

    case "choice": {
      // Player chooses one option — pick the first option for now (needs UI input)
      const { options } = effect as unknown as { options?: { effect: ExecutableEffect }[] };
      if (options && options.length > 0 && options[0]?.effect) {
        executeEffect(options[0].effect, ctx);
      }
      break;
    }

    case "for-each": {
      // Repeat effect for each matching target
      const forEachTarget = (effect as unknown as { target?: TargetDescriptor }).target;
      const forEachEffect = (effect as unknown as { effect?: ExecutableEffect }).effect;
      if (forEachTarget && forEachEffect) {
        const targets = resolveTarget(forEachTarget, {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        });
        for (const targetId of targets) {
          // Execute the effect with target overridden to this specific card
          executeEffect(
            { ...forEachEffect, target: { type: "self" } },
            {
              ...ctx,
              sourceCardId: targetId,
            },
          );
        }
      }
      break;
    }

    case "do-times": {
      const times = (effect as unknown as { times?: number }).times ?? 1;
      const repeatedEffect = (effect as unknown as { effect?: ExecutableEffect }).effect;
      if (repeatedEffect) {
        for (let i = 0; i < times; i++) {
          executeEffect(repeatedEffect, ctx);
        }
      }
      break;
    }

    // ================================================================
    // Remaining Mechanical Effects
    // ================================================================

    case "fight": {
      // Two units deal damage equal to their Might to each other
      const attackerTarget = (effect as unknown as { attacker?: TargetDescriptor }).attacker;
      const defenderTarget = (effect as unknown as { defender?: TargetDescriptor }).defender;
      if (attackerTarget && defenderTarget) {
        const attackers = resolveTarget(attackerTarget, {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        });
        const defenders = resolveTarget(defenderTarget, {
          cards: ctx.cards,
          draft: ctx.draft,
          playerId: ctx.playerId,
          sourceCardId: ctx.sourceCardId,
          sourceZone: ctx.sourceZone,
          zones: ctx.zones,
        });
        if (attackers[0] && defenders[0]) {
          const reg = getGlobalCardRegistry();
          const aMight = reg.getMight(attackers[0]);
          const dMight = reg.getMight(defenders[0]);
          if (aMight > 0) {
            ctx.counters.addCounter(defenders[0] as CoreCardId, "damage", aMight);
          }
          if (dMight > 0) {
            ctx.counters.addCounter(attackers[0] as CoreCardId, "damage", dMight);
          }
        }
      }
      break;
    }

    case "play": {
      // Play a card from trash, deck, or hand (move to board)
      const playFrom = (effect as unknown as { from?: string }).from ?? "hand";
      const targets = getTargetIds(effect, ctx);
      for (const targetId of targets) {
        // Move card to base (default play location)
        ctx.zones.moveCard({
          cardId: targetId as CoreCardId,
          targetZoneId: "base" as CoreZoneId,
        });
      }
      break;
    }

    case "look": {
      // Peek at top N cards of a zone — informational only, no state change needed
      // In a full UI implementation this would show cards to the player
      break;
    }

    case "reveal": {
      // Reveal cards — informational only for now
      break;
    }

    case "prevent-damage": {
      // Set a damage prevention shield — store on card meta
      const targets = getTargetIds(effect, ctx);
      const preventTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      const preventAmount = resolveAmount(effect.amount ?? 0, ctx);
      for (const targetId of preventTargets) {
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          {
            damagePreventionShield: preventAmount,
          } as unknown as Record<string, unknown>,
        );
      }
      break;
    }

    case "take-control": {
      // Change controller of a card — for now just note the intent
      // Full implementation needs controller tracking in core
      break;
    }

    case "enter-ready": {
      const targets = getTargetIds(effect, ctx);
      const enterTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      for (const targetId of enterTargets) {
        ctx.counters.setFlag(targetId as CoreCardId, "exhausted", false);
      }
      break;
    }

    case "cost-reduction": {
      const amount = resolveAmount(effect.amount ?? 0, ctx);
      const targets = getTargetIds(effect, ctx);
      const costTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      for (const targetId of costTargets) {
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const current = meta?.costModifier ?? 0;
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          { costModifier: current - amount } as unknown as Record<string, unknown>,
        );
      }
      break;
    }

    case "cost-increase": {
      const amount = resolveAmount(effect.amount ?? 0, ctx);
      const targets = getTargetIds(effect, ctx);
      const costTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
      for (const targetId of costTargets) {
        const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const current = meta?.costModifier ?? 0;
        ctx.cards.updateCardMeta?.(
          targetId as CoreCardId,
          { costModifier: current + amount } as unknown as Record<string, unknown>,
        );
      }
      break;
    }

    case "additional-cost": {
      if (ctx.draft.additionalCostsPaid) {
        ctx.draft.additionalCostsPaid[ctx.sourceCardId] = true;
      }
      break;
    }

    default: {
      break;
    }
  }
}
