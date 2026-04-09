/**
 * State-Based Checks & Cleanup
 *
 * Implements rules 518-526: automatic game state corrections that occur
 * after chain resolution, movement, showdowns, and combat.
 *
 * Cleanup steps (rule 519):
 * 1. Kill units with damage >= might (rule 520)
 * 2. Remove stale combat roles (rule 521)
 * 3. Execute state-based effects — "while"/"as long as" conditions (rule 522)
 * 4. Remove orphaned hidden cards (rule 523)
 * 5. Mark combat as pending where opposing units meet (rule 524)
 *
 * This function is designed to be called after any state mutation:
 * - After a chain item resolves
 * - After a move completes
 * - After a showdown completes
 * - After combat completes
 * - At end of turn (ending phase)
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { checkReplacement } from "../abilities/replacement-effects";
import { recalculateStaticEffects } from "../abilities/static-abilities";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

/**
 * Context needed for state-based checks.
 * Passed from move reducers or flow hooks.
 */
export interface CleanupContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void;
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
  };
  readonly cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
  readonly counters: {
    getCounter: (cardId: CoreCardId, counter: string) => number;
    clearCounter: (cardId: CoreCardId, counter: string) => void;
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
  };
}

/**
 * Result of running state-based checks.
 */
export interface CleanupResult {
  /** Card IDs of units killed by damage >= might */
  readonly killed: string[];
  /** Card IDs of hidden cards removed */
  readonly hiddenRemoved: string[];
  /** Battlefield IDs where combat is now pending */
  readonly combatPending: string[];
  /** Whether any state changes occurred (may need to re-run) */
  readonly stateChanged: boolean;
}

/**
 * Run all state-based checks and cleanup (rules 518-526).
 *
 * Returns what changed so callers can fire appropriate triggers.
 */
export function performCleanup(ctx: CleanupContext): CleanupResult {
  const killed: string[] = [];
  const hiddenRemoved: string[] = [];
  const combatPending: string[] = [];
  let stateChanged = false;

  // Step 1: Kill units with damage >= might (rule 520)
  const registry = getGlobalCardRegistry();
  const allBoardZones = getBoardZoneIds(ctx);

  // Snapshot all board cards first (so removals don't affect iteration)
  const boardCards: { cardId: CoreCardId; zoneId: string }[] = [];
  for (const zoneId of allBoardZones) {
    const cardsInZone = ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    for (const cardId of cardsInZone) {
      boardCards.push({ cardId, zoneId });
    }
  }

  for (const { cardId } of boardCards) {
    const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
    const damage = meta?.damage ?? 0;

    if (damage <= 0) {
      continue;
    }

    // Look up base might from card definition
    const def = registry.get(cardId as string);
    const baseMight = def?.might ?? 0;

    // Only units have might — skip non-units
    if (baseMight <= 0) {
      continue;
    }

    if (damage >= baseMight) {
      // Check for replacement effects ("instead of dying...") (rule 571-575)
      const owner = ctx.cards.getCardOwner(cardId) ?? "";
      const replacementMatch = checkReplacement(
        { cardId: cardId as string, owner, type: "die" },
        { cards: ctx.cards, draft: ctx.draft, zones: ctx.zones },
      );
      if (replacementMatch) {
        // Replacement intercepted the death — skip normal kill
        // The replacement effect itself (e.g., "kill this instead, recall that unit")
        // Would be executed by the caller if needed.
        // For "prevent", just skip the kill entirely.
        if (replacementMatch.replacement !== "prevent") {
          // Non-prevent replacements store an effect to execute
          // For now, mark that a replacement occurred and skip the kill
        }
        stateChanged = true;
        // Clear damage so it doesn't re-trigger next cleanup pass
        ctx.cards.updateCardMeta(cardId, { damage: 0 } as Partial<RiftboundCardMeta>);
        continue;
      }

      // Detach any equipment before killing (equipment returns to owner's base)
      const unitMeta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      const equippedWith = unitMeta?.equippedWith ?? [];
      for (const equipId of equippedWith) {
        ctx.cards.updateCardMeta(
          equipId as CoreCardId,
          {
            attachedTo: undefined,
          } as Partial<RiftboundCardMeta>,
        );
        ctx.zones.moveCard({
          cardId: equipId as CoreCardId,
          targetZoneId: "base" as CoreZoneId,
        });
      }

      // Kill this unit — move to trash
      ctx.zones.moveCard({
        cardId,
        targetZoneId: "trash" as CoreZoneId,
      });

      // Clear all temporary metadata (rule 170+: zone change clears all mods)
      ctx.cards.updateCardMeta(cardId, {
        buffed: false,
        combatRole: null,
        damage: 0,
        equippedWith: undefined,
        exhausted: false,
        grantedKeywords: undefined,
        mightModifier: 0,
        stunned: false,
      } as Partial<RiftboundCardMeta>);

      killed.push(cardId as string);
      stateChanged = true;
    }
  }

  // Step 2: Remove stale combat roles (rule 521)
  // Units not at a battlefield where combat is occurring lose their combat role
  for (const zoneId of allBoardZones) {
    const cardsInZone = ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    const isBattlefield = (zoneId as string).startsWith("battlefield-");

    for (const cardId of cardsInZone) {
      const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      if (meta?.combatRole && !isBattlefield) {
        ctx.cards.updateCardMeta(cardId, {
          combatRole: null,
        } as Partial<RiftboundCardMeta>);
        stateChanged = true;
      }
    }
  }

  // Step 3: Recalculate static/passive ability effects (rule 522)
  // Strip and re-apply all "While X" / "As long as" continuous effects
  if (recalculateStaticEffects({ cards: ctx.cards, draft: ctx.draft, zones: ctx.zones })) {
    stateChanged = true;
  }

  // Step 4: Remove orphaned hidden cards (rule 523)
  // Hidden cards at battlefields without a friendly unit are trashed
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const facedownZoneId = `facedown-${bfId}` as CoreZoneId;
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;

    const hiddenCards = ctx.zones.getCardsInZone(facedownZoneId);
    if (hiddenCards.length === 0) {
      continue;
    }

    const bfUnits = ctx.zones.getCardsInZone(bfZoneId);

    for (const hiddenCardId of hiddenCards) {
      const hiddenOwner = ctx.cards.getCardOwner(hiddenCardId) ?? "";

      // Check if the hidden card's controller has a unit at this battlefield
      const hasFriendlyUnit = bfUnits.some((unitId) => {
        const unitOwner = ctx.cards.getCardOwner(unitId) ?? "";
        return unitOwner === hiddenOwner;
      });

      if (!hasFriendlyUnit) {
        // Remove hidden card to trash
        ctx.zones.moveCard({
          cardId: hiddenCardId,
          targetZoneId: "trash" as CoreZoneId,
        });
        ctx.cards.updateCardMeta(hiddenCardId, {
          hidden: false,
          hiddenAt: undefined,
        } as Partial<RiftboundCardMeta>);
        hiddenRemoved.push(hiddenCardId as string);
        stateChanged = true;
      }
    }
  }

  // Step 5: Auto-recall gear from battlefields to base (rule 518)
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const cardsAtBf = ctx.zones.getCardsInZone(bfZoneId);

    for (const cardId of cardsAtBf) {
      const def = registry.get(cardId as string);
      // Only auto-recall gear (not units, not equipment attached to units)
      if (def?.cardType === "gear") {
        const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
        // Don't recall if it's attached as equipment
        if (!meta?.attachedTo) {
          ctx.zones.moveCard({
            cardId,
            targetZoneId: "base" as CoreZoneId,
          });
          stateChanged = true;
        }
      }
    }
  }

  // Step 6: Mark combat as pending (rule 524)
  for (const [bfId, bf] of Object.entries(ctx.draft.battlefields)) {
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const unitsAtBf = ctx.zones.getCardsInZone(bfZoneId);

    if (unitsAtBf.length < 2) {
      continue;
    }

    // Check if units belong to 2+ different players
    const owners = new Set<string>();
    for (const unitId of unitsAtBf) {
      const owner = ctx.cards.getCardOwner(unitId) ?? "";
      if (owner) {
        owners.add(owner);
      }
    }

    if (owners.size >= 2 && !bf.contested) {
      combatPending.push(bfId);
      stateChanged = true;
    }
  }

  return { combatPending, hiddenRemoved, killed, stateChanged };
}

/**
 * Run cleanup repeatedly until no more state changes occur.
 * This handles cascading effects (e.g., killing a unit triggers deathknell,
 * which deals damage, which kills another unit).
 *
 * Safety valve: max 10 iterations to prevent infinite loops.
 */
export function performFullCleanup(ctx: CleanupContext): CleanupResult {
  const allKilled: string[] = [];
  const allHiddenRemoved: string[] = [];
  const allCombatPending: string[] = [];

  for (let i = 0; i < 10; i++) {
    const result = performCleanup(ctx);
    allKilled.push(...result.killed);
    allHiddenRemoved.push(...result.hiddenRemoved);
    allCombatPending.push(...result.combatPending);

    if (!result.stateChanged) {
      break;
    }
  }

  return {
    combatPending: allCombatPending,
    hiddenRemoved: allHiddenRemoved,
    killed: allKilled,
    stateChanged:
      allKilled.length > 0 || allHiddenRemoved.length > 0 || allCombatPending.length > 0,
  };
}

/**
 * Get all zone IDs where cards could be on the board.
 */
function getBoardZoneIds(ctx: CleanupContext): string[] {
  const zones: string[] = ["base"];

  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    zones.push(`battlefield-${bfId}`);
  }

  return zones;
}
