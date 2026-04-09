/**
 * Trigger Matcher
 *
 * Matches game events against card abilities to determine which
 * triggered abilities should fire.
 */

import type { GameEvent } from "./game-events";

/**
 * A simplified ability representation for trigger matching.
 * Avoids importing full riftbound-types to keep the boundary clean.
 */
export interface TriggerableAbility {
  readonly type: "triggered";
  readonly trigger: {
    readonly event: string;
    readonly on?: string;
  };
  readonly effect: unknown;
  readonly optional?: boolean;
  readonly condition?: unknown;
}

/**
 * A card with its abilities, for scanning.
 */
export interface CardWithAbilities {
  readonly id: string;
  readonly owner: string;
  readonly zone: string;
  readonly abilities: TriggerableAbility[];
}

/**
 * A matched trigger ready to execute.
 */
export interface MatchedTrigger {
  readonly cardId: string;
  readonly cardOwner: string;
  readonly ability: TriggerableAbility;
  readonly event: GameEvent;
}

/**
 * Map game event types to trigger event names.
 */
const EVENT_MAP: Record<string, string> = {
  attack: "attack",
  "become-mighty": "become-mighty",
  buff: "buff",
  "channel-rune": "channel-rune",
  choose: "choose",
  conquer: "conquer",
  defend: "defend",
  die: "die",
  discard: "discard",
  draw: "draw",
  "end-of-turn": "end-of-turn",
  "gain-xp": "gain-xp",
  "grant-keyword": "grant-keyword",
  heal: "heal",
  hide: "hide",
  hold: "hold",
  move: "move",
  "play-card": "play-card",
  "play-self": "play-self",
  "play-spell": "play-spell",
  "start-of-turn": "start-of-turn",
  stun: "stun",
  "take-damage": "take-damage",
  "win-combat": "win-combat",
};

/**
 * Check if a trigger matches a game event.
 */
function triggerMatchesEvent(
  trigger: TriggerableAbility["trigger"],
  event: GameEvent,
  card: CardWithAbilities,
): boolean {
  // Event type must match
  if (trigger.event !== event.type) {
    return false;
  }

  // Check "on" subject
  const on = trigger.on ?? "self";

  if (on === "self") {
    // Self-trigger: the card that has this ability must be the subject
    if ("cardId" in event && event.cardId !== card.id) {
      return false;
    }
    if ("playerId" in event && !("cardId" in event) && event.playerId !== card.owner) {
      return false;
    }
  } else if (on === "friendly-units") {
    // Trigger fires when any friendly unit is the subject
    if ("cardId" in event) {
      // The event card's owner must match this card's owner
      // (We'd need to look up the event card's owner — simplified for now)
    }
  }
  // For other "on" values (enemy-units, any-unit, etc.) — simplified: match all

  return true;
}

/**
 * Find all triggered abilities that match a game event.
 *
 * Scans all cards on the board for matching triggers.
 *
 * @param event - The game event that occurred
 * @param boardCards - All cards currently on the board with their abilities
 * @returns Array of matched triggers to execute
 */
export function findMatchingTriggers(
  event: GameEvent,
  boardCards: CardWithAbilities[],
): MatchedTrigger[] {
  const matches: MatchedTrigger[] = [];

  for (const card of boardCards) {
    // Only cards on the board (or in legendZone) can have triggers fire
    if (
      card.zone !== "base" &&
      !card.zone.startsWith("battlefield") &&
      card.zone !== "legendZone"
    ) {
      continue;
    }

    for (const ability of card.abilities) {
      if (ability.type !== "triggered") {
        continue;
      }

      if (triggerMatchesEvent(ability.trigger, event, card)) {
        matches.push({
          ability,
          cardId: card.id,
          cardOwner: card.owner,
          event,
        });
      }
    }
  }

  return matches;
}
