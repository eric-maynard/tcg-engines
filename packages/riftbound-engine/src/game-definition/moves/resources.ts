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
import { fireTriggers } from "../../abilities/trigger-runner";
import { getActiveShowdown } from "../../chain/chain-state";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { withPostMoveCleanup } from "../../cleanup/post-move-cleanup";
import { isPayPromptFor } from "./prompt-cost";

/**
 * rule 164.2.a/b + 312.1.a/b — a rune's "[Exhaust]: Add" / "Recycle this: Add"
 * are [Reaction] Add abilities, so only a player who currently holds Priority
 * may use them. While a chain is open Priority sits with `chain.activePlayer`
 * (rule 429.3's pay-costs window only ever opens for the player taking the
 * action, who holds Priority by definition). Outside a chain Priority still is
 * not free-floating: in a Showdown it sits with the Focus holder, and in a
 * Neutral Open state (rule 316.5.b / 310.1.a) only the turn player may act, so
 * an opponent may not bank resources on someone else's Open turn.
 */
function holdsRunePriority(state: RiftboundGameState, playerId: string): boolean {
  // rule 444.2.c — while a prompt raised by a RESOLVING item waits on this
  // player, the game is stopped on them; the Chain's `activePlayer` bookkeeping
  // (still the last player to pass) does not deny them a Reaction [Add]. Which
  // prompts open that window at all is decided by `runeAddAllowedDuringChoice`.
  const pending = state.pendingChoice as { playerId?: string; prompter?: string } | undefined;
  if (pending && (pending.playerId === playerId || pending.prompter === playerId)) {
    return true;
  }
  const chain = state.interaction?.chain;
  if (chain?.active) {
    return chain.activePlayer === playerId;
  }
  // rule 338.1.b.1 — a Showdown is a Closed State: only the Focus holder acts.
  const showdown = state.interaction ? getActiveShowdown(state.interaction) : null;
  if (showdown?.active) {
    return showdown.focusPlayer === playerId;
  }
  // rule 316.5.b / 310.1.a — Neutral Open state: the turn player holds Priority.
  return state.turn?.activePlayer === undefined || state.turn.activePlayer === playerId;
}

/**
 * rule 444.2.c / 429.3 / 357.1.a — a Pay demanded by a resolving or finalizing
 * ability ("you may pay [1] to …", "you may exhaust me and pay [rainbow] to
 * ready it") is still a Pay step, so the player being asked may activate a
 * rune's [Reaction] Add ability to fund it — the prompt stays open across the
 * activation (DESIGN.md §Paying costs: tap runes, THEN accept). Which prompts
 * are Pay steps is decided once, in `promptPayableCost`; every other pending
 * choice keeps the board frozen.
 */
function runeAddAllowedDuringChoice(state: RiftboundGameState, playerId: string): boolean {
  if (!state.pendingChoice) {
    return true;
  }
  return isPayPromptFor(state, playerId);
}

/**
 * Resource move definitions
 */
const resourceMoveDefs: Partial<
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
      if (state.pendingChoice) {
        return false;
      }
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
      if (!runeAddAllowedDuringChoice(state, context.params.playerId as string)) {
        return false;
      }
      if (state.status !== "playing") {
        return false;
      }

      // Players can exhaust runes to bank resources for a Reaction, but only
      // while they hold Priority (see holdsRunePriority).
      if (!holdsRunePriority(state, context.params.playerId as string)) {
        return false;
      }
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
      if (!runeAddAllowedDuringChoice(state, context.playerId as string)) {
        return [];
      }
      if (state.status !== "playing") {
        return [];
      }
      if (!holdsRunePriority(state, context.playerId as string)) {
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
      // rule 164.2.b / 429.3 — "Recycle this: [Reaction] — Add [C]" is an Add
      // ability like the exhaust one, so it stays usable inside the Pay window
      // a resolving ability opens (444.2.c); every other pending choice freezes it.
      if (!runeAddAllowedDuringChoice(state, context.params.playerId as string)) {
        return false;
      }
      if (state.status !== "playing") {
        return false;
      }

      // Same Priority gate as exhaustRune (rule 164.2.b / 312.1.b).
      if (!holdsRunePriority(state, context.params.playerId as string)) {
        return false;
      }
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
      if (!runeAddAllowedDuringChoice(state, context.playerId as string)) {
        return [];
      }
      if (state.status !== "playing") {
        return [];
      }
      if (!holdsRunePriority(state, context.playerId as string)) {
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

      // Rule 164.2.b: A Basic Rune's recycle ability is "Recycle this: Add [C]" —
      // it adds exactly 1 Power of the rune's domain. Energy is only produced by
      // the separate exhaust ability (164.2.a), never by recycling.
      const pool = draft.runePools[playerId];
      if (pool) {
        pool.power[domain] = (pool.power[domain] ?? 0) + 1;
      }

      // rule 164.2.b — using a Basic Rune's own "Recycle this: Add [C]" IS
      // "you recycle a rune", so it must emit the same `recycle` event that an
      // effect-driven recycle does ("When you recycle a rune, …").
      fireTriggers(
        { cardIds: [runeId as string], playerId: playerId as string, type: "recycle" },
        { cards: context.cards, counters: context.counters, draft, zones: context.zones },
      );
    },
  },

  /**
   * Add Resources
   *
   * Add energy and/or power to the player's rune pool.
   * Used for card effects that generate resources.
   */
  addResources: {
    condition: (state) => !state.pendingChoice && state.status === "playing",
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
    condition: (state) => !state.pendingChoice && state.status === "playing",
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

/**
 * rule 430.1 / 518-526: the number of runes a player has is a continuous
 * condition ("While you have 8+ runes, I have +4 [Might]"), so a move that
 * grows or shrinks the rune pool is followed by a Cleanup — otherwise the
 * static Might bonus stays stale until some unrelated move recalculates.
 * Only those moves are wrapped: `addResources` / `spendResources` shuffle
 * energy and power inside a play that is still in progress, and a Cleanup
 * there would reap board state that play still depends on.
 */
export const resourceMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  ...resourceMoveDefs,
  ...withPostMoveCleanup({
    channelRunes: resourceMoveDefs.channelRunes,
    exhaustRune: resourceMoveDefs.exhaustRune,
    recycleRune: resourceMoveDefs.recycleRune,
  }),
};
