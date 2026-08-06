/**
 * Trigger Matcher
 *
 * Matches game events against card abilities to determine which
 * triggered abilities should fire.
 */

import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { GameEvent } from "./game-events";

/**
 * A trigger restriction (subset of @tcg/riftbound-types TriggerRestriction).
 */
export interface TriggerRestriction {
  readonly type: string;
  readonly count?: number;
  readonly whose?: "your" | "opponent";
}

/**
 * Minimal game-state view needed to evaluate trigger restrictions.
 * Avoids importing the full RiftboundGameState here.
 */
export interface TriggerMatcherState {
  readonly cardsPlayedThisTurn?: Record<string, number>;
  readonly turn?: { readonly activePlayer?: string };
  readonly turnEventCounts?: Record<string, number>;
}

/**
 * rule-id: ogn-118-298 — tally keys for one fired event: the bare event type,
 * the type scoped to the subject/acting player, and the type scoped to the
 * subject card. `fireTriggers` bumps every key BEFORE matching, so "the first
 * time X each turn" is satisfied when the relevant key's count is exactly 1
 * (two simultaneous deaths are two events → only the first is "the first").
 */
export function turnEventCountKeys(event: GameEvent): string[] {
  const keys = [event.type];
  const pid = "owner" in event ? event.owner : "playerId" in event ? event.playerId : undefined;
  if (typeof pid === "string") {
    keys.push(`${event.type}|p:${pid}`);
  }
  if ("cardId" in event && typeof event.cardId === "string") {
    keys.push(`${event.type}|c:${event.cardId}`);
  }
  return keys;
}

/**
 * The `turnEventCounts` key a count-limited restriction ("the first/Nth time …
 * each turn") reads: the scope the trigger names — any player ("a player …") →
 * bare type; "I …" with a subject card → per card; otherwise ("you …", "a
 * friendly unit …") → per subject/acting player.
 */
function turnEventCountKeyFor(
  trigger: { readonly event: string; readonly on?: string },
  event: GameEvent,
  card: CardWithAbilities,
): string {
  const on = trigger.on ?? "self";
  if (on === "any" || on === "any-player" || on === "any-unit") {
    return event.type;
  }
  if (on === "self" && "cardId" in event && typeof event.cardId === "string") {
    return `${event.type}|c:${event.cardId}`;
  }
  const pid = "owner" in event ? event.owner : "playerId" in event ? event.playerId : card.owner;
  return `${event.type}|p:${pid}`;
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
  empower: "empower",
  "end-of-turn": "end-of-turn",
  "gain-xp": "gain-xp",
  "grant-keyword": "grant-keyword",
  heal: "heal",
  hide: "hide",
  hold: "hold",
  "main-phase": "main-phase",
  move: "move",
  "play-card": "play-card",
  // rule-id: ogn-167-298 — rule 811.1.c.3.
  "play-from-hidden": "play-from-hidden",
  "play-self": "play-self",
  "play-spell": "play-spell",
  ready: "ready",
  // rule-id: ogn-235-298 — recycle-to-main-deck trigger event.
  recycle: "recycle",
  "showdown-begin": "showdown-begin",
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
      // rule-id: ogn-205-298 — "The third time I move in a turn": fireTriggers
      // tallies the event before matching, so the Nth occurrence is exactly a
      // count of N (later occurrences no longer satisfy the restriction).
      const counts = state?.turnEventCounts;
      if (!counts) {
        return false;
      }
      return (counts[turnEventCountKeyFor(trigger, event, card)] ?? 0) === n;
    }
    case "first-time-each-turn": {
      // rule-id: ogn-118-298 — count this turn's occurrences of the event in
      // the scope the trigger names: any player ("a player …") → bare type;
      // "I …" with a subject card → per card; otherwise ("you …", "a friendly
      // unit …") → per subject/acting player. The current event is already
      // tallied, so "first" means a count of exactly 1. No tally → deny.
      const counts = state?.turnEventCounts;
      if (!counts) {
        return false;
      }
      return (counts[turnEventCountKeyFor(trigger, event, card)] ?? 0) === 1;
    }
    case "once-each-turn":
      // TODO(once-each-turn): per-card fire tracking not yet implemented.
      return false;
    case "during-showdown":
      // TODO(during-showdown): showdown state not exposed here.
      return false;
    case "on-opponent-turn": {
      // ven-176-166 (Viktor, Innovator): satisfied when the turn's active
      // player is not this card's controller. Active player is threaded via
      // TriggerMatcherState.turn (callers pass the full game state draft).
      const active = state?.turn?.activePlayer;
      return active !== undefined && active !== card.owner;
    }
    case "during-turn": {
      // ogn-117-298 (Viktor, Innovator): typed `during-turn` restriction —
      // compare the active player against this card's controller.
      const active = state?.turn?.activePlayer;
      if (active === undefined) {
        return false;
      }
      return restriction.whose === "opponent" ? active !== card.owner : active === card.owner;
    }
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
  // Event type must match. Compound trigger events ("choose-or-ready",
  // "play-self-or-play-gear") match if the fired event is any of the parts.
  const mapped = EVENT_MAP[event.type] ?? event.type;
  // Rule 515.2.a: "At the start of your Beginning Phase" (parser event
  // `beginning-phase`) is the same moment as `start-of-turn`.
  // rule-id: ogn-235-298 — parser event `recycle-cards-to-deck` ("When you
  // recycle one or more cards to your Main Deck") is the engine `recycle` event.
  // rule-id: ogn-222-298 — parser event `move-to-battlefield` ("When I move to
  // a battlefield") is the engine `move` event narrowed to battlefield
  // destinations; a move back to base never fires it.
  const triggerEvents = trigger.event
    .split("-or-")
    .map((e) =>
      e === "beginning-phase"
        ? "start-of-turn"
        : e === "recycle-cards-to-deck"
          ? "recycle"
          : e === "move-to-battlefield"
            ? "move"
            : e,
    );
  if (
    event.type === "move" &&
    trigger.event.split("-or-").includes("move-to-battlefield") &&
    !String(event.to).startsWith("battlefield-")
  ) {
    return false;
  }
  // rule-id: ogn-091-298 — a typed play trigger ("When you play a gear /
  // unit") is the `play-card` event narrowed by the played card's type. Spells
  // already get a dedicated `play-spell` event on resolution — don't double-fire.
  const typedPlay =
    event.type === "play-card" && event.cardType !== "spell" ? `play-${event.cardType}` : undefined;
  if (!triggerEvents.includes(mapped) && !(typedPlay && triggerEvents.includes(typedPlay))) {
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
    } else if ((mapped === "hold" || mapped === "conquer") && "battlefieldId" in event && !("cardId" in event)) {
      // Rule 383.4.d.2.a: a unit's self-hold trigger requires the unit to be
      // present at the held battlefield — a unit at base never "holds".
      // rule 383.4.c.2: likewise "When I conquer" needs THIS unit present at
      // the conquered battlefield, not merely a conquer by its controller.
      if (card.zone !== `battlefield-${event.battlefieldId}`) {
        return false;
      }
      if ("playerId" in event && event.playerId !== card.owner) {
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
    } else if (event.type === "play-card") {
      // "When YOU play a unit": the playing player must be this card's controller.
      if (event.playerId !== card.owner) {
        return false;
      }
      if (on === "friendly-other-units" && event.cardId === card.id) {
        return false;
      }
    }
  } else if (on === "another-friendly-units" && event.type === "play-card") {
    // "When you play another unit": friendly play, excluding this card itself.
    if (event.playerId !== card.owner || event.cardId === card.id) {
      return false;
    }
  } else if (on === "any-unit" || on === "any" || on === "any-player") {
    // Match any subject — except a battlefield's "When a player plays a unit
    // HERE": play-card carries no location, so deny rather than fire for
    // plays anywhere (rule 383.4.d).
    if (event.type === "play-card" && card.zone === "battlefieldRow") {
      return false;
    }
  } else if (on === "enemy-units") {
    if ("owner" in event && event.owner === card.owner) {
      return false;
    }
  } else if (on === "controller" || on === "controller-or-allies") {
    // Player-scoped event must be for this card's controller.
    if ("playerId" in event && event.playerId !== card.owner) {
      return false;
    }
    // rule-id: ogn-202-298 — "When you discard one or more cards" triggers
    // once per discard event, not once per card in a multi-card discard.
    if (event.type === "discard" && (event.batchIndex ?? 0) > 0) {
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
      location?: "here" | "battlefield" | "other-battlefield";
      excludeSelf?: boolean;
      tag?: string;
      filter?: string | readonly string[];
      actor?: "controller" | "opponent" | "any";
    };
    // rule-id: sfd-142-221 — "When you choose ME with a SPELL": `filter`
    // tokens `self` (subject must be this card) and `spell` (choose events
    // must be spell-sourced; unknown source → deny).
    const filters = desc.filter === undefined ? [] : Array.isArray(desc.filter) ? desc.filter : [desc.filter];
    if (filters.includes("self") && "cardId" in event && event.cardId !== card.id) {
      return false;
    }
    if (filters.includes("spell") && event.type === "choose" && event.sourceType !== "spell") {
      return false;
    }
    // rule 428.5: kill-attribution filters on `die` — "a STUNNED enemy unit"
    // reads the unit's state as it died; "kill a unit WITH A SPELL" needs the
    // kill attributed to a spell this card's controller was responsible for.
    // rule 740.2.a (ogn-060-298) — "when a friendly unit attacks or defends
    // ALONE": the emit site stamps `alone` on the attack/defend event; an
    // event that doesn't carry it was not a solo designation.
    if (
      filters.includes("alone") &&
      ((event.type !== "attack" && event.type !== "defend") || event.alone !== true)
    ) {
      return false;
    }
    if (filters.includes("stunned") && event.type === "die" && event.wasStunned !== true) {
      return false;
    }
    if (
      filters.includes("killed-by-spell") &&
      (event.type !== "die" || event.killSource !== "spell" || event.killedBy !== card.owner)
    ) {
      return false;
    }
    const subjectOwner = "owner" in event ? event.owner : "playerId" in event ? event.playerId : undefined;
    if (desc.controller === "friendly" && subjectOwner !== undefined && subjectOwner !== card.owner) {
      return false;
    }
    if (desc.controller === "enemy" && subjectOwner !== undefined && subjectOwner === card.owner) {
      return false;
    }
    // rule-id: unl-133-219 — "When YOU move an enemy unit": the actor (the
    // player whose action/effect caused the event) must be this card's
    // controller. Unknown actor → deny rather than fire permissively.
    if (desc.actor && desc.actor !== "any") {
      const actorId =
        "movedBy" in event
          ? event.movedBy
          : "chooserId" in event
            ? event.chooserId
            : "killedBy" in event
              ? event.killedBy // rule 428.5: "When YOU kill …"
              : "playerId" in event
                ? event.playerId
                : undefined;
      if (actorId === undefined) {
        return false;
      }
      if (desc.actor === "controller" ? actorId !== card.owner : actorId === card.owner) {
        return false;
      }
    }
    if (desc.excludeSelf && "cardId" in event && event.cardId === card.id) {
      return false;
    }
    // rule 383.4.d — tag-scoped subjects ("another non-Recruit unit you
    // control dies"). `not:X` excludes tag X; a bare tag requires it. Tokens
    // carry their name as a tag (rule 187.1).
    if (desc.tag && "cardId" in event && typeof event.cardId === "string") {
      const negated = desc.tag.startsWith("not:");
      const wanted = negated ? desc.tag.slice(4) : desc.tag;
      const def = getGlobalCardRegistry().get(event.cardId);
      const tags = def?.tags ?? [];
      const has = tags.some((t) => t === wanted) || def?.name === wanted;
      if (has === negated) {
        return false;
      }
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
    // rule 144.4 (ogn-158-298) — "moves to a battlefield other than mine":
    // the destination must be a battlefield (bases don't count) and, for
    // `other-battlefield`, must not be the battlefield this card occupies.
    if (desc.location === "other-battlefield" || desc.location === "battlefield") {
      const to = "to" in event ? String(event.to) : undefined;
      if (to === undefined || !to.startsWith("battlefield-")) {
        return false;
      }
      if (desc.location === "other-battlefield" && to === card.zone) {
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
/**
 * rule-id: ogn-037-298 (Immortal Phoenix) — rule 385.2 / 383.2.c.1: a
 * triggered ability that is active in a non-board zone ("…play me from your
 * trash") self-describes that zone. A triggered ability whose effect plays its
 * own source card from the trash is live while that card sits in the trash.
 */
export function abilityFunctionsFromTrash(ability: TriggerableAbility): boolean {
  const eff = ability.effect as { type?: string; from?: unknown; target?: unknown } | undefined;
  return (
    eff?.type === "play" &&
    eff.from === "trash" &&
    (eff.target === undefined || eff.target === "self")
  );
}

export function findMatchingTriggers(
  event: GameEvent,
  boardCards: CardWithAbilities[],
  state?: TriggerMatcherState,
): MatchedTrigger[] {
  const matches: MatchedTrigger[] = [];

  for (const card of boardCards) {
    // Only cards on the board (or in legendZone) can have triggers fire.
    // Rule ogn-006-298: for a discard event, the discarded card itself is
    // allowed to match from trash so "When you discard me" self-triggers fire.
    const isDiscardSubject = event.type === "discard" && event.cardId === card.id;
    // rule-id: sfd-167-221 — Deathknell: the dying unit is already in trash
    // when `die` fires; let it match its own death.
    const isDieSubject = event.type === "die" && event.cardId === card.id;
    // rule-id: ogn-037-298 — a trash card matches only via trash-functioning abilities.
    const trashOnly = card.zone === "trash" && !isDiscardSubject && !isDieSubject;
    if (
      !isDiscardSubject &&
      !isDieSubject &&
      !trashOnly &&
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
      if (trashOnly && !abilityFunctionsFromTrash(ability)) {
        continue;
      }
      // rule 385.2 (ogn-037-298): a trash-only ability is inert while its card is on the board.
      if (card.zone !== "trash" && abilityFunctionsFromTrash(ability)) {
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
