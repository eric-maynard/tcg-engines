/**
 * Trigger Matcher
 *
 * Matches game events against card abilities to determine which
 * triggered abilities should fire.
 */

import type { GameEvent } from "./game-events";

/**
 * A trigger restriction (subset of @tcg/riftbound-types TriggerRestriction).
 */
export interface TriggerRestriction {
  readonly type: string;
  readonly count?: number;
}

/**
 * Minimal game-state view needed to evaluate trigger restrictions.
 * Avoids importing the full RiftboundGameState here.
 */
export interface TriggerMatcherState {
  readonly cardsPlayedThisTurn?: Record<string, number>;
}

/**
 * A simplified ability representation for trigger matching.
 * Avoids importing full riftbound-types to keep the boundary clean.
 */
export interface TriggerableAbility {
  readonly type: "triggered";
  readonly trigger: {
    readonly event: string;
    readonly on?: string;
    readonly restrictions?: readonly TriggerRestriction[];
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
 * Evaluate a single trigger restriction against the event and state.
 * Returns `true` when the restriction is satisfied (i.e. the trigger may fire).
 */
function restrictionSatisfied(
  restriction: TriggerRestriction,
  trigger: TriggerableAbility["trigger"],
  event: GameEvent,
  card: CardWithAbilities,
  state: TriggerMatcherState | undefined,
): boolean {
  switch (restriction.type) {
    case "nth-time-each-turn": {
      const n = restriction.count ?? 1;
      if (trigger.event === "play-card") {
        // Reducers fire play-card BEFORE incrementing cardsPlayedThisTurn, so
        // the current play is the (prior + 1)th card this turn.
        const playerId = "playerId" in event ? event.playerId : card.owner;
        const prior = state?.cardsPlayedThisTurn?.[playerId] ?? 0;
        return prior + 1 === n;
      }
      // TODO(nth-time-each-turn): event-specific counters for "draw" and
      // "move" are not tracked yet — block the trigger rather than fire on
      // every occurrence.
      return false;
    }
    case "first-time-each-turn":
      // TODO(first-time-each-turn): per-event first-time tracking not yet
      // implemented — block rather than fire every time.
      return false;
    case "once-each-turn":
      // TODO(once-each-turn): per-card fire tracking not yet implemented.
      return false;
    case "during-showdown":
      // TODO(during-showdown): showdown state not exposed here.
      return false;
    case "on-opponent-turn":
      // TODO(on-opponent-turn): active-player check not exposed here.
      return false;
    case "self-at-battlefield":
      return card.zone.startsWith("battlefield");
    case "non-token":
      // TODO(non-token): subject-card token status not available here.
      return false;
    default:
      // TODO(trigger-restriction): unknown restriction type — block rather
      // than permissively fire (previous permissive behavior caused Bug A).
      return false;
  }
}

/**
 * Check if a trigger matches a game event.
 */
function triggerMatchesEvent(
  trigger: TriggerableAbility["trigger"],
  event: GameEvent,
  card: CardWithAbilities,
  state?: TriggerMatcherState,
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
    if ("battlefieldId" in event && !("cardId" in event) && card.zone === "battlefieldRow") {
      // Battlefield card self-triggers (hold, conquer): match by battlefieldId.
      // The controller who holds/conquers may differ from the card's deck owner.
      if (event.battlefieldId !== card.id) {
        return false;
      }
    } else if ("playerId" in event && !("cardId" in event) && event.playerId !== card.owner) {
      // Non-battlefield cards: match player-scoped events by owner
      return false;
    }
  } else if (on === "friendly-units" || on === "friendly-other-units") {
    // Trigger fires when any friendly unit is the subject.
    // Become-mighty events carry the subject card's owner directly; we
    // Use that to check friendliness. For other events with a cardId
    // But no owner, we fall back to match-all.
    if (event.type === "become-mighty") {
      if (event.owner !== card.owner) {
        return false;
      }
      if (on === "friendly-other-units" && event.cardId === card.id) {
        return false;
      }
    } else if (event.type === "die") {
      if (event.owner !== card.owner) {
        return false;
      }
      if (on === "friendly-other-units" && event.cardId === card.id) {
        return false;
      }
    }
  } else if (on === "any-unit" || on === "any" || on === "any-player") {
    // Match any subject — no additional filter required.
  } else if (on === "enemy-units") {
    if ("owner" in event && event.owner === card.owner) {
      return false;
    }
  } else if (on === "controller" || on === "controller-or-allies") {
    // Player-scoped event must be for this card's controller.
    if ("playerId" in event && event.playerId !== card.owner) {
      return false;
    }
  } else if (on === "opponent") {
    if ("playerId" in event && event.playerId === card.owner) {
      return false;
    }
  } else if (typeof on === "object" && on !== null) {
    // Object-shape descriptor: {controller?, cardType?/type?, location?, excludeSelf?, tag?, filter?}.
    // Rule 383.4.d: match only when the event subject satisfies every field.
    const desc = on as {
      controller?: "friendly" | "enemy" | "any";
      cardType?: string;
      type?: string;
      location?: "here" | "battlefield";
      excludeSelf?: boolean;
      tag?: string;
      filter?: string;
    };
    const subjectOwner = "owner" in event ? event.owner : "playerId" in event ? event.playerId : undefined;
    if (desc.controller === "friendly" && subjectOwner !== undefined && subjectOwner !== card.owner) {
      return false;
    }
    if (desc.controller === "enemy" && subjectOwner !== undefined && subjectOwner === card.owner) {
      return false;
    }
    if (desc.excludeSelf && "cardId" in event && event.cardId === card.id) {
      return false;
    }
    if (desc.location === "here") {
      const evLoc =
        "battlefieldId" in event
          ? event.battlefieldId
          : "to" in event
            ? String(event.to).replace(/^battlefield-/, "")
            : undefined;
      const cardLoc = card.zone?.replace(/^battlefield-/, "");
      if (evLoc !== cardLoc && evLoc !== card.id) {
        return false;
      }
    }
    // cardType/type/tag/filter require registry lookups on the subject card;
    // absent that context here, be conservative when the subject owner is
    // unknown (previously this fell through to match-all — rule 383.4.d bug).
    if (subjectOwner === undefined && desc.controller && desc.controller !== "any") {
      return false;
    }
  } else {
    // Unknown `on` shape — do NOT match-all (previous behavior caused triggers
    // to fire for every event regardless of subject, rule 383.4.d).
    return false;
  }

  // Check restrictions (nth-time-each-turn, first-time-each-turn, ...).
  if (trigger.restrictions && trigger.restrictions.length > 0) {
    for (const r of trigger.restrictions) {
      if (!restrictionSatisfied(r, trigger, event, card, state)) {
        return false;
      }
    }
  }

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
  state?: TriggerMatcherState,
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

      if (triggerMatchesEvent(ability.trigger, event, card, state)) {
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
