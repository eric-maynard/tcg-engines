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
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { withPostMoveCleanup } from "../../cleanup/post-move-cleanup";

/**
 * rule 164.2.a/b + 312.1.a/b — a rune's "[Exhaust]: Add" / "Recycle this: Add"
 * are [Reaction] Add abilities, so only a player who currently holds Priority
 * may use them. While a chain is open Priority sits with `chain.activePlayer`
 * (rule 429.3's pay-costs window only ever opens for the player taking the
 * action, who holds Priority by definition). Outside a chain the rune abilities
 * stay freely usable so a player can bank resources for a Reaction.
 */
function holdsRunePriority(state: RiftboundGameState, playerId: string): boolean {
  const chain = state.interaction?.chain;
  if (!chain?.active) {
    return true;
  }
  // rule 444.2.c — while a prompt raised by a RESOLVING item waits on this
  // player, the game is stopped on them; the Chain's `activePlayer` bookkeeping
  // (still the last player to pass) does not deny them a Reaction [Add]. Which
  // prompts open that window at all is decided by `runeAddAllowedDuringChoice`.
  const pending = state.pendingChoice as { playerId?: string; prompter?: string } | undefined;
  if (pending && (pending.playerId === playerId || pending.prompter === playerId)) {
    return true;
  }
  return chain.activePlayer === playerId;
}

/**
 * rule 128.6 / 419.2.a — is this `opt-in` the "you may play it?" confirm of an
 * instructed play that still costs something? Both confirm shapes are covered:
 * the pre-chain one (`playConfirmSpec`, raised by `beginPlay`) and the pending
 * item's own (`playConfirm` + `playItemId`, raised by `continueEffectPlay`).
 * A play under a fully waived cost mode charges nothing, so it is no Pay step.
 */
function playConfirmCharges(state: RiftboundGameState, p: Record<string, unknown>): boolean {
  let spec = p.playConfirmSpec as { costMode?: { kind?: string } } | undefined;
  if (spec === undefined && p.playConfirm === true && typeof p.playItemId === "string") {
    const items = (state.interaction?.chain?.items ?? []) as readonly {
      id?: string;
      play?: { costMode?: { kind?: string } };
    }[];
    spec = items.find((it) => it.id === p.playItemId)?.play;
  }
  if (spec === undefined) {
    return false;
  }
  const kind = spec.costMode?.kind;
  return kind !== "ignore-all" && kind !== "ignore-any-and-all";
}

/**
 * rule 444.2.c / 429.3 / 204.4.b.1 — a Pay demanded by a resolving ability
 * ("you may pay [1] to …") is still a Pay step, so the player being asked may
 * activate a rune's [Reaction] Add ability to fund it. Every other pending
 * choice keeps the board frozen, so only the payer's own `opt-in` prompt lifts
 * the block.
 */
function runeAddAllowedDuringChoice(state: RiftboundGameState, playerId: string): boolean {
  const pending = state.pendingChoice;
  if (!pending) {
    return true;
  }
  // rule 204.3.b / 444.2.c (rule-id: ogn-268-298 Bullet Time) — "pay any amount
  // of [rainbow]" is paid ON RESOLUTION, and that prompt IS the Pay step: the
  // payer may crack Reaction [Add] abilities (exhaust a rune for Energy,
  // recycle one for Power) to raise the amount before naming it.
  if (pending.type === "pay-x") {
    return pending.playerId === playerId;
  }
  // rule 419.2.a / 444.2.c (rule-id: sfd-188-221 Void Rush) — picking a card the
  // instruction then PLAYS commits the prompter to paying that card's remaining
  // cost, so the pick prompt carries a Pay step of its own: the prompter may
  // crack Reaction [Add] abilities before naming a card (an unaffordable card
  // stays unpickable until the pool actually covers it).
  if (pending.type === "reveal-and-pick") {
    const rp = pending as unknown as { onPicked?: string; prompter?: string };
    return rp.onPicked === "play" && rp.prompter === playerId;
  }
  if (pending.type !== "opt-in" || pending.playerId !== playerId) {
    return false;
  }
  // A costless "you may …" (rule 383.3.a) is not a Pay step: nothing can be
  // funded, so the board stays frozen like every other pending choice.
  const p = pending as unknown as Record<string, unknown>;
  if (
    p.counterRansom !== undefined ||
    p.payChoice !== undefined ||
    // rule 355.1.a / 357 — electing (and then paying) a pending play's
    // optional additional cost is part of that play's Pay step.
    (p.playItemId !== undefined && p.playConfirm !== true) ||
    // rule 128.6 / 419.2.a / 444.2.c (rule-id: ogn-194-298 Nocturne "you may
    // play me for [rainbow]") — saying yes to a declinable instructed play
    // commits the performer to paying that play's cost, so the confirm carries
    // the play's Pay step exactly like the Void Rush pick above: Reaction [Add]
    // abilities stay activatable while it is open, unless the play is free.
    playConfirmCharges(state, p)
  ) {
    return true;
  }
  // rule 809.1.c.1 / 429.3.a (ruling cb0c9c7b9d025ad8) — the [Deflect] surcharge
  // a trigger's own choice owes is Power paid at this prompt, so it opens the
  // same rune window: the payer may recycle a rune to fund it.
  if (((p.deflectSurcharge as number) ?? 0) > 0) {
    return true;
  }
  const optInCost = (p.resolved as { optInCost?: Record<string, unknown> } | undefined)?.optInCost;
  if (!optInCost || typeof optInCost !== "object") {
    return false;
  }
  // rule-id: ven-067-166 — a cost a rune can never fund ("kill 3 other friendly
  // units and/or gear") is no more a Pay step than a costless "you may": only an
  // Energy/Power portion opens the rune window.
  return (
    ((optInCost.energy as number) ?? 0) > 0 ||
    (Array.isArray(optInCost.power) && optInCost.power.length > 0)
  );
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
