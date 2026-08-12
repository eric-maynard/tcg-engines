/**
 * Trigger Matcher
 *
 * Matches game events against card abilities to determine which
 * triggered abilities should fire.
 */

import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { GameEvent } from "./game-events";
import { counteredPlaysBefore } from "../operations/plays-this-turn";

/**
 * rule 383.4.d — card types an `on` descriptor may scope its subject to. Only
 * these values of the descriptor's `type` field name a CARD TYPE (the field is
 * also used for other descriptor shapes), so the alias never misreads one.
 */
const SUBJECT_CARD_TYPES: ReadonlySet<string> = new Set([
  "battlefield",
  "gear",
  "legend",
  "rune",
  "spell",
  "unit",
]);

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
  /** rule 419.4.a — ordinal a pending spell had when it was played (ven-044-166). */
  readonly spellPlayOrdinals?: Record<string, number>;
  readonly turn?: { readonly activePlayer?: string; readonly phase?: string };
  readonly turnEventCounts?: Record<string, number>;
  /** Same keys as `turnEventCounts`, but never reset — game-long tallies. */
  readonly gameEventCounts?: Record<string, number>;
  readonly interaction?: {
    readonly showdownStack?: readonly { readonly active?: boolean }[];
  };
  /** rule 190.4 — battlefield control, for "a battlefield you control" subjects. */
  readonly battlefields?: Record<string, { readonly controller?: string | null } | undefined>;
  /** rule 489.8.e / 740.1.a — team map, so "friendly" can reach a teammate. */
  readonly teams?: Readonly<Record<string, number>>;
}

/**
 * rule 489.8.e / 740.1.a — two seats are on the same side when they are the
 * same player or teammates. Solo games carry no team map, so this is identity.
 */
function alliedSeats(
  state: TriggerMatcherState | undefined,
  a: string,
  b: string | undefined,
): boolean {
  if (b === undefined) {
    return false;
  }
  if (a === b) {
    return true;
  }
  const teams = state?.teams;
  const teamA = teams?.[a];
  return teamA !== undefined && teamA === teams?.[b];
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
  // rule-id: ven-068a-166 — "the first time you play a <type> each turn" counts
  // only plays of that card type, so a typed play gets its own tally alongside
  // the generic `play-card` one (see the typed-play branch of triggerMatchesEvent).
  if (event.type === "play-card" && typeof event.cardType === "string" && event.cardType !== "spell") {
    keys.push(`play-${event.cardType}`);
    if (typeof pid === "string") {
      keys.push(`play-${event.cardType}|p:${pid}`);
    }
  }
  // rule 359.2 (rule-id: ogn-292-298) — "a player chooses a friendly unit here"
  // is about the CHOOSER, so a choose tally is scoped to them too: one player
  // naming an opponent's object here does not spend the opponent's own "first
  // time each turn".
  const chooser = (event as { chooserId?: unknown }).chooserId;
  if (event.type === "choose" && typeof chooser === "string") {
    for (const key of [...keys]) {
      keys.push(`${key}|ch:${chooser}`);
    }
  }
  // rule 471.2.a (rule-id: ogn-292-298) — a "first time each turn … HERE"
  // trigger counts per LOCATION: each battlefield keeps its own tally, so one
  // spell choosing units at two Dreaming Trees is the first choice at each.
  const bf = (event as { battlefieldId?: unknown }).battlefieldId;
  if (typeof bf === "string") {
    for (const key of [...keys]) {
      keys.push(`${key}|bf:${bf}`);
    }
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
  trigger: { readonly event: string; readonly on?: unknown; readonly location?: string },
  event: GameEvent,
  card: CardWithAbilities,
): string {
  const on = trigger.on ?? "self";
  // rule 471.2.a (rule-id: ogn-292-298) — "…HERE" anchors the tally to this
  // battlefield: every location keeps its own "first time each turn" count, so
  // one spell choosing units at two battlefields is a first time at each.
  const scopedHere =
    trigger.location === "here" ||
    (typeof on === "object" && on !== null && (on as { location?: string }).location === "here");
  const eventBattlefield = (event as { battlefieldId?: unknown }).battlefieldId;
  const bf =
    scopedHere && typeof eventBattlefield === "string" ? `|bf:${eventBattlefield}` : "";
  // rule-id: ven-068a-166 — a typed play trigger counts that card type only.
  const eventType =
    event.type === "play-card" &&
    typeof event.cardType === "string" &&
    trigger.event.split("-or-").includes(`play-${event.cardType}`)
      ? `play-${event.cardType}`
      : event.type;
  // rule 359.2 — see `turnEventCountKeys`: a choose tally is per chooser.
  const chooser = (event as { chooserId?: unknown }).chooserId;
  const ch = event.type === "choose" && typeof chooser === "string" ? `|ch:${chooser}` : "";
  if (on === "any" || on === "any-player" || on === "any-unit") {
    return `${eventType}${ch}${bf}`;
  }
  if (on === "self" && "cardId" in event && typeof event.cardId === "string") {
    return `${eventType}|c:${event.cardId}${ch}${bf}`;
  }
  // rule 383.4.c.2 / 124.1 — `conquer` / `hold` / `score` name the acting
  // PLAYER, but "the first time I conquer each turn" is a per-OBJECT memory:
  // read this card's own tally (fireTriggers writes one per self that can see
  // the score), so an object that changed zones comes back with an empty
  // ledger and a second unit's conquer never spends the first one's memory.
  if (
    on === "self" &&
    (eventType === "conquer" || eventType === "hold" || eventType === "score")
  ) {
    return `${eventType}|c:${card.id}${ch}${bf}`;
  }
  const pid = "owner" in event ? event.owner : "playerId" in event ? event.playerId : card.owner;
  return `${eventType}|p:${pid}${ch}${bf}`;
}

/**
 * rule 383.3.e — the `turnEventCounts` key under which a "once each turn"
 * triggered ability records that it already triggered this turn. Scoped to the
 * card printing it and the event it listens for, so two different once-a-turn
 * abilities on the same card stay independent.
 */
export function triggerFireKey(
  trigger: { readonly event: string },
  card: { readonly id: string },
): string {
  return `trigger-fired|c:${card.id}|e:${trigger.event}`;
}

/**
 * True when this ability carries a "once each turn" restriction, i.e. firing it
 * must be tallied under `triggerFireKey`.
 */
export function isOncePerTurnTrigger(ability: {
  readonly trigger?: { readonly restrictions?: readonly TriggerRestriction[] };
}): boolean {
  return (
    ability.trigger?.restrictions?.some(
      (r) => r.type === "once-each-turn" || r.type === "once-per-turn",
    ) === true
  );
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
    /**
     * rule 471.2.b (ogn-280-298) — "…HERE": the event must have happened at
     * THIS card's own battlefield.
     */
    readonly location?: "here" | "from-here" | "battlefield" | "other-battlefield";
    readonly restrictions?: readonly TriggerRestriction[];
    /**
     * rule-id: sfd-075-221 — card type the acting source must have ("an
     * activated ability of a GEAR"); compared against the event's `sourceType`.
     */
    readonly sourceType?: string;
    /**
     * rule-id: unl-205-219 — "When a player plays a spell, THEY may …": the
     * ability is controlled by the player who caused the event, not by the
     * controller of the card printing it.
     */
    readonly controllerFromEvent?: boolean;
    /**
     * rule-id: sfd-120-221 (rule 469.1) — "When I conquer AFTER AN ATTACK":
     * a conquer that came from walking onto an open battlefield never matches.
     */
    readonly afterAttack?: boolean;
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
  // rule 427 (ven-191-166) — "When you banish a card you own".
  banish: "banish",
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
  // rule-id: ven-177-166 — "When my Might becomes N or more".
  "might-becomes": "might-becomes",
  move: "move",
  "play-card": "play-card",
  // rule-id: ogn-167-298 — rule 811.1.c.3.
  "play-from-hidden": "play-from-hidden",
  "play-self": "play-self",
  "play-spell": "play-spell",
  ready: "ready",
  // rule-id: ogn-235-298 — recycle-to-main-deck trigger event.
  recycle: "recycle",
  // rule 446.2 (unl-214-219) — "returned to a player's hand" (a bounce).
  "return-to-hand": "return-to-hand",
  // rule 468 — "When a player / an opponent scores" (Hold or Conquer).
  score: "score",
  "showdown-begin": "showdown-begin",
  "start-of-turn": "start-of-turn",
  stun: "stun",
  "take-damage": "take-damage",
  // rule-id: sfd-075-221 — rule 206.1: using an activated ability.
  "use-activated-ability": "use-activated-ability",
  // rule 419.4.a (rule-id: ven-192-166) — PLAYING an activated ability is a
  // distinct moment from using it: the act completes when the ability resolves.
  "play-activated-ability": "play-activated-ability",
  "win-combat": "win-combat",
  // rule 466.7.b — "When a combat that I was in ends".
  "combat-end": "combat-end",
  // rule 464.2.b (rule-id: ven-166-166) — "When combat starts here".
  "combat-start": "combat-start",
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
    // rule-id: ven-177-166 — "When my Might becomes 10 or more": fires only on
    // the upward CROSSING — below the bound before, at or above it after (so
    // 4 → 9 does nothing, 4 → 10 and 9 → 15 both fire, 10 → 11 does not re-fire).
    case "might-threshold": {
      if (event.type !== "might-becomes") {
        return false;
      }
      const bound = restriction.count ?? 0;
      return event.previousMight < bound && event.might >= bound;
    }
    case "nth-time-each-turn": {
      const n = restriction.count ?? 1;
      if (trigger.event === "play-card") {
        // rule 419.4.a — a spell's play-card fires on RESOLUTION, long after
        // its play was tallied, so use the ordinal recorded when it was played.
        const recorded =
          event.type === "play-card" ? state?.spellPlayOrdinals?.[event.cardId] : undefined;
        const owner = "playerId" in event ? event.playerId : card.owner;
        if (recorded !== undefined) {
          // rule 412 (ruling 5807cc9df8627167) — a countered play never
          // resolved, so it does not take up an ordinal for this trigger.
          return recorded - counteredPlaysBefore(state ?? {}, owner, recorded) === n;
        }
        // Reducers fire play-card BEFORE incrementing cardsPlayedThisTurn, so
        // the current play is the (prior + 1)th card this turn.
        const prior = state?.cardsPlayedThisTurn?.[owner] ?? 0;
        const ordinal = prior + 1;
        return ordinal - counteredPlaysBefore(state ?? {}, owner, ordinal) === n;
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
    case "once-per-game": {
      // rule 315.2.a — "At the start of each player's FIRST Beginning Phase":
      // a game-long tally, scoped to the player the event names so every player
      // gets their own first occurrence. `fireTriggers` tallies before matching,
      // so "first" is a count of exactly 1.
      const counts = state?.gameEventCounts;
      if (!counts) {
        return false;
      }
      const pid = "owner" in event ? event.owner : "playerId" in event ? event.playerId : card.owner;
      const key = typeof pid === "string" ? `${event.type}|p:${pid}` : event.type;
      return (counts[key] ?? 0) === 1;
    }
    case "battlefield-was-uncontrolled": {
      // rule 188 / 469.1 (sfd-116-221): "conquer a battlefield that was
      // uncontrolled" — only when no player controlled it as the conquer
      // happened. Emitters carry the pre-conquer controller.
      if (event.type !== "conquer") {
        return false;
      }
      return (event.previousController ?? null) === null;
    }
    case "once-each-turn":
    case "once-per-turn":
      // rule 383.3.e — a "once each turn" trigger simply does not trigger
      // again that turn. `fireTriggers` tallies each ability that actually
      // triggered under `triggerFireKey`, cleared with the rest of
      // `turnEventCounts` at the turn boundary.
      return (state?.turnEventCounts?.[triggerFireKey(trigger, card)] ?? 0) === 0;
    case "during-showdown": {
      // rule 553: a showdown lasts from the moment it opens until every
      // Relevant Player passes in succession, so "during a showdown" is
      // satisfied whenever an active showdown is on the stack.
      const stack = state?.interaction?.showdownStack;
      return Array.isArray(stack) && stack.some((s) => s?.active !== false);
    }
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
    case "during-phase": {
      // rule 315 (unl-174-219 Shard of Undoing): "during your Beginning Phase"
      // is narrower than "during your turn" — the event must land while that
      // phase is the current one, and `whose` scopes the turn it belongs to.
      const active = state?.turn?.activePlayer;
      const phase = state?.turn?.phase;
      if (phase === undefined || phase !== restriction.phase) {
        return false;
      }
      if (restriction.whose === undefined) {
        return true;
      }
      if (active === undefined) {
        return false;
      }
      return restriction.whose === "opponent" ? active !== card.owner : active === card.owner;
    }
    case "min-cost": {
      // rule 206: cost thresholds ("a spell that costs [5] or more") compare the
      // PRINTED Energy cost of the played card — power pips don't count.
      const subjectId = "cardId" in event ? event.cardId : undefined;
      if (typeof subjectId !== "string") {
        return false;
      }
      return getGlobalCardRegistry().getEnergyCost(subjectId) >= (restriction.count ?? 0);
    }
    case "self-at-battlefield":
      return card.zone.startsWith("battlefield");
    case "non-token": {
      // rule 187.2 (ven-068a-166) — "a non-token <card>": tokens carry a
      // `token-` id prefix (see effects/create-token.ts), so the subject card
      // of the event decides. No subject card → nothing to qualify.
      const subjectId = "cardId" in event ? event.cardId : undefined;
      if (typeof subjectId !== "string") {
        return false;
      }
      return !subjectId.startsWith("token-");
    }
    default:
      // TODO(trigger-restriction): unknown restriction type — block rather
      // than permissively fire (previous permissive behavior caused Bug A).
      return false;
  }
}

/**
 * Optional board readers the matcher needs for subject-state filters
 * (rule 708 — "Mighty" is the subject's CURRENT Might, statics included).
 */
export interface TriggerMatcherDeps {
  readonly getCardMeta?: (cardId: string) => Record<string, unknown> | undefined;
}

/** rule 708 — a unit is Mighty while its CURRENT Might is 5 or more. */
const MIGHTY_THRESHOLD = 5;

/**
 * rule 708 / 710 — current Might of a subject card: printed (or overridden)
 * base plus buffs, this-turn modifiers, static bonuses and attached Equipment.
 */
function subjectCurrentMight(cardId: string, deps?: TriggerMatcherDeps): number {
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId) as { might?: number } | undefined;
  const meta = deps?.getCardMeta?.(cardId) as
    | {
        baseMightOverride?: number;
        buffed?: boolean;
        extraBuffs?: number;
        mightModifier?: number;
        staticMightBonus?: number;
        equippedWith?: readonly string[];
      }
    | undefined;
  const base = meta?.baseMightOverride ?? def?.might ?? 0;
  const buff = (meta?.buffed ? 1 : 0) + (meta?.extraBuffs ?? 0);
  let equip = 0;
  for (const equipId of meta?.equippedWith ?? []) {
    equip += registry.getMightBonus(equipId);
  }
  return Math.max(
    0,
    base + buff + (meta?.mightModifier ?? 0) + (meta?.staticMightBonus ?? 0) + equip,
  );
}

/**
 * Check if a trigger matches a game event.
 */
function triggerMatchesEvent(
  trigger: TriggerableAbility["trigger"],
  event: GameEvent,
  card: CardWithAbilities,
  state?: TriggerMatcherState,
  deps?: TriggerMatcherDeps,
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
          : e === "move-to-battlefield" || e === "move-from-battlefield" || e === "move-from-here"
            ? "move"
            : e,
    );
  // rule 416.1.b (rule-id: ogn-235-298) — "when you recycle one or more cards
  // to your MAIN DECK": a recycled rune goes under the Rune Deck and is not a
  // card at all ("Runes aren't cards"), so a rune-only recycle fires nothing.
  // Triggers written about runes ("when you recycle a rune", sfd-203-221) use
  // the plain `recycle` event and are unaffected.
  if (event.type === "recycle" && trigger.event.split("-or-").includes("recycle-cards-to-deck")) {
    const registry = getGlobalCardRegistry();
    if (!event.cardIds.some((id) => registry.getCardType(id as string) !== "rune")) {
      return false;
    }
  }
  // rule 446.1 / 190.6.a (ogn-277-298) — a battlefield's "When a unit moves
  // from here" is the engine `move` event narrowed by ORIGIN to THIS
  // battlefield: a retreat to base and a Ganking hop to another battlefield
  // both qualify, leaving any other battlefield never does. Recalls emit no
  // `move` event (rule 456.1), so they can't reach here.
  if (event.type === "move" && trigger.event.split("-or-").includes("move-from-here")) {
    if (card.zone !== "battlefieldRow" || String(event.from) !== `battlefield-${card.id}`) {
      return false;
    }
  }
  if (
    event.type === "move" &&
    trigger.event.split("-or-").includes("move-to-battlefield") &&
    !String(event.to).startsWith("battlefield-")
  ) {
    return false;
  }
  // rule 144.4.b / 144.4.c (sfd-137-221) — parser event `move-from-battlefield`
  // ("When I move from a battlefield") is the engine `move` event narrowed by
  // ORIGIN: battlefield → base and battlefield → battlefield (Ganking) both
  // qualify, base → battlefield never does. Recalls emit no `move` event
  // (rule 420: "Recalls are not Moves"), so they can't reach here.
  if (
    event.type === "move" &&
    trigger.event.split("-or-").includes("move-from-battlefield") &&
    !String(event.from).startsWith("battlefield-")
  ) {
    return false;
  }
  // rule 471.2.a (unl-214-219) — "When a unit HERE is returned to a player's
  // hand" is the `return-to-hand` event narrowed by ORIGIN to this
  // battlefield: a bounce from base or from another battlefield fires nothing.
  if (event.type === "return-to-hand" && trigger.location === "here") {
    const own =
      card.zone === "battlefieldRow"
        ? card.id
        : card.zone.startsWith("battlefield-")
          ? card.zone.slice("battlefield-".length)
          : undefined;
    if (own === undefined || (event as { from?: string }).from !== `battlefield-${own}`) {
      return false;
    }
  }
  // rule-id: ogn-091-298 — a typed play trigger ("When you play a gear /
  // unit") is the `play-card` event narrowed by the played card's type. Spells
  // already get a dedicated `play-spell` event on resolution — don't double-fire.
  const typedPlay =
    event.type === "play-card" && event.cardType !== "spell" ? `play-${event.cardType}` : undefined;
  // rule 185.2.a (unl-109-219) — tokens are not cards, but they can still be
  // Played: playing a unit token IS playing a unit, so a `play-unit` trigger
  // matches the `play-token-unit` event (a `play-card` trigger still does not).
  // rule 187 / 383.4 (ogn-091-298 × sfd-134-221) — likewise a gear token being
  // played matches a `play-gear` trigger.
  const tokenTypedPlay =
    (event.type === "play-token-unit" && triggerEvents.includes("play-unit")) ||
    (event.type === "play-token-gear" && triggerEvents.includes("play-gear"));
  // rule 419.1 (ven-197-166) — "when you play a card from anywhere other than
  // your hand": the `play-card` event narrowed by the play's ORIGIN zone (the
  // play pipeline stamps `from` — trash, banishment, championZone, facedown-…).
  const notFromHandPlay =
    event.type === "play-card" &&
    triggerEvents.includes("play-card-not-from-hand") &&
    typeof (event as { from?: unknown }).from === "string" &&
    (event as { from?: string }).from !== "hand";
  if (
    !triggerEvents.includes(mapped) &&
    !(typedPlay && triggerEvents.includes(typedPlay)) &&
    !tokenTypedPlay &&
    !notFromHandPlay
  ) {
    return false;
  }

  // rule-id: sfd-075-221 — "an activated ability of a GEAR" qualifies the
  // acting source: a legend's or a unit's ability (or an event with no source
  // type) never satisfies it.
  if (trigger.sourceType !== undefined) {
    const eventSourceType = (event as { sourceType?: string }).sourceType;
    if (eventSourceType !== trigger.sourceType) {
      return false;
    }
  }

  // rule-id: sfd-120-221 (rule 469.1) — "conquer after an attack": only a
  // conquer produced by combat carries `afterAttack`.
  if (trigger.afterAttack === true && (event as { afterAttack?: boolean }).afterAttack !== true) {
    return false;
  }

  // rule 471.2.a — a trigger printed with "here" ("When you conquer here") is
  // anchored to the battlefield this card occupies: its controller conquering
  // or holding some OTHER battlefield never fires it. Events naming no
  // battlefield can't be judged here and fall through to the `on` branches.
  if (trigger.location === "here") {
    const eventBattlefield = (event as { battlefieldId?: string }).battlefieldId;
    if (typeof eventBattlefield === "string") {
      const cardBattlefield =
        card.zone === "battlefieldRow" ? card.id : card.zone.replace(/^battlefield-/, "");
      if (eventBattlefield !== cardBattlefield) {
        return false;
      }
    }
  }

  // rule 471.2.a (ogn-291-298) — a BATTLEFIELD card's own abilities only see
  // events that happened at THAT battlefield, whatever the trigger's `on`
  // subject says: its controller conquering/holding somewhere else is not
  // "here". A trigger explicitly scoped elsewhere ("another battlefield") opts
  // out by naming its own `location`.
  if (
    card.zone === "battlefieldRow" &&
    !("cardId" in event) &&
    (trigger.location === undefined || trigger.location === "here")
  ) {
    const where = (event as { battlefieldId?: string }).battlefieldId;
    if (typeof where === "string" && where !== card.id) {
      return false;
    }
  }

  // rule-id: ven-177-166 — a Might threshold trigger carries its bound as a
  // `might-threshold` restriction; without one the event can't be judged.
  if (
    event.type === "might-becomes" &&
    !(trigger.restrictions ?? []).some((r) => r.type === "might-threshold")
  ) {
    return false;
  }

  // rule 471.2.b (ogn-280-298) — a trigger printed "… HERE" is scoped to the
  // battlefield the printing card sits at (or IS): only an event that happened
  // there fires it. Holding a second battlefield the same turn never fires the
  // Grove twice, and an uncontrolled Grove never fires off another
  // battlefield's hold (190.6.d — its "you" refers to no one).
  if (trigger.location === "here") {
    const own =
      card.zone === "battlefieldRow"
        ? card.id
        : card.zone.startsWith("battlefield-")
          ? card.zone.slice("battlefield-".length)
          : undefined;
    const where =
      "battlefieldId" in event && typeof event.battlefieldId === "string"
        ? event.battlefieldId
        : "to" in event && typeof event.to === "string" && event.to.startsWith("battlefield-")
          ? event.to.slice("battlefield-".length)
          : undefined;
    if (where !== undefined && own !== where) {
      return false;
    }
  }

  // Check "on" subject
  const on = trigger.on ?? "self";

  if (on === "self") {
    // Self-trigger: the card that has this ability must be the subject
    if ("cardId" in event && event.cardId !== card.id) {
      return false;
    }
    // rule 383.1 (sfd-047-221) — "When YOU buff me" is attributed to the
    // buffing player: an opponent's effect buffing this card must not fire it.
    if (mapped === "buff" && "playerId" in event && event.playerId !== card.owner) {
      return false;
    }
    // rule 827.1.c / 441.1.c.1 (rule-id: ven-153-166) — "When I become
    // [Empowered]" is an edge trigger: re-empowering an already-Empowered card
    // still publishes the empower ACTION event, but nothing BECAME Empowered.
    if (event.type === "empower" && event.becameEmpowered === false) {
      return false;
    }
    // rule 383.4.b (sfd-057-221) — "When YOU choose me" is attributed to the
    // chooser: an opponent choosing this card must not fire its own trigger.
    if (mapped === "choose" && "chooserId" in event && event.chooserId !== card.owner) {
      return false;
    }
    if ("battlefieldId" in event && !("cardId" in event) && card.zone === "battlefieldRow") {
      // Battlefield card self-triggers (hold, conquer): match by battlefieldId.
      // The controller who holds/conquers may differ from the card's deck owner.
      if (event.battlefieldId !== card.id) {
        return false;
      }
    } else if (
      // rule 383.4.c.2 / 383.4.d.2.a (ven-182-166) — "when I score" is the
      // generic `score` event read from THIS unit's seat: it must be present at
      // the battlefield that scored, exactly like its `hold`/`conquer` halves.
      (mapped === "hold" || mapped === "conquer" || mapped === "score") &&
      "battlefieldId" in event &&
      !("cardId" in event)
    ) {
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
      // rule 740.1.a — friendliness follows CONTROL as the unit died.
      if ((event.controller ?? event.owner) !== card.owner) {
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
    } else if (event.type === "play-token-unit" || event.type === "play-token-gear") {
      // rule 817.1.b (rule-id: sfd-166-221) — playing a unit or gear TOKEN is
      // playing a friendly permanent only for the player who played it.
      if (event.playerId !== card.owner) {
        return false;
      }
    }
  } else if (on === "another-friendly-units" && event.type === "play-card") {
    // "When you play another unit": friendly play, excluding this card itself.
    if (event.playerId !== card.owner || event.cardId === card.id) {
      return false;
    }
  } else if (on === "any-unit" || on === "any" || on === "any-player") {
    // Match any subject — except on a battlefield, where "When a player plays a
    // unit" is always printed "HERE" (rule 383.4.d / 359.2.c, unl-218-219): the
    // play must have landed at THIS battlefield. A play whose destination the
    // event does not name cannot be judged, so it never fires.
    if (event.type === "play-card" && card.zone === "battlefieldRow") {
      const to = (event as { to?: string }).to;
      if (
        typeof to !== "string" ||
        !to.startsWith("battlefield-") ||
        to.slice("battlefield-".length) !== card.id
      ) {
        return false;
      }
    }
  } else if (on === "enemy-units") {
    if ("owner" in event && event.owner === card.owner) {
      return false;
    }
  } else if (on === "controller" || on === "controller-or-allies") {
    // rule 187.6.c / 190.6.d — on a battlefield card "you" IS its controller, so
    // an UNCONTROLLED battlefield's "when you …" names no one and can never
    // trigger (a unit arriving mid-showdown establishes no control, 187.4.c).
    if (card.zone === "battlefieldRow" && state?.battlefields !== undefined) {
      const bf = state.battlefields[card.id];
      if (bf !== undefined && (bf.controller === null || bf.controller === undefined)) {
        return false;
      }
    }
    // Player-scoped event must be for this card's controller.
    if ("playerId" in event && event.playerId !== card.owner) {
      return false;
    }
    // rule 441.3.a (rule-id: ven-153-166) — when the event names the player the
    // effect DIRECTED to act (`actor`), that player is "you", whoever owns the
    // subject: my Sanction empowering an enemy unit is still ME empowering.
    const actor = "actor" in event && typeof event.actor === "string" ? event.actor : undefined;
    if (actor !== undefined && actor !== card.owner) {
      return false;
    }
    // rule 464.2.c.2 (sfd-126-221) — "when YOU attack/defend" is attributed to
    // the designated player: the attack/defend event names the acting unit's
    // controller in `owner`, so an ENEMY unit defending is not "you defending".
    if (
      actor === undefined &&
      !("playerId" in event) &&
      "owner" in event &&
      typeof event.owner === "string" &&
      event.owner !== card.owner
    ) {
      return false;
    }
    // rule-id: ogn-202-298 — "When you discard one or more cards" triggers
    // once per discard event, not once per card in a multi-card discard.
    if (event.type === "discard" && (event.batchIndex ?? 0) > 0) {
      return false;
    }
    // rule 383.4.f.2.a (sfd-126-221) — "when you defend" is a Defend Trigger
    // checked ONCE per combat, however many of your units defend.
    if (event.type === "defend" && (event.batchIndex ?? 0) > 0) {
      return false;
    }
    // rule 466.3.a (sfd-185-221) — a PLAYER wins a combat, so "when you win a
    // combat" fires once however many of your units survived it.
    if (event.type === "win-combat" && (event.batchIndex ?? 0) > 0) {
      return false;
    }
    // rule 127.1 / 411.4 (rule-id: ven-191-166) — "when you banish a card YOU
    // OWN": the banisher and the owner must both be this card's controller, so
    // banishing something out of an opponent's trash never counts.
    if (event.type === "banish" && event.owner !== undefined && event.owner !== card.owner) {
      return false;
    }
    // rule 441.2.a (rule-id: ven-153-166) — "when you empower something ELSE":
    // a card is never "something else" to itself, so its own false→true Empower
    // edge must not re-trigger its own ability.
    if (event.type === "empower" && event.cardId === card.id) {
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
      controller?: "friendly" | "enemy" | "any" | "actor";
      cardType?: string;
      type?: string;
      location?:
        | "here"
        | "from-here"
        | "battlefield"
        | "other-battlefield"
        | "friendly-battlefield";
      excludeSelf?: boolean;
      tag?: string;
      filter?: string | readonly string[];
      actor?: "controller" | "opponent" | "any";
      batched?: boolean;
    };
    // rule 423.1 (ogn-261-298) — "when you stun ONE OR MORE enemy units": one
    // game action over several units is a single trigger, so every event after
    // the first of that batch is ignored.
    if (desc.batched === true && (("batchIndex" in event ? event.batchIndex : 0) ?? 0) > 0) {
      return false;
    }
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
    // rule 164.2.b / 161.2.b (sfd-203-221) — "When you recycle A RUNE": the
    // recycled subject must be a rune (runes recycle to the Rune Deck);
    // recycling a Main Deck card is not it. Unknown subject → deny.
    if (filters.includes("rune")) {
      const subjectIds =
        "cardIds" in event && Array.isArray(event.cardIds)
          ? (event.cardIds as string[])
          : "cardId" in event && typeof event.cardId === "string"
            ? [event.cardId]
            : [];
      const reg = getGlobalCardRegistry();
      if (
        !subjectIds.some(
          (id) => (reg.get(id) as { cardType?: string } | undefined)?.cardType === "rune",
        )
      ) {
        return false;
      }
    }
    // rule 708 (ogn-249-298) — "when you play a [Mighty] unit": Mighty is the
    // subject's CURRENT Might (5+) as it is played, so a printed 4 entering
    // under a +1 aura qualifies (710) and a plain 4 does not.
    if (filters.includes("mighty")) {
      const subjectId = "cardId" in event ? event.cardId : undefined;
      if (
        typeof subjectId !== "string" ||
        subjectCurrentMight(subjectId, deps) < MIGHTY_THRESHOLD
      ) {
        return false;
      }
    }
    // rule 383.4.d — a card-type-scoped subject ("a friendly UNIT"): read the
    // type off the event when it names one, else off the subject's definition.
    // The parser writes the scope as `cardType` on some patterns and as `type`
    // on others (ogn-143-298 "when you ready a friendly unit"); both mean the
    // subject's card type, so a gear or a rune readying is not "a unit".
    const wantedCardType =
      typeof desc.cardType === "string"
        ? desc.cardType
        : typeof desc.type === "string" && SUBJECT_CARD_TYPES.has(desc.type)
          ? desc.type
          : undefined;
    if (wantedCardType !== undefined) {
      const subjectId = "cardId" in event ? event.cardId : undefined;
      const subjectType =
        "cardType" in event && typeof event.cardType === "string"
          ? event.cardType
          : typeof subjectId === "string"
            ? (getGlobalCardRegistry().get(subjectId) as { cardType?: string } | undefined)?.cardType
            : undefined;
      if (subjectType !== undefined && subjectType !== wantedCardType) {
        return false;
      }
    }
    // rule 383.4.b (sfd-144-221) — "When YOU choose a friendly unit" is
    // attributed to the chooser, exactly like the `on:"self"` form above: an
    // OPPONENT targeting one of my units must not fire my trigger. A
    // descriptor that names its own `actor` opts out of this default.
    if (
      mapped === "choose" &&
      desc.actor === undefined &&
      "chooserId" in event &&
      event.chooserId !== card.owner
    ) {
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
    // rule-id: sfd-148-221 (rule 466.7.a / 428.1) — "When I die IN COMBAT": the
    // unit must have been IN a combat as it died, not necessarily killed BY
    // combat damage. A designated attacker/defender finished off mid-combat by
    // a spell or a Deathknell died in combat (`wasInCombat`); a unit killed
    // after the designations were removed did not.
    if (
      filters.includes("in-combat") &&
      (event.type !== "die" || (event.killSource !== "combat" && event.wasInCombat !== true))
    ) {
      return false;
    }
    if (filters.includes("stunned") && event.type === "die" && event.wasStunned !== true) {
      return false;
    }
    // rule 702 (ogn-228-298): "a BUFFED friendly unit dies" — the buff is read
    // as the unit died, since the meta is wiped on the way to the trash.
    if (filters.includes("buffed") && (event.type !== "die" || event.wasBuffed !== true)) {
      return false;
    }
    // rule 428.5.b (ruling ecd5b45a6a2afcc4) — "when YOU kill a unit with a
    // spell" needs YOUR spell to do the killing: both the seat performing the
    // kill and the controller of the spell holding the Kill instruction must be
    // this card's owner. Picking which of your own units dies to an OPPONENT's
    // "each player kills one of their units" satisfies only the first.
    if (
      filters.includes("killed-by-spell") &&
      (event.type !== "die" ||
        event.killSource !== "spell" ||
        event.killedBy !== card.owner ||
        (event.killedBySource ?? event.killedBy) !== card.owner)
    ) {
      return false;
    }
    // rule 740.1.a — "friendly"/"enemy" follow CONTROL, not deck ownership. The
    // leave-board choke point stamps the controller-as-it-left on `die`/
    // `leave-board`, so a stolen unit dying is friendly to whoever controlled it.
    const subjectOwner =
      "controller" in event && typeof event.controller === "string"
        ? event.controller
        : "owner" in event
          ? event.owner
          : "playerId" in event
            ? event.playerId
            : undefined;
    // rule 489.8.e / 740.1.a (ruling 81ae24ccaa2ea59b) — in team modes a
    // TEAMMATE's objects are friendly too (and never enemy), so "when a
    // friendly unit attacks or defends alone" fires off an ally's unit.
    // `alliedSeats` degrades to identity in solo games.
    if (
      desc.controller === "friendly" &&
      subjectOwner !== undefined &&
      !alliedSeats(state, subjectOwner, card.owner)
    ) {
      return false;
    }
    if (
      desc.controller === "enemy" &&
      subjectOwner !== undefined &&
      alliedSeats(state, subjectOwner, card.owner)
    ) {
      return false;
    }
    // rule 740.1.a (rule-id: ogn-292-298) — "when A PLAYER chooses A FRIENDLY
    // unit here": on a symmetric ability, "friendly" is judged from the ACTING
    // player, not from the printing card's controller, so either player fires
    // it by choosing their own unit and neither fires it off an enemy unit.
    if (desc.controller === "actor") {
      const actingId =
        "chooserId" in event
          ? event.chooserId
          : "playerId" in event
            ? event.playerId
            : undefined;
      if (actingId === undefined || subjectOwner === undefined || subjectOwner !== actingId) {
        return false;
      }
    }
    // rule-id: unl-133-219 — "When YOU move an enemy unit": the actor (the
    // player whose action/effect caused the event) must be this card's
    // controller. Unknown actor → deny rather than fire permissively.
    if (desc.actor && desc.actor !== "any") {
      const actorId =
        "movedBy" in event
          ? event.movedBy
          : // rule-id: unl-055-219 — "When YOU [Stun] …" is attributed to the
            // player whose effect applied the stun.
            "stunnedBy" in event
            ? event.stunnedBy
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
    // rule 383.4.d (ogn-177-298) — "when a friendly unit moves FROM my
    // location": the subject's ORIGIN must be this card's zone. `here` reads
    // the destination, which is the opposite moment.
    if (desc.location === "from-here") {
      const fromZone = "from" in event ? String(event.from) : undefined;
      if (fromZone === undefined || fromZone !== card.zone) {
        return false;
      }
    }
    if (desc.location === "here") {
      // rule 428.1.a.1.b — a death is located where the unit was as it died
      // (last-known information stamped on the `die` event).
      const evLoc =
        "battlefieldId" in event
          ? event.battlefieldId
          : "to" in event
            ? String(event.to).replace(/^battlefield-/, "")
            : "diedAt" in event && typeof event.diedAt === "string"
              ? event.diedAt.replace(/^battlefield-/, "")
              : undefined;
      const cardLoc = card.zone?.replace(/^battlefield-/, "");
      if (evLoc !== cardLoc && evLoc !== card.id) {
        return false;
      }
    }
    // rule 190.4 (ogn-255-298) — "attacks a battlefield YOU control": the
    // battlefield the event names must be controlled by this card's controller,
    // so in a multiplayer game an attack on a THIRD player's battlefield is not
    // it. An unknown battlefield cannot be judged, so it never fires.
    if (desc.location === "friendly-battlefield") {
      const bfId =
        "battlefieldId" in event && typeof event.battlefieldId === "string"
          ? event.battlefieldId
          : "to" in event && typeof event.to === "string"
            ? event.to.replace(/^battlefield-/, "")
            : undefined;
      if (bfId === undefined || state?.battlefields?.[bfId]?.controller !== card.owner) {
        return false;
      }
    }
    // rule 144.4 (ogn-158-298) — "moves to a battlefield other than mine":
    // the destination must be a battlefield (bases don't count) and, for
    // `other-battlefield`, must not be the battlefield this card occupies.
    if (desc.location === "other-battlefield" || desc.location === "battlefield") {
      // rule-id: unl-055-219 — non-move events (stun, …) name their location
      // with `battlefieldId` rather than a move destination; both forms mean
      // "the subject is at a battlefield".
      const to =
        "to" in event
          ? String(event.to)
          : "battlefieldId" in event && typeof event.battlefieldId === "string"
            ? `battlefield-${event.battlefieldId}`
            : undefined;
      if (to === undefined || !to.startsWith("battlefield-")) {
        return false;
      }
      if (desc.location === "other-battlefield") {
        // rule 144.4 (ruling 30b2fb1d5002156d) — "other than mine" needs a
        // battlefield of mine to be other THAN: a card sitting in base (or any
        // non-battlefield zone) occupies no battlefield, so the trigger cannot
        // fire at all.
        if (typeof card.zone !== "string" || !card.zone.startsWith("battlefield-")) {
          return false;
        }
        if (to === card.zone) {
          return false;
        }
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
  // rule 385.2 (ogn-252-298): "…return this from your trash to your hand" is
  // likewise active only from the trash — `from: "trash"` marks it.
  return (
    (eff?.type === "play" || eff?.type === "return-to-hand") &&
    eff.from === "trash" &&
    (eff.target === undefined || eff.target === "self")
  );
}

/**
 * rule 190.6.b — the player a matched trigger resolves FOR. Normally the card's
 * controller, but a battlefield ability phrased for "each player" ("At the
 * start of each player's first Beginning Phase, THAT PLAYER gains 1 point")
 * resolves for the player the firing event names, not the battlefield's deck
 * owner — an uncontrolled battlefield has no controller of its own.
 */
function subjectPlayerForTrigger(
  ability: TriggerableAbility,
  event: GameEvent,
  card: CardWithAbilities,
): string {
  const trigger = ability.trigger;
  if (trigger.on !== "any-player" || card.zone !== "battlefieldRow") {
    return card.owner;
  }
  // rule 190.6.a — a turn-structure trigger ("At the start of EACH PLAYER's
  // Beginning Phase") names a moment, not an owner: unless its effect is
  // directed at that player ("… that player gains 1 point"), the battlefield's
  // CONTROLLER controls it, on whosever turn it fires. An effect that acts on
  // the board instead (deal 1 to each unit here) stays with the controller.
  const phaseEvent =
    trigger.event === "beginning-phase" ||
    trigger.event === "start-of-turn" ||
    trigger.event === "end-of-turn";
  const target = (ability.effect as { target?: { type?: string } } | undefined)?.target;
  if (phaseEvent && target !== undefined && target.type !== "player") {
    return card.owner;
  }
  const pid = "playerId" in event ? event.playerId : "owner" in event ? event.owner : undefined;
  return typeof pid === "string" ? pid : card.owner;
}

export function findMatchingTriggers(
  rawEvent: GameEvent,
  boardCards: CardWithAbilities[],
  state?: TriggerMatcherState,
  deps?: TriggerMatcherDeps,
): MatchedTrigger[] {
  const matches: MatchedTrigger[] = [];

  // rule 359.2.c — a play-card event that did not name where the permanent
  // landed: read it off the played card, which is already in its entry zone.
  // A battlefield's "When a player plays a unit HERE" (unl-218-219) needs it to
  // tell its own battlefield from the base or any other battlefield.
  const event: GameEvent =
    rawEvent.type === "play-card" && typeof rawEvent.to !== "string"
      ? {
          ...rawEvent,
          ...(() => {
            const zone = boardCards.find((c) => c.id === rawEvent.cardId)?.zone;
            return typeof zone === "string" ? { to: zone } : {};
          })(),
        }
      : rawEvent;

  for (const card of boardCards) {
    // Only cards on the board (or in legendZone) can have triggers fire.
    // Rule ogn-006-298: for a discard event, the discarded card itself is
    // allowed to match from trash so "When you discard me" self-triggers fire.
    const isDiscardSubject = event.type === "discard" && event.cardId === card.id;
    // rule-id: sfd-167-221 — Deathknell: the dying unit is already in trash
    // when `die` fires; let it match its own death.
    const isDieSubject = event.type === "die" && event.cardId === card.id;
    // rule 124.1 (ogn-186-298 Treasure Trove) — same for a bounce / banish /
    // recycle: the card already sits in hand / banishment / the deck when
    // `leave-board` fires, so let it match its own departure.
    const isLeaveBoardSubject = event.type === "leave-board" && event.cardId === card.id;
    // rule-id: ogn-037-298 — a trash card matches only via trash-functioning abilities.
    const trashOnly =
      card.zone === "trash" && !isDiscardSubject && !isDieSubject && !isLeaveBoardSubject;
    if (
      !isDiscardSubject &&
      !isDieSubject &&
      !isLeaveBoardSubject &&
      !trashOnly &&
      card.zone !== "base" &&
      !card.zone.startsWith("battlefield") &&
      card.zone !== "legendZone" &&
      // rule 390.2 (rule-id: sfd-166-221) — a delayed triggered ability a
      // spell installed on a PLAYER has no card on the board; it is offered
      // as a floating entry and stays active for its duration.
      card.zone !== "floating"
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

      if (triggerMatchesEvent(ability.trigger, event, card, state, deps)) {
        matches.push({
          ability,
          cardId: card.id,
          cardOwner: subjectPlayerForTrigger(ability, event, card),
          event,
        });
      }
    }
  }

  return matches;
}
