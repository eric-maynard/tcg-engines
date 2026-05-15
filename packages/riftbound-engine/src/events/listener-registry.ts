/**
 * Listener Registry
 *
 * "Every time anything happens, the engine pokes every card in the game to
 * see if it has anything to do in response." This module is the *poking
 * surface*: given the current game state it enumerates every live card
 * object and, for each, the set of `{ eventType → triggered ability }` that
 * card subscribes to (derived from its parsed abilities — Deathknell and
 * Legion keywords are synthesised into real triggered abilities, exactly as
 * the trigger runner does).
 *
 * It is intentionally **derived-from-state**: there is no separate mutable
 * registry to keep in sync — a card is a listener for as long as it sits in
 * a zone whose triggers are live (board / legendZone, plus a just-died card
 * in trash for its own `die` self-trigger). If profiling ever shows this is
 * a hot path we can memoise per-tick, but correctness-by-construction wins
 * by default.
 *
 * `findMatchingTriggers(event, registry.cards)` (in `trigger-matcher.ts`)
 * is the "which of these listeners actually trigger off *this* event"
 * filter; `dispatchEvent` (in `dispatcher.ts`) is the chokepoint that runs
 * the whole poll → match → order → queue-onto-chain pipeline.
 */

import {
  type TriggerRunnerContext,
  getBoardCards,
  toTriggerableAbilities,
} from "../abilities/trigger-runner";
import type { CardWithAbilities, TriggerableAbility } from "../abilities/trigger-matcher";
import type { GameEventType } from "./game-event";

export type { CardWithAbilities, TriggerableAbility } from "../abilities/trigger-matcher";

/**
 * A single registered listener: the card object, plus its triggerable
 * abilities indexed by the `GameEvent.type` they react to (a card may
 * subscribe to several event types, and several abilities may share one
 * event type).
 */
export interface CardListener {
  readonly cardId: string;
  readonly owner: string;
  readonly zone: string;
  /** All triggerable abilities this card currently exposes. */
  readonly abilities: readonly TriggerableAbility[];
  /** `eventType → abilities listening for it` (subset of `abilities`). */
  readonly byEvent: ReadonlyMap<string, readonly TriggerableAbility[]>;
}

/** The whole live listener set for the current game state. */
export interface ListenerRegistry {
  /** Every live card listener (board + legendZone + just-died trash). */
  readonly listeners: readonly CardListener[];
  /**
   * The flat `CardWithAbilities[]` view `findMatchingTriggers` consumes —
   * identical to what the trigger runner builds today.
   */
  readonly cards: CardWithAbilities[];
  /** Card IDs that have at least one ability listening for `eventType`. */
  cardsListeningFor(eventType: GameEventType | string): readonly string[];
}

function indexByEvent(
  abilities: readonly TriggerableAbility[],
): Map<string, readonly TriggerableAbility[]> {
  const byEvent = new Map<string, TriggerableAbility[]>();
  for (const ability of abilities) {
    if (ability.type !== "triggered" || !ability.trigger?.event) {
      continue;
    }
    const list = byEvent.get(ability.trigger.event);
    if (list) {
      list.push(ability);
    } else {
      byEvent.set(ability.trigger.event, [ability]);
    }
  }
  return byEvent;
}

/**
 * Build the listener registry for the current game state.
 *
 * @param ctx - any context carrying the `draft` + `zones` + `cards`
 *   accessor bag (a move-reducer context or a `TriggerRunnerContext`).
 */
export function buildListenerRegistry(ctx: TriggerRunnerContext): ListenerRegistry {
  const cards = getBoardCards(ctx);
  const listeners: CardListener[] = cards.map((card) => {
    // `getBoardCards` already called `toTriggerableAbilities`; reuse the
    // Result it stashed on the card to avoid a second registry lookup.
    const abilities = card.abilities ?? toTriggerableAbilities(card.id);
    return {
      abilities,
      byEvent: indexByEvent(abilities),
      cardId: card.id,
      owner: card.owner,
      zone: card.zone,
    };
  });

  return {
    cards,
    cardsListeningFor(eventType) {
      const out: string[] = [];
      for (const l of listeners) {
        if (l.byEvent.has(eventType)) {
          out.push(l.cardId);
        }
      }
      return out;
    },
    listeners,
  };
}
