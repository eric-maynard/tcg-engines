/**
 * Target Resolver
 *
 * Resolves abstract target descriptions ("a friendly unit", "an enemy unit here",
 * "all units") into actual card IDs on the board.
 *
 * Target types from the parser:
 * - { type: "self" }           → the source card
 * - { type: "unit" }           → any unit on the board
 * - { type: "unit", controller: "friendly" }  → a friendly unit
 * - { type: "unit", controller: "enemy" }     → an enemy unit
 * - { type: "gear" }           → any gear
 * - { type: "card" }           → any card
 * - { type: "player" }         → a player (for effects like "each player")
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import { areAllies } from "../operations/teams";
import { hasEffectiveTag } from "./card-tags";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

/**
 * Simplified target descriptor (from parser output).
 */
export interface TargetDescriptor {
  readonly type: string;
  /** rule-id: ven-150-166 — any-of card-type list ("units, gear, and/or runes"). */
  readonly types?: readonly string[];
  /** rule-id: ogn-180-298 — union of alternative descriptors ("X or Y"). */
  readonly anyOf?: readonly TargetDescriptor[];
  readonly controller?: "friendly" | "enemy" | "any";
  /**
   * rule 108.2 / 127.1 (rule-id: ogn-263-298) — "a unit you OWN": ownership
   * never changes, so a card the opponent currently CONTROLS still matches for
   * its owner (and a card you control but don't own never does).
   */
  readonly owner?: "friendly" | "enemy" | "any";
  readonly location?: string;
  readonly filter?: TargetFilter | TargetFilter[];
  readonly quantity?: number | "all";
  /** Parser sets this for "another"/"other" wording. */
  readonly excludeSelf?: boolean;
  /**
   * rule 355.9.c (unl-215-219) — "ANOTHER unit" in a triggered ability whose
   * subject is a card, not this permanent: drop the card the trigger fired on
   * ("when a player plays a unit here, move ANOTHER unit …" never moves the
   * unit just played).
   */
  readonly excludeTriggerSource?: boolean;
  /**
   * rule-id: ogn-200-298 — "all OTHER …" relative to a preceding step's chosen
   * target: re-resolve from the board and drop the already-bound ids.
   */
  readonly excludeBound?: boolean;
  /**
   * rule 383.3.b.1 — the descriptor names a COST payment ("disempower
   * something you control to …"), which is always the controller's own
   * deliberate choice: prompt even when exactly one candidate is legal
   * instead of silently auto-binding it.
   */
  readonly promptWhenSingle?: boolean;
}

/** Single filter clause — string state literal or object predicate. */
export type TargetFilter = string | Record<string, unknown>;

/**
 * Context for resolving targets.
 */
export interface TargetResolverContext {
  readonly playerId: string;
  readonly sourceCardId: string;
  readonly sourceZone?: string;
  /**
   * rule-id: ven-021-166 — from/to zones of the GameEvent that fired the
   * trigger being resolved, for `location: "move-to-or-from"` filtering.
   */
  readonly triggerZones?: readonly string[];
  /**
   * rule-id: ogn-220-298 — zone of the previously chosen target, for
   * `location: "same"` ("… at the same battlefield") filtering.
   */
  readonly sameZone?: string;
  /**
   * rule-id: ven-031-166 — caller is enumerating the candidate pool for a
   * caster-CHOSEN target (spreads `quantity:"all"` to list every option), so
   * "can't be chosen by enemy spells and abilities" must still apply.
   */
  readonly choosing?: boolean;
  /**
   * rule-id: unl-133-219 — subject card id of the GameEvent that fired the
   * trigger being resolved, for `{ type: "trigger-source" }` ("…[Stun] it").
   */
  readonly triggerSourceId?: string;
  /**
   * rule-id: ogs-002-024 — the caster-chosen battlefield zone
   * (`battlefield-<bfId>`) for `location: "battlefield"` ("… at A
   * battlefield"). When set, only cards in that one zone match.
   */
  readonly battlefieldZone?: string;
  /**
   * rule-id: ven-154-166 (rule 355.8 / 359.3.e) — current Might of the
   * caster-chosen reference unit for a `mightLessThanReference` filter
   * ("Kill an enemy unit with less Might than it"). Unset during legality
   * probes, where no reference has been picked yet.
   */
  readonly referenceMight?: number;
  /**
   * rule 811.1.d / 811.1.d.2 — a card played from a Facedown Zone may only
   * choose targets at the battlefield it was facedown at. When set, board
   * candidates outside `battlefield-<bfId>` are never legal choices.
   */
  readonly hiddenZone?: string;
  readonly draft: RiftboundGameState;
  readonly zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    getCardZone: (cardId: CoreCardId) => string | undefined;
  };
  readonly cards: {
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
    getCardMeta?: (cardId: CoreCardId) => Record<string, unknown> | undefined;
  };
}

/**
 * rule-id: ogs-002-024 — "… all <units> at A battlefield": a programmatic
 * `quantity:"all"` selection scoped to ONE caster-chosen battlefield. The
 * battlefield (not the units) is the play-time choice.
 */
export function isAllAtOneBattlefield(target: unknown): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }
  const t = target as { type?: string; quantity?: unknown; location?: string };
  return t.type !== "battlefield" && t.quantity === "all" && t.location === "battlefield";
}

/**
 * rule-id: ogs-002-024 — when bound targets are a single battlefield id for
 * an all-at-one-battlefield descriptor, return the pinned unit zone.
 */
export function boundBattlefieldZone(
  target: unknown,
  boundTargets: readonly string[] | undefined,
  draft: RiftboundGameState,
): string | undefined {
  if (!isAllAtOneBattlefield(target) || !boundTargets?.length) {
    return undefined;
  }
  // rule-id: ogn-250-298 (rule 355.8) — a spell may lock a Might-reference unit
  // alongside the battlefield ([refUnit, bfId]); the battlefield id names the
  // zone wherever it sits in the bound list.
  const bfId = boundTargets.find((id) => draft.battlefields?.[id] !== undefined);
  return bfId === undefined ? undefined : `battlefield-${bfId}`;
}

/**
 * Resolve a target descriptor to actual card IDs.
 *
 * @param target - The target descriptor from the parsed ability
 * @param ctx - Resolution context
 * @returns Array of resolved card IDs (may be empty if no valid targets)
 */
export function resolveTarget(
  target: TargetDescriptor | string | undefined,
  ctx: TargetResolverContext,
): string[] {
  if (!target) {
    return [];
  }

  // Bare-string target: parser emits "self" for it/me/itself; any other
  // string is a pre-resolved card ID (see getTargetIds in effect-executor).
  if (typeof target === "string") {
    return target === "self" ? [ctx.sourceCardId] : [target];
  }

  // rule-id: ogn-180-298 (Fading Memories) — "a unit at a battlefield or a
  // gear": each branch carries its own location/controller, so resolve them
  // independently and union the pools before applying this descriptor's
  // quantity (rule 355.8 — every candidate must satisfy at least one branch).
  if (target.anyOf && target.anyOf.length > 0) {
    const seen = new Set<string>();
    for (const branch of target.anyOf) {
      for (const id of resolveTarget({ ...branch, quantity: "all" }, ctx)) {
        seen.add(id);
      }
    }
    const union = [...seen];
    if (target.quantity === "all") {
      return union;
    }
    const count = typeof target.quantity === "number" ? target.quantity : 1;
    return union.slice(0, count);
  }

  // Self target
  if (target.type === "self") {
    return [ctx.sourceCardId];
  }

  // rule-id: unl-133-219 — "it" in a triggered effect = the subject card of
  // the event that fired the trigger (threaded from the chain item).
  if (target.type === "trigger-source") {
    return ctx.triggerSourceId ? [ctx.triggerSourceId] : [];
  }

  // Battlefield definitions live in battlefieldRow, not the unit board.
  if (target.type === "battlefield") {
    // rule-id: sfd-217-221 — "each OTHER battlefield": the source battlefield
    // itself never counts, even once its controller conquered it.
    const excludeSelf = (target as { excludeSelf?: boolean }).excludeSelf === true;
    const all = ctx.zones
      .getCardsInZone("battlefieldRow" as CoreZoneId)
      .map((c) => c as string)
      .filter((id) => !excludeSelf || id !== ctx.sourceCardId);
    // rule-id: unl-015-219 — "battlefield you (or allies) control" counts by
    // battlefield CONTROL (draft.battlefields[id].controller), not card owner;
    // uncontrolled battlefields (controller null) never match friendly/enemy.
    const controller = (target as { controller?: string }).controller;
    if (!controller || controller === "any") {
      return all;
    }
    const bfController = (id: string): string | null =>
      ctx.draft.battlefields?.[id]?.controller ?? null;
    if (controller === "friendly") {
      return all.filter((id) => bfController(id) === ctx.playerId);
    }
    if (controller === "friendly-or-allies") {
      return all.filter((id) => {
        const c = bfController(id);
        return c !== null && areAllies(ctx.draft, ctx.playerId, c);
      });
    }
    if (controller === "enemy" || controller === "opponent") {
      return all.filter((id) => {
        const c = bfController(id);
        return c !== null && !areAllies(ctx.draft, ctx.playerId, c);
      });
    }
    return all;
  }

  // Collect candidate cards. rule 355.8 / rule-id: ogn-170-298 — "a unit from
  // your trash" names an OFF-BOARD zone, so the candidate pool is that zone
  // (per player), not the board. Absent an explicit controller, an off-board
  // zone means the resolving player's own ("your trash", "your hand").
  const zoneLocation = offBoardZoneFor(target.location);
  const candidates = zoneLocation
    ? getZoneCardIds(zoneLocation, ctx, target.controller)
    : target.type === "facedown"
      ? getFacedownCardIds(ctx)
      : getBoardCardIds(ctx);

  // Filter by card type
  const registry = getGlobalCardRegistry();
  let filtered = candidates;

  if (target.types && target.types.length > 0) {
    // rule-id: ven-150-166 — "units, gear, and/or runes": one mixed pool over
    // an any-of type list. Runes live in each player's runePool, not on the
    // board, so pull them in when the list names them.
    const want = new Set(target.types);
    // rule 355.9.a.4 (rule-id: ven-082-166) — "a legend, unit, or gear": legends
    // live in the Legend Zones, which the board scan never visits, so pull them
    // in exactly like runes when the type list names them.
    const pool = [
      ...candidates,
      ...(want.has("rune") ? getRunePoolCardIds(ctx) : []),
      ...(want.has("legend") ? getLegendZoneCardIds(ctx) : []),
    ];
    filtered = pool.filter((id) => {
      const ct = registry.get(id)?.cardType;
      if (!ct) return false;
      if (want.has(ct)) return true;
      if (ct === "equipment" && want.has("gear")) return true;
      return false;
    });
  } else if (target.type === "unit") {
    filtered = filtered.filter((id) => {
      const def = registry.get(id);
      return def?.cardType === "unit";
    });
  } else if (target.type === "gear" || target.type === "equipment") {
    filtered = filtered.filter((id) => {
      const def = registry.get(id);
      return def?.cardType === "gear" || def?.cardType === "equipment";
    });
  } else if (target.type === "spell" && zoneLocation) {
    // rule 355.8 (rule-id: ogs-010-024) — "a spell from your trash" names a card
    // TYPE: units/gear/runes in the same zone are never legal choices. Only a
    // zone-scoped pool is filtered — a locationless `{type:"spell"}` descriptor
    // (rule-id: ogn-032-298 "the next spell you play") is criteria for a card
    // played later, not a selection from the board.
    filtered = filtered.filter((id) => registry.get(id)?.cardType === "spell");
  } else if (target.type === "permanent") {
    filtered = filtered.filter((id) => {
      const def = registry.get(id);
      return def?.cardType === "unit" || def?.cardType === "gear" || def?.cardType === "equipment";
    });
  } else if (target.type === "legend") {
    // rule 355.9.a.4 / 355.10.a — "a legend" names a card in a Legend Zone.
    // Both Legend Zones are public, so either player's legend is a legal
    // choice unless the text says friendly/enemy (handled below).
    filtered = getLegendZoneCardIds(ctx);
  } else if (target.type === "rune") {
    // rule-id: ogn-073-298 — "friendly runes" live in each player's runePool,
    // never on the unit board; board cards are not runes.
    filtered = getRunePoolCardIds(ctx);
  }

  // Filter by controller. rule-id: unl-192-219 (359.3.e.12) — "friendly" /
  // "enemy" track the CURRENT controller, so a unit whose control was
  // transferred after being chosen is no longer a legal friendly referent.
  const controllerOf = (id: string): string =>
    ctx.cards.getCardController?.(id as CoreCardId) ??
    ctx.cards.getCardOwner(id as CoreCardId) ??
    "";
  if (target.controller === "friendly") {
    filtered = filtered.filter((id) => controllerOf(id) === ctx.playerId);
  } else if (target.controller === "enemy") {
    filtered = filtered.filter((id) => {
      const controller = controllerOf(id);
      return controller !== ctx.playerId && controller !== "";
    });
  }

  // rule 108.2 / 127.1 (rule-id: ogn-263-298) — "a unit you OWN" reads
  // OWNERSHIP, which control changes never move.
  if (target.owner === "friendly") {
    filtered = filtered.filter(
      (id) => ctx.cards.getCardOwner(id as CoreCardId) === ctx.playerId,
    );
  } else if (target.owner === "enemy") {
    filtered = filtered.filter((id) => {
      const owner = ctx.cards.getCardOwner(id as CoreCardId);
      return owner !== undefined && owner !== ctx.playerId;
    });
  }

  // Filter by location
  if (target.location === "here" && ctx.sourceZone) {
    // Rule 350.1 / 383.2.c: on a battlefield card's own ability, "here" means
    // the per-battlefield unit zone (battlefield-<cardId>), not battlefieldRow.
    const hereZone =
      ctx.sourceZone === "battlefieldRow" ? `battlefield-${ctx.sourceCardId}` : ctx.sourceZone;
    // rule 420.1: every player has their OWN base and they are distinct
    // locations, but they share the `base` zone id — so "here" in a base must
    // additionally match the source's controller, never reach across.
    const baseOwner = hereZone === "base" ? controllerOf(ctx.sourceCardId ?? "") : undefined;
    filtered = filtered.filter((id) => {
      const zone = ctx.zones.getCardZone(id as CoreCardId);
      if (zone !== hereZone) {
        return false;
      }
      return baseOwner === undefined || controllerOf(id) === baseOwner;
    });
  } else if (target.location === "here-battlefield") {
    // rule 428.1.a.1.b: "at my battlefield" — the battlefield the source is (or
    // last was) at. A base is not a battlefield, so nothing qualifies there.
    const hereZone =
      ctx.sourceZone === "battlefieldRow" ? `battlefield-${ctx.sourceCardId}` : ctx.sourceZone;
    filtered =
      hereZone?.startsWith("battlefield") === true
        ? filtered.filter((id) => ctx.zones.getCardZone(id as CoreCardId) === hereZone)
        : [];
  } else if (target.location === "base") {
    filtered = filtered.filter((id) => {
      const zone = ctx.zones.getCardZone(id as CoreCardId);
      return zone === "base";
    });
  } else if (target.location === "move-to-or-from") {
    // rule-id: ven-021-166 — only battlefields the triggering move touched are
    // legal; fall back to the source's current zone (the move destination) when
    // the trigger event wasn't threaded through.
    const moveZones = (
      ctx.triggerZones ?? (ctx.sourceZone ? [ctx.sourceZone] : [])
    ).filter((z) => z.startsWith("battlefield"));
    filtered = filtered.filter((id) => {
      const zone = ctx.zones.getCardZone(id as CoreCardId) ?? "";
      return moveZones.includes(zone);
    });
  } else if (target.location === "same") {
    // rule-id: ogn-220-298 — "at the same battlefield": only units sharing the
    // prior target's battlefield zone are legal. Without a bound reference
    // zone (play-legality probes), any battlefield unit is a candidate.
    filtered = filtered.filter((id) => {
      const zone = ctx.zones.getCardZone(id as CoreCardId) ?? "";
      if (!zone.startsWith("battlefield-")) return false;
      return ctx.sameZone === undefined || zone === ctx.sameZone;
    });
  } else if (target.location?.startsWith("battlefield")) {
    // rule-id: ogs-002-024 — "all enemy units at A battlefield": once the
    // caster has chosen the battlefield, pin to that single zone; unpinned
    // (legality probes / candidate enumeration) any battlefield matches.
    filtered = filtered.filter((id) => {
      const zone = ctx.zones.getCardZone(id as CoreCardId) ?? "";
      return ctx.battlefieldZone === undefined
        ? zone.startsWith("battlefield")
        : zone === ctx.battlefieldZone;
    });
  }

  // rule 811.1.d / 811.1.d.2 — played from Hidden: every board candidate must
  // sit at the battlefield the card was facedown at. Off-board pools
  // ("a unit from your trash") name their own zone and are untouched.
  if (ctx.hiddenZone !== undefined && zoneLocation === undefined) {
    filtered = filtered.filter((id) => ctx.zones.getCardZone(id as CoreCardId) === ctx.hiddenZone);
  }

  // Rule 355.8: apply descriptor filters (state / might / keyword / tag).
  if (target.filter !== undefined) {
    const filters = Array.isArray(target.filter) ? target.filter : [target.filter];
    filtered = filtered.filter((id) => filters.every((f) => matchesFilter(id, f, ctx)));
  }

  // rule-id: ogn-097-298 (355.9.c) — an ability of a permanent can target
  // that permanent; only drop the source when the text says "another"/"other".
  if (target.excludeSelf) {
    filtered = filtered.filter((id) => id !== ctx.sourceCardId);
  }

  // rule 355.9.c (unl-215-219) — "another unit" measured against the trigger's
  // subject: the unit that fired the trigger is never a legal choice.
  if (target.excludeTriggerSource && ctx.triggerSourceId !== undefined) {
    filtered = filtered.filter((id) => id !== ctx.triggerSourceId);
  }

  // rule-id: ven-031-166 — "can't be chosen by enemy spells and abilities":
  // drop opposing Untargetable cards whenever this resolution is a CHOICE
  // (any non-"all" quantity, or an explicit choosing-pool enumeration).
  // Programmatic `quantity:"all"` selections ("all enemy units") don't choose.
  if (target.quantity !== "all" || ctx.choosing) {
    filtered = filtered.filter(
      (id) =>
        !(
          controllerOf(id) !== ctx.playerId &&
          (isUntargetable(id, ctx) || isProtectedFromEnemyChoice(id, ctx))
        ),
    );
  }

  // Apply quantity limit
  if (target.quantity === "all") {
    return filtered;
  }

  const count = typeof target.quantity === "number" ? target.quantity : 1;
  return filtered.slice(0, count);
}

/**
 * Get all card IDs currently on the board (base + battlefields).
 */
function getBoardCardIds(ctx: TargetResolverContext): string[] {
  const ids: string[] = [];

  // Base cards for all players
  for (const playerId of Object.keys(ctx.draft.players)) {
    const baseCards = ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId);
    ids.push(...baseCards.map((c) => c as string));
  }

  // Battlefield cards
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const bfCards = ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId);
    ids.push(...bfCards.map((c) => c as string));
  }

  // NOTE: battlefieldRow (the battlefield-definition cards themselves) is
  // intentionally excluded here — those are locations, not units/permanents,
  // and are only valid when target.type === "battlefield" (handled above).

  // NOTE: Champion zone is intentionally excluded. Cards in the champion zone
  // Have not been played to the board and are not valid targets for board-
  // Targeting effects. Champions must be played (paid for) from the champion
  // Zone to the base before they become targetable.

  return ids;
}

/**
 * rule-id: ogn-181-298 — rule 811.1: facedown cards sit in `facedown-<bf>`
 * zones and have no printed characteristics, so they are never part of the
 * unit/gear board pool. Only a descriptor that names them (`type: "facedown"`)
 * sees them, and no card-type filter is applied to that branch.
 */
function getFacedownCardIds(ctx: TargetResolverContext): string[] {
  const ids: string[] = [];
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    const cards = ctx.zones.getCardsInZone(`facedown-${bfId}` as CoreZoneId);
    ids.push(...cards.map((c) => c as string));
  }
  return ids;
}

/**
 * rule-id: ogn-170-298 — target locations that name a per-player off-board
 * zone rather than the board. Returns the engine zone id, or undefined for
 * board/battlefield locations.
 */
function offBoardZoneFor(location: string | undefined): string | undefined {
  switch (location) {
    case "trash":
      return "trash";
    case "hand":
      return "hand";
    case "banishment":
      return "banishment";
    // rule 355.9.a.5 (rule-id: ogn-263-298) — "… from your Champion Zone":
    // an unplayed champion is an off-board pool of its own, never part of the
    // board scan.
    case "championZone":
      return "championZone";
    case "deck":
    case "mainDeck":
      return "mainDeck";
    default:
      return undefined;
  }
}

/**
 * Cards in a per-player off-board zone. With no explicit controller the zone
 * is the resolving player's own ("a unit from your trash").
 */
function getZoneCardIds(
  zoneId: string,
  ctx: TargetResolverContext,
  controller: string | undefined,
): string[] {
  const players =
    controller === undefined || controller === "friendly"
      ? [ctx.playerId]
      : Object.keys(ctx.draft.players);
  const ids: string[] = [];
  for (const playerId of players) {
    ids.push(
      ...ctx.zones
        .getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)
        .map((c) => c as string),
    );
  }
  return ids;
}

/** rule-id: ven-150-166 — rune cards in every player's rune pool. */
/** rule 355.10.a — every player's Legend Zone is a public zone. */
function getLegendZoneCardIds(ctx: TargetResolverContext): string[] {
  const ids: string[] = [];
  for (const playerId of Object.keys(ctx.draft.players)) {
    ids.push(
      ...ctx.zones
        .getCardsInZone("legendZone" as CoreZoneId, playerId as CorePlayerId)
        .map((c) => c as string),
    );
  }
  return ids;
}

function getRunePoolCardIds(ctx: TargetResolverContext): string[] {
  const ids: string[] = [];
  for (const playerId of Object.keys(ctx.draft.players)) {
    ids.push(
      ...ctx.zones
        .getCardsInZone("runePool" as CoreZoneId, playerId as CorePlayerId)
        .map((c) => c as string),
    );
  }
  return ids;
}

const MIGHTY_THRESHOLD = 5;

/**
 * rule-id: ven-038-166 (Akali, Silent) — "…unless I'm in combat" makes the
 * self-protection conditional, so the printed static must be evaluated live
 * (the target resolver can't wait for the next static recalculation). Only the
 * combat-state condition shapes a self-protection can carry are understood; an
 * unrecognised condition leaves the protection off, as before.
 */
function selfProtectionConditionHolds(
  condition: unknown,
  meta: Partial<RiftboundCardMeta> | undefined,
  controllerXp?: number,
): boolean {
  if (condition === undefined) {
    return true;
  }
  const c = condition as {
    type?: string;
    condition?: unknown;
    conditions?: unknown[];
    threshold?: number;
  };
  switch (c.type) {
    case "in-combat":
      return meta?.combatRole === "attacker" || meta?.combatRole === "defender";
    case "attacking":
      return meta?.combatRole === "attacker";
    case "defending":
      return meta?.combatRole === "defender";
    // rule 824 / 727.1.b (rule-id: unl-059-219) — "[Level N][>] I can't be
    // chosen…": the gate is the CONTROLLER's current XP total (a threshold,
    // never spent), read live rather than from the last static recalculation.
    case "while-level":
      return controllerXp !== undefined && controllerXp >= (c.threshold ?? 0);
    case "not":
      return !selfProtectionConditionHolds(c.condition, meta, controllerXp);
    case "and":
      return (c.conditions ?? []).every((sub) =>
        selfProtectionConditionHolds(sub, meta, controllerXp),
      );
    case "or":
      return (c.conditions ?? []).some((sub) =>
        selfProtectionConditionHolds(sub, meta, controllerXp),
      );
    default:
      return false;
  }
}

/**
 * rule-id: ven-031-166 / sfd-105-221 — a card "can't be chosen by enemy spells
 * and abilities" when it carries the (virtual) Untargetable keyword, either
 * printed/static or granted for a duration via `grant-keyword`.
 */
export function isUntargetable(
  cardId: string,
  ctx: Pick<TargetResolverContext, "cards"> & Partial<Pick<TargetResolverContext, "draft">>,
): boolean {
  const registry = getGlobalCardRegistry();
  if (registry.hasKeyword(cardId, "Untargetable")) {
    return true;
  }
  // rule 757: an unconditional printed static "I can't be chosen…" (self
  // grant-keyword Untargetable) is always on while the card is in play — it
  // must not depend on when static effects were last recalculated into meta.
  const abilities = (registry.getAbilities(cardId) ?? []) as readonly {
    type?: string;
    condition?: unknown;
    effect?: { type?: string; keyword?: string; target?: unknown };
  }[];
  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  const controller =
    ctx.cards.getCardController?.(cardId as CoreCardId) ??
    ctx.cards.getCardOwner(cardId as CoreCardId);
  const controllerXp =
    controller === undefined ? undefined : ctx.draft?.players?.[controller]?.xp;
  if (
    abilities.some(
      (a) =>
        a.type === "static" &&
        a.effect?.type === "grant-keyword" &&
        a.effect.keyword === "Untargetable" &&
        (a.effect.target === undefined || a.effect.target === "self") &&
        selfProtectionConditionHolds(a.condition, meta, controllerXp),
    )
  ) {
    return true;
  }
  return meta?.grantedKeywords?.some((gk) => gk.keyword === "Untargetable") ?? false;
}

/**
 * rule 757 / 758.2.a (unl-057-219 Alpha Wildclaw) — "Your units here with less
 * Might than me can't be chosen by enemy spells and abilities": the protected
 * SET is described by ANOTHER permanent's static and is re-evaluated live, so
 * it must be read off the board rather than off the last static recalculation.
 * Only the chooser-relative call sites consult this (enemy choices only).
 */
export function isProtectedFromEnemyChoice(cardId: string, ctx: TargetResolverContext): boolean {
  const registry = getGlobalCardRegistry();
  const controllerOf = (id: string): string =>
    ctx.cards.getCardController?.(id as CoreCardId) ??
    ctx.cards.getCardOwner(id as CoreCardId) ??
    "";
  const zoneOf = (id: string): string =>
    (ctx.zones.getCardZone(id as CoreCardId) as string | undefined) ?? "";
  const mightOf = (id: string): number =>
    effectiveMight(registry.get(id), ctx.cards.getCardMeta?.(id as CoreCardId));

  const targetController = controllerOf(cardId);
  const targetZone = zoneOf(cardId);

  for (const sourceId of getBoardCardIds(ctx)) {
    if (sourceId === cardId) {
      continue;
    }
    const abilities = (registry.getAbilities(sourceId) ?? []) as readonly {
      type?: string;
      effect?: { type?: string; restriction?: string; target?: TargetDescriptor };
    }[];
    for (const ability of abilities) {
      const effect = ability.effect;
      if (
        ability.type !== "static" ||
        effect?.type !== "restriction" ||
        effect.restriction !== "untargetable-by-enemy-spells-abilities"
      ) {
        continue;
      }
      const t = effect.target;
      if (!t || typeof t !== "object") {
        continue;
      }
      if (t.type === "unit" && registry.get(cardId)?.cardType !== "unit") {
        continue;
      }
      if (t.controller === "friendly" && controllerOf(sourceId) !== targetController) {
        continue;
      }
      if (t.controller === "enemy" && controllerOf(sourceId) === targetController) {
        continue;
      }
      if (
        (t.location === "here" || t.location === "battlefield") &&
        zoneOf(sourceId) !== targetZone
      ) {
        continue;
      }
      const filters = t.filter === undefined ? [] : Array.isArray(t.filter) ? t.filter : [t.filter];
      const matches = filters.every((f) => {
        if (
          typeof f === "object" &&
          f !== null &&
          (f as { mightLessThanSelf?: boolean }).mightLessThanSelf === true
        ) {
          return mightOf(cardId) < mightOf(sourceId);
        }
        return matchesFilter(cardId, f, ctx);
      });
      if (matches) {
        return true;
      }
    }
  }
  return false;
}

/**
 * `exhausted` / `stunned` live in the engine's flag store (`counters.setFlag` →
 * `meta.__flags`); seeded positions and mirrors use the top-level meta field.
 * Both representations mean the same status, so read either.
 */
function metaFlag(
  meta: Partial<RiftboundCardMeta> | undefined,
  key: "exhausted" | "stunned" | "empowered",
): boolean {
  if ((meta as { [k: string]: unknown } | undefined)?.[key] === true) {
    return true;
  }
  return (meta as { __flags?: Record<string, boolean> } | undefined)?.__flags?.[key] === true;
}

/**
 * Evaluate a single target-descriptor filter against a card (rule 355.8).
 * Unknown filter shapes pass through (return true) so newly-emitted parser
 * filters degrade to the previous "match any" behaviour rather than silently
 * emptying the target set.
 */
function isTokenCard(cardId: string, def: unknown): boolean {
  return (
    getGlobalCardRegistry().isToken(cardId) ||
    (def as { isToken?: boolean; id?: string } | undefined)?.isToken === true
  );
}

/**
 * rule 341 / 316.8 — a card is "in a showdown" while it sits at a battlefield
 * that has an active showdown on the showdown stack.
 */
function isAtShowdownBattlefield(cardId: string, ctx: TargetResolverContext): boolean {
  const stack =
    (
      ctx.draft as {
        interaction?: { showdownStack?: readonly { active?: boolean; battlefieldId?: string }[] };
      }
    ).interaction?.showdownStack ?? [];
  const live = stack.filter((s) => s?.active !== false && s?.battlefieldId);
  if (live.length === 0) {
    return false;
  }
  const zone = ctx.zones.getCardZone?.(cardId as CoreCardId) as string | undefined;
  if (typeof zone !== "string" || !zone.startsWith("battlefield-")) {
    return false;
  }
  const bfId = zone.slice("battlefield-".length);
  return live.some((s) => s.battlefieldId === bfId);
}

function matchesFilter(cardId: string, filter: TargetFilter, ctx: TargetResolverContext): boolean {
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId);
  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as Partial<RiftboundCardMeta> | undefined;

  // Parser also emits `{ state: "attacking" }` — normalise to the string form.
  const state =
    typeof filter === "string"
      ? filter
      : typeof filter.state === "string"
        ? (filter.state as string)
        : undefined;

  if (state !== undefined) {
    switch (state) {
      case "attacking":
        return meta?.combatRole === "attacker";
      case "defending":
        return meta?.combatRole === "defender";
      // rule 740.2.c: "in combat" = has a combat designation (attacker or defender)
      case "in-combat":
        return meta?.combatRole === "attacker" || meta?.combatRole === "defender";
      // rule 341 / 316.8 — "in a showdown" = at a battlefield where a showdown
      // is ongoing (combat or not). A unit in base, or at a quiet battlefield,
      // is never in a showdown.
      case "in-showdown":
        return isAtShowdownBattlefield(cardId, ctx);
      case "mighty":
        return effectiveMight(def, meta) >= MIGHTY_THRESHOLD;
      case "damaged":
        return (meta?.damage ?? 0) > 0;
      case "stunned":
        return metaFlag(meta, "stunned");
      // rule 442.1.a — "a unit that's [Empowered]"
      case "empowered":
        return metaFlag(meta, "empowered");
      case "not-empowered":
        return !metaFlag(meta, "empowered");
      case "buffed":
        return meta?.buffed === true;
      case "ready":
        return !metaFlag(meta, "exhausted");
      case "exhausted":
        return metaFlag(meta, "exhausted");
      case "equipped":
        return (meta?.equippedWith?.length ?? 0) > 0;
      case "attached":
        return meta?.attachedTo !== undefined;
      case "detached":
        return meta?.attachedTo === undefined;
      case "facedown":
        return meta?.hidden === true;
      // rule 109.2: a token is a card-like object created by an effect; it is
      // never a printed card. Instances are minted with a `token-` id prefix.
      case "token":
        return isTokenCard(cardId, def);
      case "non-token":
        return !isTokenCard(cardId, def);
      default:
        return true;
    }
  }

  if (typeof filter !== "object") {
    return true;
  }

  // rule 387 / 359.3.e.14 — a reflexive "… of THEM" is linked to the objects the
  // main instruction produced; the queued item names them by id.
  const idIn = (filter as { idIn?: readonly string[] }).idIn;
  if (Array.isArray(idIn)) {
    return idIn.includes(cardId);
  }

  // rule 387 (ogn-258-298) — a reflexive body anchored at the main
  // instruction's result ("ANOTHER enemy unit at ITS destination") freezes that
  // anchor when the item is queued: `idNotIn` drops the produced object itself,
  // `zoneIn` pins the zone it ended up in so a later board scan can't wander.
  const idNotIn = (filter as { idNotIn?: readonly string[] }).idNotIn;
  if (Array.isArray(idNotIn) && idNotIn.includes(cardId)) {
    return false;
  }
  const zoneIn = (filter as { zoneIn?: readonly string[] }).zoneIn;
  if (Array.isArray(zoneIn) && !zoneIn.includes(ctx.zones.getCardZone(cardId as CoreCardId) ?? "")) {
    return false;
  }

  // rule 359.3.f.2 (unl-105-219 Imposing Challenger, unl-057-219 Alpha
  // Wildclaw) — "with less Might than me": compared against the SOURCE's Might
  // as it reads when the instruction executes; equal Might is not less.
  if ((filter as { mightLessThanSelf?: boolean }).mightLessThanSelf === true) {
    const srcId = ctx.sourceCardId;
    if (srcId === undefined) {
      return true;
    }
    const srcMeta = ctx.cards.getCardMeta?.(srcId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    // rule 719 — Assault/Shield are part of the CURRENT Might for this
    // comparison, so an Empowered Ambessa attacking reads 7, not 5.
    const srcMight =
      effectiveMight(registry.get(srcId), srcMeta) + combatRoleMightBonus(srcId, srcMeta);
    return effectiveMight(def, meta) + combatRoleMightBonus(cardId, meta) < srcMight;
  }
  // rule 206 (ven-080-166 Noxian Demolitionist) — "with Energy cost no more
  // than my Might": the ceiling is the SOURCE's Might as it reads when the
  // instruction executes, and "no more than" makes cost == Might legal.
  if ((filter as { energyCostAtMostSelfMight?: boolean }).energyCostAtMostSelfMight === true) {
    const srcId = ctx.sourceCardId;
    if (srcId === undefined) {
      return true;
    }
    const srcMight = effectiveMight(
      registry.get(srcId),
      ctx.cards.getCardMeta?.(srcId as CoreCardId) as Partial<RiftboundCardMeta> | undefined,
    );
    return registry.getEnergyCost(cardId) <= srcMight;
  }
  // rule-id: ven-154-166 (rule 355.8 / 359.3.e) — "with less Might than it":
  // compared against the caster-chosen REFERENCE unit's current Might; equal
  // Might is not less. With no reference pinned (legality probes) every
  // candidate stays in the pool.
  if ((filter as { mightLessThanReference?: boolean }).mightLessThanReference === true) {
    return ctx.referenceMight === undefined || effectiveMight(def, meta) < ctx.referenceMight;
  }
  if ("might" in filter) {
    // rule 719 / 807.1.c (ogn-169-298 Gust) — a "with N [Might] or less"
    // requirement reads the unit's CURRENT Might, which includes the
    // combat-role bonus: an attacking Assault 3 unit is out of range from the
    // moment it is designated Attacker, before anyone gets a spell window.
    return matchesComparison(
      effectiveMight(def, meta) + combatRoleMightBonus(cardId, meta),
      filter.might,
    );
  }
  // rule 206 / rule-id: ven-080-166 — "with Energy cost no more than my Might":
  // the ceiling is the SOURCE's Might as it reads when the ability resolves,
  // compared against the candidate's PRINTED Energy cost.
  if ((filter as { energyCostAtMostSelfMight?: boolean }).energyCostAtMostSelfMight === true) {
    const srcId = ctx.sourceCardId;
    if (srcId === undefined) {
      return true;
    }
    const srcMight = effectiveMight(
      registry.get(srcId),
      ctx.cards.getCardMeta?.(srcId as CoreCardId) as Partial<RiftboundCardMeta> | undefined,
    );
    return registry.getEnergyCost(cardId) <= srcMight;
  }
  // rule 206: "costing no more than [3] and no more than [rainbow]" compares
  // the PRINTED cost, Energy and Power as two independent comparisons.
  if ("energyCost" in filter || "powerCost" in filter) {
    return matchesPrintedCostFilter(cardId, filter);
  }
  // rule 355.10 — "a friendly unit without [Temporary]": printed OR granted
  // copies of the keyword both disqualify a candidate.
  if ("excludeKeyword" in filter && typeof filter.excludeKeyword === "string") {
    const kw = filter.excludeKeyword;
    if (registry.hasKeyword(cardId, kw)) {
      return false;
    }
    return !(meta?.grantedKeywords?.some((gk) => gk.keyword === kw) ?? false);
  }
  if ("keyword" in filter && typeof filter.keyword === "string") {
    if (registry.hasKeyword(cardId, filter.keyword)) {
      return true;
    }
    return meta?.grantedKeywords?.some((gk) => gk.keyword === filter.keyword) ?? false;
  }
  if ("tag" in filter && typeof filter.tag === "string") {
    const tags = (def as { tags?: string[] } | undefined)?.tags;
    // rule 762 (unl-138-219 The List): "the named tag" is a placeholder that
    // resolves to the tag the source's controller named as it was played.
    if (filter.tag === "named") {
      const named = ctx.cards.getCardMeta?.(ctx.sourceCardId as CoreCardId)?.namedTag;
      if (typeof named !== "string" || named === "") return false;
      return hasEffectiveTag(tags, meta, named);
    }
    // rule 135.2.b.3 — a tag gained as the card was played counts as printed.
    return hasEffectiveTag(tags, meta, filter.tag);
  }
  // rule 355.8 (rule-id: unl-167-219) — "a Bird, Cat, Dog, or Poro" is one
  // filter holding a tag DISJUNCTION; carrying all of them is not required.
  if ("tag" in filter && Array.isArray(filter.tag)) {
    const tags = (def as { tags?: string[] } | undefined)?.tags;
    return (filter.tag as readonly string[]).some((t) => hasEffectiveTag(tags, meta, t));
  }
  // rule-id: ven-115-166 — "non-Dragon unit" excludes cards carrying the tag
  if ("excludeTag" in filter && typeof filter.excludeTag === "string") {
    const tags = (def as { tags?: string[] } | undefined)?.tags;
    return !hasEffectiveTag(tags, meta, filter.excludeTag);
  }
  if ("name" in filter && typeof filter.name === "string") {
    return def?.name === filter.name;
  }
  // rule-id: ven-015-166 — "enemy Calm unit" must match the unit's domain
  if ("domain" in filter && typeof filter.domain === "string") {
    return hasDomain(def, filter.domain);
  }
  // rule-id: ven-040-166 — "unit that's in combat with an enemy Fury unit or
  // that's being chosen by an enemy Fury spell": the candidate must share a
  // battlefield combat (both have a combatRole) with an opposing unit matching
  // `inCombatWith`, or be a bound target of a pending opposing spell matching
  // `orChosenBySpell`. "enemy" is relative to the resolving player.
  if ("inCombatWith" in filter && typeof filter.inCombatWith === "object" && filter.inCombatWith) {
    const spec = filter.inCombatWith as { controller?: string; domain?: string };
    const controllerOf = (id: string): string =>
      ctx.cards.getCardController?.(id as CoreCardId) ?? ctx.cards.getCardOwner(id as CoreCardId) ?? "";
    const matchesSide = (id: string, want: string | undefined): boolean => {
      if (!want || want === "any") return true;
      const c = controllerOf(id);
      if (want === "enemy") return c !== "" && c !== ctx.playerId && !areAllies(ctx.draft, ctx.playerId, c);
      if (want === "friendly") return c === ctx.playerId;
      return true;
    };
    const zone = ctx.zones.getCardZone(cardId as CoreCardId) ?? "";
    if (meta?.combatRole && zone.startsWith("battlefield-")) {
      const others = ctx.zones.getCardsInZone(zone as CoreZoneId).map((c) => c as string);
      const hit = others.some((oid) => {
        if (oid === cardId) return false;
        const odef = registry.get(oid);
        if (odef?.cardType !== "unit") return false;
        const ometa = ctx.cards.getCardMeta?.(oid as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        if (!ometa?.combatRole || ometa.combatRole === meta.combatRole) return false;
        if (!matchesSide(oid, spec.controller)) return false;
        return spec.domain === undefined || hasDomain(odef, spec.domain);
      });
      if (hit) return true;
    }
    const bySpell = (filter as { orChosenBySpell?: { controller?: string; domain?: string } })
      .orChosenBySpell;
    if (bySpell && typeof bySpell === "object") {
      const items = ctx.draft.interaction?.chain?.items ?? [];
      return items.some((item) => {
        if (item.type !== "spell" || item.countered) return false;
        if (!(item.targets ?? []).includes(cardId)) return false;
        const c = item.controller;
        if (bySpell.controller === "enemy") {
          if (!c || c === ctx.playerId || areAllies(ctx.draft, ctx.playerId, c)) return false;
        } else if (bySpell.controller === "friendly" && c !== ctx.playerId) {
          return false;
        }
        return bySpell.domain === undefined || hasDomain(registry.get(item.cardId), bySpell.domain);
      });
    }
    return false;
  }

  return true;
}

function hasDomain(def: unknown, want: string): boolean {
  const raw = (def as { domain?: string | string[] } | undefined)?.domain;
  const domains = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const w = want.toLowerCase();
  return domains.some((d) => d.toLowerCase() === w);
}

/**
 * rule 719 — Assault N counts only while the unit is an attacker and Shield N
 * only while it defends. Mirrors `getCardEffectiveMight`'s role layer without
 * importing the moves layer.
 */
export function combatRoleMightBonus(
  cardId: string,
  meta: Partial<RiftboundCardMeta> | undefined,
): number {
  const role = (meta as { combatRole?: string } | undefined)?.combatRole;
  if (role !== "attacker" && role !== "defender") {
    return 0;
  }
  const keyword = role === "attacker" ? "Assault" : "Shield";
  const def = getGlobalCardRegistry().get(cardId);
  let bonus = 0;
  for (const ability of def?.abilities ?? []) {
    if (ability.type === "keyword" && ability.keyword === keyword) {
      bonus += (ability as { value?: number }).value ?? 1;
    }
  }
  if (bonus === 0) {
    bonus += (def?.keywords ?? []).filter((k) => k === keyword).length;
  }
  for (const granted of meta?.grantedKeywords ?? []) {
    if (granted.keyword === keyword) {
      bonus += granted.value ?? 1;
    }
  }
  return bonus;
}

function effectiveMight(
  def: { might?: number } | undefined,
  meta: Partial<RiftboundCardMeta> | undefined,
): number {
  // rule 323.5 — a set base Might replaces the printed one.
  const base = meta?.baseMightOverride ?? def?.might ?? 0;
  const buff = (meta?.buffed ? 1 : 0) + (meta?.extraBuffs ?? 0);
  // rule 718.4: a Might comparison reads the CURRENT value, which includes the
  // bonus from every attached Equipment — not just buffs and this-turn modifiers.
  let equipBonus = 0;
  if (meta?.equippedWith?.length) {
    const registry = getGlobalCardRegistry();
    for (const equipId of meta.equippedWith) {
      equipBonus += registry.getMightBonus(equipId as string);
    }
  }
  return Math.max(
    0,
    base + buff + (meta?.mightModifier ?? 0) + (meta?.staticMightBonus ?? 0) + equipBonus,
  );
}

/**
 * rule 206: a printed-cost comparison (`{energyCost}` / `{powerCost}`). Power
 * is compared as a pip count, so "no more than [rainbow]" is `{lte: 1}`.
 * Usable for cards outside the board zones the resolver scans (trash, hand).
 */
export function matchesPrintedCostFilter(cardId: string, filter: unknown): boolean {
  if (typeof filter !== "object" || filter === null) {
    return true;
  }
  const f = filter as { energyCost?: unknown; powerCost?: unknown };
  const registry = getGlobalCardRegistry();
  if ("energyCost" in f && !matchesComparison(registry.getEnergyCost(cardId), f.energyCost)) {
    return false;
  }
  if ("powerCost" in f && !matchesComparison(registry.getPowerCost(cardId).length, f.powerCost)) {
    return false;
  }
  return true;
}

function matchesComparison(value: number, cmp: unknown): boolean {
  if (typeof cmp !== "object" || cmp === null) {
    return true;
  }
  const c = cmp as { eq?: number; lt?: number; lte?: number; gt?: number; gte?: number };
  if (c.eq !== undefined && value !== c.eq) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  return true;
}
