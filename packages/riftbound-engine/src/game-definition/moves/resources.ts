/**
 * Riftbound Resource Moves
 *
 * Moves for resource management: channeling runes, tapping for energy,
 * recycling for power, and managing the rune pool.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { Domain, RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { getGlobalCardRegistry } from "../../operations/card-lookup";

/**
 * Resource move definitions
 */
export const resourceMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  /**
   * Channel Runes
   *
   * Take runes from the top of the Rune Deck and put them in the Rune Pool.
   * During Channel Phase, players channel 2 runes.
   */
  channelRunes: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
      // Rule 606.3.a: channelling is a *directed* Game Action. It can only
      // Occur when a game effect (e.g., the channel-phase flow hook) drives
      // It — not as a free, player-discretionary action. Callers from the
      // Flow / game-effect layer pass `directed: true`; raw player moves
      // Omit it and are rejected here.
      if (context.params.directed !== true) {
        return false;
      }
      return true;
    },
    reducer: (_draft, context) => {
      const { playerId, count } = context.params;
      const { zones } = context;

      // Move runes from rune deck to rune pool
      zones.bulkMove({
        count,
        from: "runeDeck" as CoreZoneId,
        playerId: playerId as CorePlayerId,
        to: "runePool" as CoreZoneId,
      });
    },
  },

  /**
   * Exhaust Rune for Energy
   *
   * Tap (exhaust) a rune to add 1 Energy to the Rune Pool.
   * Basic runes have: "[T]: Add [1]"
   */
  exhaustRune: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }

      // Players can exhaust runes at any time (needed to pay for reaction spells on opponent's turn)
      const zone = context.zones.getCardZone(context.params.runeId as CoreCardId);
      if (zone !== "runePool") {
        return false;
      }

      const owner = context.cards.getCardOwner(context.params.runeId as CoreCardId);
      if ((owner as string) !== context.params.playerId) {
        return false;
      }

      if (context.counters.getFlag(context.params.runeId as CoreCardId, "exhausted")) {
        return false;
      }

      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }

      const runePoolCards = context.zones.getCardsInZone(
        "runePool" as CoreZoneId,
        context.playerId as CorePlayerId,
      );

      const results: { playerId: string; runeId: string }[] = [];
      for (const cardId of runePoolCards) {
        if (context.counters.getFlag(cardId, "exhausted")) {
          continue;
        }
        results.push({ playerId: context.playerId as string, runeId: cardId as string });
      }
      return results;
    },
    reducer: (draft, context) => {
      const { playerId, runeId } = context.params;
      const { counters } = context;

      // Exhaust the rune
      counters.setFlag(runeId as CoreCardId, "exhausted", true);

      // Add 1 energy to the rune pool
      const pool = draft.runePools[playerId];
      if (pool) {
        pool.energy += 1;
      }
    },
  },

  /**
   * Recycle Rune for Power
   *
   * Recycle a rune to the bottom of the Rune Deck to add 1 Power
   * of that rune's domain to the Rune Pool.
   * Basic runes have: "Recycle this: Add [C]" (domain-specific)
   */
  recycleRune: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }

      // Players can recycle runes at any time (needed to pay for reaction spells on opponent's turn)
      const zone = context.zones.getCardZone(context.params.runeId as CoreCardId);
      if (zone !== "runePool") {
        return false;
      }

      const owner = context.cards.getCardOwner(context.params.runeId as CoreCardId);
      if ((owner as string) !== context.params.playerId) {
        return false;
      }

      // Rule 594: Recycling has no restriction on exhausted runes.
      // A player can recycle an exhausted rune for power.

      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }

      const registry = getGlobalCardRegistry();
      const runePoolCards = context.zones.getCardsInZone(
        "runePool" as CoreZoneId,
        context.playerId as CorePlayerId,
      );

      // Rule 594: No restriction on exhausted runes — players can recycle tapped runes.
      const results: { playerId: string; runeId: string; domain: Domain }[] = [];
      for (const cardId of runePoolCards) {
        // Look up the rune's domain from card definition
        const def = registry.get(cardId as string);
        const domain = def?.domain;
        const domainStr = Array.isArray(domain) ? domain[0] : domain;
        if (domainStr) {
          results.push({
            domain: domainStr as Domain,
            playerId: context.playerId as string,
            runeId: cardId as string,
          });
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const { playerId, runeId, domain } = context.params;
      const { zones } = context;

      // Move rune to bottom of rune deck
      zones.moveCard({
        cardId: runeId as CoreCardId,
        position: "bottom",
        targetZoneId: "runeDeck" as CoreZoneId,
      });

      // Add 1 energy and 1 power of the specified domain
      const pool = draft.runePools[playerId];
      if (pool) {
        pool.energy += 1;
        pool.power[domain] = (pool.power[domain] ?? 0) + 1;
      }
    },
  },

  /**
   * Add Resources
   *
   * Add energy and/or power to the player's rune pool.
   * Used for card effects that generate resources.
   */
  addResources: {
    condition: (state) => state.status === "playing",
    reducer: (draft, context) => {
      const { playerId, energy = 0, power = {} } = context.params;

      const pool = draft.runePools[playerId];
      if (pool) {
        // Add energy
        pool.energy += energy;

        // Add power for each domain
        for (const [domain, amount] of Object.entries(power)) {
          if (amount && amount > 0) {
            pool.power[domain as Domain] = (pool.power[domain as Domain] ?? 0) + amount;
          }
        }
      }
    },
  },

  /**
   * Spend Resources
   *
   * Spend energy and/or power from the player's rune pool.
   * Used for paying costs.
   */
  spendResources: {
    condition: (state) => state.status === "playing",
    reducer: (draft, context) => {
      const { playerId, energy = 0, power = {} } = context.params;

      const pool = draft.runePools[playerId];
      if (pool) {
        // Spend energy
        pool.energy = Math.max(0, pool.energy - energy);

        // Spend power for each domain
        for (const [domain, amount] of Object.entries(power)) {
          if (amount && amount > 0) {
            const current = pool.power[domain as Domain] ?? 0;
            pool.power[domain as Domain] = Math.max(0, current - amount);
          }
        }
      }
    },
  },
};
