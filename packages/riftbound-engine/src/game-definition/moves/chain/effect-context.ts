/**
 * EffectContext builder + power-affordability helper (split from
 * chain-moves.ts). Leaf module: must not import move defs.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { EffectContext } from "../../../abilities/effect-executor";
import { fireTriggers } from "../../../abilities/trigger-runner";
import type { RiftboundCardMeta, RiftboundGameState } from "../../../types";

/**
 * Build an EffectContext from a move reducer's context.
 */
export function buildEffectContext(
  draft: RiftboundGameState,
  playerId: string,
  sourceCardId: string,
  context: {
    zones: {
      moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void;
      drawCards: (params: {
        count: number;
        from: CoreZoneId;
        to: CoreZoneId;
        playerId: CorePlayerId;
      }) => CoreCardId[];
      getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
      getCardZone: (cardId: CoreCardId) => CoreZoneId | undefined;
    };
    cards: {
      getCardOwner: (cardId: CoreCardId) => string | undefined;
      getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
      updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
    };
    counters: {
      setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
      addCounter: (cardId: CoreCardId, counter: string, amount: number) => void;
      removeCounter: (cardId: CoreCardId, counter: string, amount: number) => void;
      clearCounter: (cardId: CoreCardId, counter: string) => void;
    };
  },
): EffectContext {
  const zonesWithCreate = context.zones as typeof context.zones & {
    createCardInZone?: (params: {
      cardId: CoreCardId;
      definitionId: string;
      zoneId: CoreZoneId;
      ownerId: CorePlayerId;
      controllerId?: CorePlayerId;
    }) => void;
  };
  const triggerCtx = {
    cards: context.cards,
    counters: context.counters,
    draft,
    zones: context.zones,
  };
  return {
    cards: {
      getCardMeta: context.cards.getCardMeta as EffectContext["cards"]["getCardMeta"],
      getCardOwner: context.cards.getCardOwner,
      // rule-id: unl-192-219 — thread the live controller so friendly/enemy
      // target legality re-checks see control transfers.
      getCardController: (
        context.cards as { getCardController?: EffectContext["cards"]["getCardController"] }
      ).getCardController,
      // rule-id: sfd-109-221 — take-control needs to write the controller.
      setCardController: (
        context.cards as { setCardController?: EffectContext["cards"]["setCardController"] }
      ).setCardController,
      updateCardMeta: context.cards.updateCardMeta as EffectContext["cards"]["updateCardMeta"],
    },
    counters: context.counters,
    createCardInZone: zonesWithCreate.createCardInZone
      ? (cardId, zoneId, ownerId) => {
          // [invariant:no-console-errors] Ability-minted token instance ids
          // (token-<slug>-<ts>-<n>) are not valid definitionIds — the image
          // server only knows the shared token-def-<slug> ids used by the
          // manual addToken path. Derive that shared id here so snapshots
          // ship a resolvable definitionId instead of the instance id.
          const slug = /^token-(.+)-\d+-\d+$/.exec(cardId)?.[1];
          return zonesWithCreate.createCardInZone?.({
            cardId: cardId as CoreCardId,
            controllerId: ownerId as CorePlayerId,
            definitionId: slug ? `token-def-${slug}` : cardId,
            ownerId: ownerId as CorePlayerId,
            zoneId: zoneId as CoreZoneId,
          });
        }
      : undefined,
    draft,
    fireTriggers: (event) => fireTriggers(event, triggerCtx),
    playerId,
    sourceCardId,
    sourceZone: context.zones.getCardZone(sourceCardId as CoreCardId) as string | undefined,
    zones: context.zones,
  };
}

/**
 * Rule 135.2.e.5.a: a [rainbow] Power cost may be paid with Power of any
 * Domain. Return true if the pool can cover the given per-domain need,
 * treating "rainbow" as consuming from whichever domain has the most left.
 */
export function canAffordPower(
  pool: Partial<Record<string, number>>,
  needed: Record<string, number>,
): boolean {
  const remaining: Record<string, number> = {};
  for (const [d, v] of Object.entries(pool)) {
    if (typeof v === "number" && v > 0) {
      remaining[d] = v;
    }
  }
  let rainbowNeed = 0;
  for (const [d, count] of Object.entries(needed)) {
    if (d === "rainbow") {
      rainbowNeed += count;
      continue;
    }
    if ((remaining[d] ?? 0) < count) {
      return false;
    }
    remaining[d] -= count;
  }
  const leftover = Object.values(remaining).reduce((a, b) => a + b, 0);
  return leftover >= rainbowNeed;
}
