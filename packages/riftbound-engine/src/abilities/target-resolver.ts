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
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

/**
 * Simplified target descriptor (from parser output).
 */
export interface TargetDescriptor {
  readonly type: string;
  /** rule-id: ven-150-166 — any-of card-type list ("units, gear, and/or runes"). */
  readonly types?: readonly string[];
  readonly controller?: "friendly" | "enemy" | "any";
  readonly location?: string;
  readonly filter?: TargetFilter | TargetFilter[];
  readonly quantity?: number | "all";
  /** Parser sets this for "another"/"other" wording. */
  readonly excludeSelf?: boolean;
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
  if (!isAllAtOneBattlefield(target) || boundTargets?.length !== 1) {
    return undefined;
  }
  const bfId = boundTargets[0] as string;
  return draft.battlefields?.[bfId] ? `battlefield-${bfId}` : undefined;
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
    const all = ctx.zones.getCardsInZone("battlefieldRow" as CoreZoneId).map((c) => c as string);
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

  // Collect candidate cards from the board
  const candidates = getBoardCardIds(ctx);

  // Filter by card type
  const registry = getGlobalCardRegistry();
  let filtered = candidates;

  if (target.types && target.types.length > 0) {
    // rule-id: ven-150-166 — "units, gear, and/or runes": one mixed pool over
    // an any-of type list. Runes live in each player's runePool, not on the
    // board, so pull them in when the list names them.
    const want = new Set(target.types);
    const pool = want.has("rune") ? [...candidates, ...getRunePoolCardIds(ctx)] : candidates;
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
  } else if (target.type === "permanent") {
    filtered = filtered.filter((id) => {
      const def = registry.get(id);
      return def?.cardType === "unit" || def?.cardType === "gear" || def?.cardType === "equipment";
    });
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

  // Filter by location
  if (target.location === "here" && ctx.sourceZone) {
    // Rule 350.1 / 383.2.c: on a battlefield card's own ability, "here" means
    // the per-battlefield unit zone (battlefield-<cardId>), not battlefieldRow.
    const hereZone =
      ctx.sourceZone === "battlefieldRow" ? `battlefield-${ctx.sourceCardId}` : ctx.sourceZone;
    filtered = filtered.filter((id) => {
      const zone = ctx.zones.getCardZone(id as CoreCardId);
      return zone === hereZone;
    });
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

  // rule-id: ven-031-166 — "can't be chosen by enemy spells and abilities":
  // drop opposing Untargetable cards whenever this resolution is a CHOICE
  // (any non-"all" quantity, or an explicit choosing-pool enumeration).
  // Programmatic `quantity:"all"` selections ("all enemy units") don't choose.
  if (target.quantity !== "all" || ctx.choosing) {
    filtered = filtered.filter(
      (id) => !(controllerOf(id) !== ctx.playerId && isUntargetable(id, ctx)),
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

/** rule-id: ven-150-166 — rune cards in every player's rune pool. */
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
 * rule-id: ven-031-166 / sfd-105-221 — a card "can't be chosen by enemy spells
 * and abilities" when it carries the (virtual) Untargetable keyword, either
 * printed/static or granted for a duration via `grant-keyword`.
 */
export function isUntargetable(cardId: string, ctx: Pick<TargetResolverContext, "cards">): boolean {
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
  if (
    abilities.some(
      (a) =>
        a.type === "static" &&
        a.condition === undefined &&
        a.effect?.type === "grant-keyword" &&
        a.effect.keyword === "Untargetable" &&
        (a.effect.target === undefined || a.effect.target === "self"),
    )
  ) {
    return true;
  }
  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  return meta?.grantedKeywords?.some((gk) => gk.keyword === "Untargetable") ?? false;
}

/**
 * Evaluate a single target-descriptor filter against a card (rule 355.8).
 * Unknown filter shapes pass through (return true) so newly-emitted parser
 * filters degrade to the previous "match any" behaviour rather than silently
 * emptying the target set.
 */
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
      case "mighty":
        return effectiveMight(def, meta) >= MIGHTY_THRESHOLD;
      case "damaged":
        return (meta?.damage ?? 0) > 0;
      case "stunned":
        return meta?.stunned === true;
      case "buffed":
        return meta?.buffed === true;
      case "ready":
        return meta?.exhausted !== true;
      case "exhausted":
        return meta?.exhausted === true;
      case "equipped":
        return (meta?.equippedWith?.length ?? 0) > 0;
      case "attached":
        return meta?.attachedTo !== undefined;
      case "detached":
        return meta?.attachedTo === undefined;
      case "facedown":
        return meta?.hidden === true;
      default:
        return true;
    }
  }

  if (typeof filter !== "object") {
    return true;
  }

  if ("might" in filter) {
    return matchesComparison(effectiveMight(def, meta), filter.might);
  }
  if ("keyword" in filter && typeof filter.keyword === "string") {
    if (registry.hasKeyword(cardId, filter.keyword)) {
      return true;
    }
    return meta?.grantedKeywords?.some((gk) => gk.keyword === filter.keyword) ?? false;
  }
  if ("tag" in filter && typeof filter.tag === "string") {
    const tags = (def as { tags?: string[] } | undefined)?.tags;
    return tags?.includes(filter.tag) ?? false;
  }
  // rule-id: ven-115-166 — "non-Dragon unit" excludes cards carrying the tag
  if ("excludeTag" in filter && typeof filter.excludeTag === "string") {
    const tags = (def as { tags?: string[] } | undefined)?.tags;
    const ex = filter.excludeTag.toLowerCase();
    return !(tags ?? []).some((t) => t.toLowerCase() === ex);
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

function effectiveMight(
  def: { might?: number } | undefined,
  meta: Partial<RiftboundCardMeta> | undefined,
): number {
  const base = def?.might ?? 0;
  const buff = (meta?.buffed ? 1 : 0) + (meta?.extraBuffs ?? 0);
  return Math.max(0, base + buff + (meta?.mightModifier ?? 0) + (meta?.staticMightBonus ?? 0));
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
