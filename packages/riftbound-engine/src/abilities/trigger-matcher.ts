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
 * Map from parser-emitted type-specific `play-*` trigger events to the
 * `cardType` filter they imply when matched against a generic `play-card`
 * event. The parser emits triggers like `play-unit` / `play-gear` /
 * `play-legend` / `play-token-unit` but the engine only fires a single
 * `play-card` event carrying `cardType`. This map lets a `play-card` event
 * match a `play-X` trigger whose X matches `event.cardType` — purely
 * generic, no per-card if-statements.
 *
 * `play-token-unit` is treated as `unit` here; if/when token-ness becomes
 * part of the dispatched event we can refine.
 */
const PLAY_TYPE_TRIGGER_TO_CARD_TYPE: Record<string, string> = {
  "play-gear": "gear",
  "play-legend": "legend",
  "play-spell": "spell",
  "play-token-unit": "unit",
  "play-unit": "unit",
};

/**
 * Resolve the subject `cardId` of an event, if any, in a uniform way so
 * the generic listener can apply `excludeSelf` / `friendly-units` checks
 * to type-specific play triggers as well as the legacy plain `play-card`.
 */
function eventSubjectCardId(event: GameEvent): string | undefined {
  return "cardId" in event && typeof event.cardId === "string" ? event.cardId : undefined;
}

/**
 * Resolve the controller/owner the event is `on` (the player who took the
 * action), used by `on:"controller" | "opponent" | "friendly" | "enemy"`.
 */
function eventActingPlayerId(event: GameEvent): string | undefined {
  return "playerId" in event && typeof event.playerId === "string"
    ? event.playerId
    : undefined;
}

/**
 * Check if a trigger matches a game event.
 */
function triggerMatchesEvent(
  trigger: TriggerableAbility["trigger"],
  event: GameEvent,
  card: CardWithAbilities,
): boolean {
  // Event type must match, with one generic exception:
  // A `play-X` trigger (X ∈ unit/gear/legend/token-unit/spell) is allowed
  // To match a `play-card` event when `event.cardType === X`. This wires up
  // The parser's type-specific play triggers without any per-card code.
  if (trigger.event !== event.type) {
    const wantedType = PLAY_TYPE_TRIGGER_TO_CARD_TYPE[trigger.event];
    if (
      !wantedType ||
      event.type !== "play-card" ||
      (event as { cardType?: string }).cardType !== wantedType
    ) {
      return false;
    }
    // Falls through to the `on` subject check below — `play-card` carries
    // `cardId` + `playerId`, both of which are available for filtering.
  }

  // Check "on" subject
  const on = trigger.on ?? "self";

  // Object form of `on`: emitted by the parser (and hand-authored cards)
  // For type-specific play triggers, e.g. the parser-canonical form
  //   { controller: "friendly", type: "unit", excludeSelf?: true, tag?: "Dragon" }
  // And the alternate `cardType` field — accept either to keep the
  // Matcher robust to parser-shape drift. Apply filters generically so no
  // Per-card code is needed.
  if (on && typeof on === "object") {
    const o = on as {
      controller?: "friendly" | "enemy" | "any";
      cardType?: string;
      type?: string;
      excludeSelf?: boolean;
      tag?: string;
    };
    const wantedCardType = o.cardType ?? o.type;
    const subjectId = eventSubjectCardId(event);
    const actingPlayer = eventActingPlayerId(event);
    if (o.controller === "friendly" && actingPlayer !== undefined && actingPlayer !== card.owner) {
      return false;
    }
    if (o.controller === "enemy" && actingPlayer !== undefined && actingPlayer === card.owner) {
      return false;
    }
    if (o.excludeSelf && subjectId !== undefined && subjectId === card.id) {
      return false;
    }
    if (wantedCardType && event.type === "play-card") {
      const eventCardType = (event as { cardType?: string }).cardType;
      if (eventCardType !== undefined && eventCardType !== wantedCardType) {
        return false;
      }
    }
    // `tag` is unmodelled today (no Dragon/Yordle tag registry); be
    // Permissive so triggers don't go silent — controller / type / excludeSelf
    // Narrow enough for the demos to be correct.
    return true;
  }

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
  } else if (
    on === "friendly-units" ||
    on === "friendly-other-units" ||
    on === "another-friendly-units"
  ) {
    // Trigger fires when any friendly unit is the subject.
    // Become-mighty events carry the subject card's owner directly; we
    // Use that to check friendliness. For play-* events the acting
    // PlayerId is the controller. For other events with a cardId
    // But no owner, we fall back to match-all.
    if (event.type === "become-mighty") {
      if (event.owner !== card.owner) {
        return false;
      }
      if (on !== "friendly-units" && event.cardId === card.id) {
        return false;
      }
    } else if (event.type === "die") {
      if (event.owner !== card.owner) {
        return false;
      }
      if (on !== "friendly-units" && event.cardId === card.id) {
        return false;
      }
    } else if (event.type === "play-card" || event.type === "play-self") {
      const actingPlayer = eventActingPlayerId(event);
      if (actingPlayer !== undefined && actingPlayer !== card.owner) {
        return false;
      }
      const subjectId = eventSubjectCardId(event);
      if (on !== "friendly-units" && subjectId !== undefined && subjectId === card.id) {
        return false;
      }
    }
  } else if (on === "any-unit") {
    // Match any unit subject — no additional filter required.
  } else if (on === "enemy-units" || on === "opponent") {
    // Trigger fires when an enemy unit is the subject (or an opponent
    // Takes the action).
    if (event.type === "become-mighty" || event.type === "die") {
      if (event.owner === card.owner) {
        return false;
      }
    } else {
      const actingPlayer = eventActingPlayerId(event);
      if (actingPlayer !== undefined && actingPlayer === card.owner) {
        return false;
      }
    }
  } else if (on === "controller") {
    // Trigger fires when the card's controller takes the action
    // (e.g. "When you play a spell, ..."). The card's `owner` is its
    // Controller for play-* events.
    const actingPlayer = eventActingPlayerId(event);
    if (actingPlayer !== undefined && actingPlayer !== card.owner) {
      return false;
    }
  } else if (on === "any-player") {
    // Match any player taking the action — no additional filter required.
  }
  // For other "on" values or events — simplified: match all

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
    // Only cards on the board (or in legendZone) can have triggers fire.
    // EXCEPTION (rule 813 Deathknell / "when I die" self-triggers): a unit
    // That has just died and moved to the trash still gets its own "when I
    // Die" triggers. Such cards are scanned from the trash zone and tagged
    // `zone === "trash"`; they may only contribute self-scoped triggers for a
    // `die` event so they do not spuriously fire board-presence ("any unit")
    // Triggers from the graveyard.
    const onBoard =
      card.zone === "base" ||
      card.zone.startsWith("battlefield") ||
      card.zone === "legendZone";
    const isJustDied = card.zone === "trash" && event.type === "die";
    if (!onBoard && !isJustDied) {
      continue;
    }

    for (const ability of card.abilities) {
      if (ability.type !== "triggered") {
        continue;
      }

      if (isJustDied && (ability.trigger.on ?? "self") !== "self") {
        // A trashed (just-died) card only fires its own self-die triggers.
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
