/**
 * Play-cost and enter-state helpers shared by the play* moves
 * (split from cards.ts). Leaf module: must not import move defs.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type {
  PlayerId,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../../types";
import { type EffectContext, executeEffect } from "../../../abilities/effect-executor";
import { addToChain, createInteractionState } from "../../../chain";
import { evaluateLegionCondition } from "../../../abilities/legion-conditions";
import { hasEffectiveTag } from "../../../abilities/card-tags";
import { evaluateWhileLevel } from "../../../abilities/xp-conditions";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { countDistinctTagsAmongUnits } from "../../../operations/distinct-tags";
import { scoreWithinConditionMet } from "../../../operations/score-within";
import { pointsGainedThisTurn } from "../../../operations/points";
import {
  type CostReductionContext,
  type StaticCostReduction,
  applyStaticCostReduction,
  computeGrantedSpellRepeatCost,
  computeOptionalAdditionalCostFlexReduction,
  computeStaticCostIncrease,
  computeStaticCostReduction,
  computeStaticRepeatCostReduction,
  decodeCostAmount,
  reducePowerCost,
} from "../../../operations/static-cost-reduction";
import { getBattlefieldZoneId, isBattlefieldZone } from "../../../zones/zone-configs";

/**
 * Check whether a card carries a static ability whose effect has the given
 * `type`. Used for enter-state modifiers such as `enter-ready` (rule 143.4
 * override — unit enters ready instead of exhausted) and `enters-exhausted`
 * (gear that enters tapped, e.g. Honeyfruit unl-049-219).
 */
export function hasStaticEffect(cardId: string, effectType: string): boolean {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  for (const ability of abilities) {
    if (ability?.type !== "static") {
      continue;
    }
    const effect = (ability as { effect?: { type?: string } }).effect;
    if (flattenStaticEffects(effect).some((e) => e.type === effectType)) {
      return true;
    }
  }
  return false;
}

/**
 * A static ability may bundle several effects under a `sequence` wrapper
 * (rule-id: unl-016-219 — "I have +1 [Might] and enter ready"). Enter-state
 * checks must look inside it, the way the static-ability recalculation does.
 */
function flattenStaticEffects(effect: unknown): { type?: string }[] {
  const e = effect as { type?: string; effects?: unknown[] } | undefined;
  if (!e) {
    return [];
  }
  if (e.type === "sequence" && Array.isArray(e.effects)) {
    return e.effects.flatMap((inner) => flattenStaticEffects(inner));
  }
  return [e];
}

/**
 * rule-id: ven-091-166 — a static "I enter ready" may carry a play-time
 * condition (e.g. "If your score is not within 3 points of the Victory
 * Score"). Returns true only if some static enter-ready ability's condition
 * holds. Conditions this helper cannot evaluate keep the legacy
 * unconditional behaviour.
 */
export function staticEnterReadyApplies(
  cardId: string,
  state: RiftboundGameState,
  playerId: string,
  zones?: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  cards?: EnterReadyCardAccessor,
  entryZone?: string,
): boolean {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  for (const ability of abilities) {
    if (ability?.type !== "static") {
      continue;
    }
    const { effect, condition } = ability as {
      effect?: { type?: string };
      condition?: Record<string, unknown>;
    };
    // rule 369.3 (rule-id: unl-035-219) — the entering unit's own "I enter
    // ready" may be authored as `enter-ready` or as a SELF grant of the
    // virtual `EntersReady` keyword. A static on a card still in hand is never
    // recalculated, so the play path must read both shapes here.
    if (
      !flattenStaticEffects(effect).some(
        (e) =>
          e.type === "enter-ready" ||
          (e.type === "grant-keyword" &&
            (e as { keyword?: string }).keyword === "EntersReady" &&
            (e as { target?: unknown }).target === "self"),
      )
    ) {
      continue;
    }
    if (
      !condition ||
      evaluateEnterReadyCondition(condition, state, playerId, cardId, zones, cards, entryZone) !==
        false
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Card text spells small counts as words ("two or more other units"); the
 * parser keeps them verbatim. Returns undefined for a count this module cannot
 * read, so the caller can leave the gate unknown rather than guessing.
 */
const COUNT_WORDS: Record<string, number> = {
  eight: 8,
  five: 5,
  four: 4,
  nine: 9,
  one: 1,
  seven: 7,
  six: 6,
  ten: 10,
  three: 3,
  two: 2,
  zero: 0,
};

function countWord(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const word = COUNT_WORDS[value.trim().toLowerCase()];
    if (word !== undefined) {
      return word;
    }
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return undefined;
}

/** Card-meta reader for play-time gates that read board statuses. */
type EnterReadyCardAccessor = {
  getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
};

/**
 * rule 423.1 — board statuses a play-time gate can decide from card meta
 * alone. A filter not listed here leaves the gate "unknown".
 */
const STATUS_META_FILTERS: Record<
  string,
  ((meta: Record<string, unknown> | undefined) => boolean) | undefined
> = {
  damaged: (meta) => ((meta?.damage as number | undefined) ?? 0) > 0,
  // rule 827 (rule-id: ven-059-166) — "something that's [Empowered]".
  empowered: (meta) => meta?.empowered === true,
  exhausted: (meta) => meta?.exhausted === true,
  ready: (meta) => meta?.exhausted !== true,
  stunned: (meta) => meta?.stunned === true,
};

function evaluateEnterReadyCondition(
  condition: Record<string, unknown>,
  state: RiftboundGameState,
  playerId: string,
  cardId?: string,
  zones?: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  cards?: EnterReadyCardAccessor,
  entryZone?: string,
): boolean | undefined {
  switch (condition.type) {
    // rule 143.4 (rule-id: unl-194-219 Shadow) — "If you play me to a
    // battlefield, I enter ready": the clause is conditional on where the unit
    // actually enters; played to the base it enters exhausted like any unit.
    case "played-to-battlefield": {
      if (entryZone === undefined) {
        return undefined;
      }
      return isBattlefieldZone(entryZone);
    }
    // rule 419.1 (rule-id: ven-013-166) — "if you have a card with my name in
    // your trash": evaluated as the unit enters, so a card played OUT of the
    // trash has already left it and never counts itself.
    case "name-in-trash": {
      if (!zones || !cardId) {
        return undefined;
      }
      const registry = getGlobalCardRegistry();
      const name = registry.get(cardId)?.name;
      if (!name) {
        return undefined;
      }
      return zones
        .getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId)
        .some((id) => id !== cardId && registry.get(id as string)?.name === name);
    }
    // rule 143.4 / 364.3.a (rule-id: sfd-027-221) — "If you have two or fewer
    // cards in your hand, I enter ready": the count is taken as the unit
    // enters, by which time it has already left the hand.
    case "has-at-most":
    case "has-at-least": {
      // Without zone access the hand cannot be counted; report "does not
      // hold" rather than falling back to an unconditional entry.
      if (!zones) {
        return false;
      }
      const target = (condition.target ?? {}) as { location?: string; controller?: string };
      if (target.location !== "hand") {
        return undefined;
      }
      const whose =
        target.controller === "enemy"
          ? Object.keys(state.players).find((pid) => pid !== playerId)
          : playerId;
      if (!whose) {
        return undefined;
      }
      const n = zones
        .getCardsInZone("hand" as CoreZoneId, whose as CorePlayerId)
        .filter((id) => id !== cardId).length;
      const limit = (condition.count as number | undefined) ?? 0;
      return condition.type === "has-at-most" ? n <= limit : n >= limit;
    }
    case "not": {
      const inner = evaluateEnterReadyCondition(
        (condition.condition ?? {}) as Record<string, unknown>,
        state,
        playerId,
        cardId,
        zones,
        cards,
        entryZone,
      );
      return inner === undefined ? undefined : !inner;
    }
    case "score-within":
      return scoreWithinConditionMet(
        condition as { points?: number; range?: number; whose?: string },
        state,
        playerId,
      );
    // rule-id: ogn-144-298 — "If an enemy unit has died this turn": read the
    // per-player turn event log (`fireTriggers` records deaths).
    case "this-turn": {
      const eventType = condition.event as string;
      const events = state.turnEvents?.[playerId] ?? [];
      const n = events.filter((e) => e === eventType).length;
      const cmp = condition.count as { gte?: number; eq?: number; lte?: number } | undefined;
      if (cmp?.eq !== undefined) return n === cmp.eq;
      if (cmp?.lte !== undefined) return n <= cmp.lte && n >= (cmp.gte ?? 0);
      return n >= (cmp?.gte ?? 1);
    }
    // rule 143.4 / rule-id: ogn-035-298 — "If an opponent controls a
    // battlefield, I enter ready": the parser emits the battlefield subject as
    // `{type:"card"|"battlefield", controller:"enemy"}` with no filter.
    case "opponent-controls": {
      const target = (condition.target ?? {}) as { type?: string; filter?: unknown };
      if (target.type === "battlefield" || (target.type === "card" && target.filter === undefined)) {
        return Object.values(state.battlefields ?? {}).some(
          (bf) => typeof bf?.controller === "string" && bf.controller !== playerId,
        );
      }
      // rule 108.2 / 364.3.a (rule-id: unl-035-219) — "if an opponent controls
      // a stunned unit": scan every OPPONENT's board (base + battlefields) for
      // a permanent matching the subject's type and status filters. Your own
      // stunned units are never an opponent's, and where the enemy's stands
      // does not matter.
      if (target.type === "unit" || target.type === "card") {
        if (!zones) {
          return undefined;
        }
        const filters = (
          target.filter === undefined
            ? []
            : Array.isArray(target.filter)
              ? target.filter
              : [target.filter]
        ).filter((f): f is string => typeof f === "string");
        // Status filters read card meta; without it the gate is unknown rather
        // than a false negative.
        if (filters.length > 0 && (!cards || filters.some((f) => !STATUS_META_FILTERS[f]))) {
          return undefined;
        }
        const registry = getGlobalCardRegistry();
        const boardZones = [
          "base",
          ...Object.keys(state.battlefields ?? {}).map((bfId) => getBattlefieldZoneId(bfId)),
        ];
        for (const pid of Object.keys(state.players).filter((p) => p !== playerId)) {
          for (const zone of boardZones) {
            for (const id of zones.getCardsInZone(zone as CoreZoneId, pid as CorePlayerId)) {
              if (target.type === "unit" && registry.getCardType(id as string) !== "unit") {
                continue;
              }
              const meta = cards?.getCardMeta(id as CoreCardId) as
                | Record<string, unknown>
                | undefined;
              if (filters.every((f) => STATUS_META_FILTERS[f]?.(meta) === true)) {
                return true;
              }
            }
          }
        }
        return false;
      }
      return undefined;
    }
    // rule 728 / [Level N] (rule-id: unl-151-219) — "[Level 3][>] I enter
    // ready": the gate holds only while the controller has that much XP.
    case "while-level": {
      return evaluateWhileLevel(state, playerId as PlayerId, (condition.threshold as number) ?? 0);
    }
    // rule 143.4 (rule-id: sfd-071-221) — "I enter ready if you control
    // another Mech": count board permanents (base + battlefields) on the named
    // side matching the type/tag filter; `excludeSelf` never counts the
    // entering unit itself.
    case "control": {
      if (!zones) {
        return false;
      }
      const t = (condition.target ?? {}) as {
        type?: string;
        controller?: string;
        excludeSelf?: boolean;
        filter?: unknown;
        quantity?: number | { atLeast?: number };
      };
      const min =
        typeof t.quantity === "number"
          ? t.quantity
          : typeof t.quantity === "object" && typeof t.quantity?.atLeast === "number"
            ? t.quantity.atLeast
            : 1;
      const owners =
        t.controller === "enemy"
          ? Object.keys(state.players).filter((pid) => pid !== playerId)
          : [playerId];
      const boardZones = [
        "base",
        ...Object.keys(state.battlefields ?? {}).map((bfId) => getBattlefieldZoneId(bfId)),
      ];
      const filters = t.filter === undefined ? [] : Array.isArray(t.filter) ? t.filter : [t.filter];
      const registry = getGlobalCardRegistry();
      let count = 0;
      for (const owner of owners) {
        for (const zone of boardZones) {
          for (const id of zones.getCardsInZone(zone as CoreZoneId, owner as CorePlayerId)) {
            if (t.excludeSelf && (id as string) === cardId) {
              continue;
            }
            const def = registry.get(id as string) as
              | { cardType?: string; tags?: readonly string[] }
              | undefined;
            if ((t.type === undefined || t.type === "unit") && def?.cardType !== "unit") {
              continue;
            }
            if (t.type === "gear" && def?.cardType !== "gear" && def?.cardType !== "equipment") {
              continue;
            }
            // rule 135.2 / 136.2 (rule-id: sfd-073-221) — a tag conferred by a
            // continuous effect ("I am a Mech." on an attached Equipment) counts
            // for "if you control a Mech" exactly like a printed one.
            const tagMeta = cards?.getCardMeta(id as CoreCardId);
            const tagOk = filters.every((f) => {
              const tag = (f as { tag?: unknown } | null)?.tag;
              if (typeof tag !== "string") return true;
              return hasEffectiveTag(def?.tags, tagMeta, tag);
            });
            if (!tagOk) {
              continue;
            }
            // rule 423.1 (rule-id: ven-059-166) — a string filter names a board
            // status ("empowered", "stunned", …) read from card meta. One this
            // module cannot decide never counts, so an unmodellable gate stays
            // shut rather than discounting unconditionally.
            const statusOk = filters.every((f) => {
              if (typeof f !== "string") return true;
              const probe = STATUS_META_FILTERS[f];
              if (!probe) return false;
              return probe(cards?.getCardMeta(id as CoreCardId) as Record<string, unknown> | undefined);
            });
            if (!statusOk) {
              continue;
            }
            count++;
          }
        }
      }
      return count >= min;
    }
    // rule 190.4 / 356.4 (rule-id: ven-119-166) — "if you control a battlefield
    // with exactly N units there": read at play time, per battlefield THIS
    // player controls, counting every unit standing there. Any one qualifying
    // battlefield satisfies the gate; the card being played is never counted
    // (its cost is locked before it arrives).
    case "control-battlefield-with-units": {
      if (!zones) {
        return false;
      }
      const want = (condition.count as number | undefined) ?? 0;
      const registry = getGlobalCardRegistry();
      for (const bfId of Object.keys(state.battlefields ?? {})) {
        if (state.battlefields?.[bfId]?.controller !== playerId) {
          continue;
        }
        const zoneId = getBattlefieldZoneId(bfId) as CoreZoneId;
        let n = 0;
        for (const pid of Object.keys(state.players ?? {})) {
          for (const id of zones.getCardsInZone(zoneId, pid as CorePlayerId)) {
            if ((id as string) === cardId) {
              continue;
            }
            if (registry.getCardType(id as string) === "unit") {
              n++;
            }
          }
        }
        if (n === want) {
          return true;
        }
      }
      return false;
    }
    // rule 143.4 (rule-id: sfd-176-221) — "I enter ready if you have N or more
    // other units in your base": counted as the unit enters, over YOUR base
    // only. The entering unit never counts itself, units at battlefields and
    // non-units (gear) in base don't count, and the opponent's base is
    // irrelevant.
    case "unit-count": {
      if (!zones) {
        return false;
      }
      const want = countWord(condition.count);
      if (want === undefined) {
        return undefined;
      }
      const zone = (condition.location as string | undefined) ?? "base";
      if (zone !== "base") {
        return undefined;
      }
      const registry = getGlobalCardRegistry();
      const n = zones
        .getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId)
        .filter((id) => (id as string) !== cardId && registry.getCardType(id as string) === "unit")
        .length;
      return n >= want;
    }
    // rule 143.4 (rule-id: unl-037-219) — the parser leaves gates it cannot
    // model as `{type:"custom", text}`. A gate that cannot be shown to HOLD
    // must not grant ready: units enter exhausted by default.
    case "custom": {
      const text = String(condition.text ?? "").toLowerCase();
      const events = state.turnEvents?.[playerId] ?? [];
      if (/friendly unit died during your beginning phase/.test(text)) {
        return events.includes("friendly-died-in-beginning");
      }
      // rule-id: unl-008-219 — "if a unit died this turn" (either side).
      if (/^if a unit died this turn$/.test(text)) {
        return events.includes("friendly-died") || events.includes("enemy-died");
      }
      return false;
    }
    default: {
      return undefined;
    }
  }
}

/**
 * rule 466 / rule-id: ogn-047-298 — the played card's OWN static
 * "If CONDITION, this costs [N] less" rider: a flat energy discount applied
 * at pay time when the play-time condition holds. Unscaled (no `scope`/`by`)
 * self cost-reductions without a condition, or with a condition this module
 * cannot evaluate, contribute 0 here.
 */
/**
 * rule 355.10.a (rule-id: unl-168-219) — does any card chosen as a target of
 * this play carry one of the named tags? `assumeChooseDiscount` stands in for
 * the answer at the enumeration gate, where nothing has been chosen yet.
 */
function chosenTargetHasTag(extras: CostExtras | undefined, wanted: readonly string[]): boolean {
  if (wanted.length === 0) {
    return false;
  }
  if (extras?.assumeChooseDiscount === true) {
    return true;
  }
  const registry = getGlobalCardRegistry();
  const chosen = [
    ...(extras?.targets ?? []),
    ...(extras?.chosenTargetId ? [extras.chosenTargetId] : []),
  ];
  return chosen.some((id) =>
    ((registry.get(id) as { tags?: readonly string[] } | undefined)?.tags ?? []).some((t) =>
      wanted.includes(t.toLowerCase()),
    ),
  );
}

function getSelfConditionalEnergyReduction(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras?: CostExtras,
): number {
  let total = 0;
  let instead = 0;
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    if (ability?.type !== "static") {
      continue;
    }
    const { effect, condition } = ability as {
      effect?: { type?: string; target?: unknown; scope?: unknown; by?: unknown; reduction?: unknown; amount?: unknown };
      condition?: Record<string, unknown>;
    };
    if (effect?.type !== "cost-reduction" || effect.target !== "self") {
      continue;
    }
    // rule 824 (rule-id: unl-059-219) — `scope:"instead"` is the stacking rule
    // of a [Level N] tier, not a "for each …" scaling scope: it must not divert
    // the tier to the scaled path, which would drop the discount entirely.
    if (
      (effect.scope !== undefined && effect.scope !== "instead") ||
      effect.by !== undefined ||
      !condition
    ) {
      continue;
    }
    // rule 356.4 / 355.10.a (rule-id: unl-168-219) — "This costs [2] less if you
    // choose a Bird, Cat, Dog, or Poro": the gate reads the TARGET chosen as the
    // card is played. Targets aren't picked yet at the enumeration gate, so the
    // discount is assumed there (`assumeChooseDiscount`) and the move's
    // condition re-checks it against the real targets.
    if ((condition as { type?: unknown }).type === "chooses-tag") {
      const wanted = ((condition as { tags?: readonly string[] }).tags ?? []).map((t) =>
        t.toLowerCase(),
      );
      if (!chosenTargetHasTag(extras, wanted)) {
        continue;
      }
      total += Math.max(0, decodeCostAmount(effect.reduction ?? effect.amount).energy);
      continue;
    }
    // rule 356.4 (rule-id: sfd-076-221) — board-reading gates such as "if you
    // control a Mech" need zone access; without it they cannot hold.
    if (
      evaluateEnterReadyCondition(condition, state, playerId, cardId, extras?.board?.zones, extras?.board?.cards) !== true
    ) {
      continue;
    }
    const energy = Math.max(0, decodeCostAmount(effect.reduction ?? effect.amount).energy);
    // rule 824 (rule-id: unl-091-219) — a tier worded "… less INSTEAD"
    // replaces the lower tiers' discount rather than stacking with it, so only
    // the largest active "instead" tier applies.
    if ((effect as { instead?: unknown }).instead === true) {
      instead = Math.max(instead, energy);
    } else {
      total += energy;
    }
  }
  return instead > 0 ? instead : total;
}

/**
 * rule 724 / rule-id: ogn-012-298 — the played card's OWN `[Legion] — I cost
 * [N] less` keyword: a flat self discount once its controller has already
 * played another card this turn (read before this play bumps the counter).
 */
function getSelfLegionEnergyReduction(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
): number {
  let total = 0;
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    if (ability?.type !== "keyword" || ability.keyword !== "Legion") {
      continue;
    }
    const effect = (ability as { effect?: { type?: string; target?: unknown; reduction?: unknown; amount?: unknown; by?: unknown } }).effect;
    if (effect?.type !== "cost-reduction" || (effect.target !== undefined && effect.target !== "self")) {
      continue;
    }
    if (!evaluateLegionCondition(state, playerId)) {
      continue;
    }
    total += Math.max(0, decodeCostAmount(effect.reduction ?? effect.amount ?? effect.by).energy);
  }
  return total;
}

/**
 * Read a static `play-restriction` effect's `allowedLocation` string
 * ("You may play me to …"). Returns undefined when the card has none.
 */
export function getPlayLocationPermission(cardId: string): string | undefined {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  for (const ability of abilities) {
    if (ability?.type !== "static") {
      continue;
    }
    const effect = (
      ability as { effect?: { type?: string; allowedLocation?: string; appliesTo?: string } }
    ).effect;
    if (effect?.type === "play-restriction" && !effect.appliesTo) {
      return effect.allowedLocation;
    }
  }
  return undefined;
}

/**
 * rule 355.2 (rule-id: sfd-216-221 Rockfall Path) — a Battlefield card may
 * forbid unit plays at its own location ("Units can't be played here").
 * Captured as a static self-grant of the virtual `NoUnitsPlayedHere` keyword;
 * the battlefield's instance id doubles as its card id in `battlefieldRow`.
 */
export function battlefieldForbidsUnitPlay(battlefieldId: string): boolean {
  const abilities = getGlobalCardRegistry().getAbilities(battlefieldId) ?? [];
  for (const ability of abilities) {
    if (ability?.type !== "static") {
      continue;
    }
    const effect = (ability as { effect?: { type?: string; keyword?: string; keywords?: readonly string[] } })
      .effect;
    if (effect?.type !== "grant-keyword" && effect?.type !== "grant-keywords") {
      continue;
    }
    if (effect.keyword === "NoUnitsPlayedHere" || effect.keywords?.includes("NoUnitsPlayedHere")) {
      return true;
    }
  }
  return false;
}

/**
 * rule 356.2 / 355.2 (rule-id: ven-157-166 Dragon Roost) — a Battlefield may
 * offer ANY player an OPTIONAL ADDITIONAL cost that redirects a matching play
 * to itself ("Any player may pay [rainbow][rainbow] as an additional cost to
 * play a Dragon. If they do, they play it to this battlefield."). Read off the
 * battlefield's own static; its instance id doubles as its card id.
 * Returns the extra pips when the redirect applies to `cardId`.
 */
export function battlefieldRedirectPowerFor(
  battlefieldId: string,
  cardId: string,
): readonly string[] | undefined {
  for (const ability of getGlobalCardRegistry().getAbilities(battlefieldId) ?? []) {
    if (ability?.type !== "static") {
      continue;
    }
    const effect = (
      ability as {
        effect?: {
          additionalCost?: { power?: readonly string[] };
          appliesTo?: { tag?: string };
          type?: string;
        };
      }
    ).effect;
    if (effect?.type !== "play-to-here-permission") {
      continue;
    }
    const power = effect.additionalCost?.power;
    if (!power?.length) {
      continue;
    }
    const tag = effect.appliesTo?.tag;
    if (tag) {
      // rule 763.1: the redirect is gated on the printed tag of the played card.
      const tags =
        (getGlobalCardRegistry().get(cardId) as { tags?: readonly string[] } | undefined)?.tags ?? [];
      if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
        continue;
      }
    }
    return power;
  }
  return undefined;
}

/**
 * rule 419.1 / rule-id: ven-022-166 — a permanent this player controls that
 * reads "You may play cards from your trash" extends the legal play zone: the
 * trash becomes a play-from zone for its controller. Recognised either as an
 * explicit `{type:"play-permission", from:"trash"}` static effect or from the
 * printed clause when the card's text is still unparsed (`raw`).
 */
export function hasPlayFromTrashGrant(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  playerId: string,
): boolean {
  const registry = getGlobalCardRegistry();
  const zoneIds = [
    "base",
    ...Object.keys(state.battlefields ?? {}).map((bfId) => getBattlefieldZoneId(bfId) as string),
  ];
  for (const zoneId of zoneIds) {
    for (const cardId of zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)) {
      for (const ability of registry.getAbilities(cardId as string) ?? []) {
        const effect = (ability as { effect?: { type?: string; from?: string; text?: string } })
          ?.effect;
        if (effect?.type === "play-permission" && effect.from === "trash") {
          return true;
        }
        if (
          typeof effect?.text === "string" &&
          /you may play cards from your trash/i.test(effect.text)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * rule 315.4 (rule-id: ven-022-166) — "Skip your Draw Phase": a permanent this
 * player controls removes their whole Draw Phase (no draw, and therefore no
 * Burn Out from an empty deck). It is one-sided: an opponent's Draw Phase is
 * untouched, and the Awaken/Beginning/Channel Phases still happen. Recognised
 * either as an explicit `{type:"skip-phase", phase:"draw"}` static effect or
 * from the printed clause while the card's text is still unparsed (`raw`).
 */
export function hasSkipDrawPhaseGrant(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  playerId: string,
): boolean {
  return hasSkipPhaseGrant(state, zones, playerId, "draw");
}

/**
 * rule 443.1.a / 443.1.a.2 — "Skip your <phase> Phase": the named phase is
 * replaced with nothing for that player, steps included (skipping the Beginning
 * Phase takes its Scoring Step with it, so no Hold is scored), and the skip
 * itself triggers nothing (443.2.a). One-sided, exactly like the Draw case.
 */
export function hasSkipPhaseGrant(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  playerId: string,
  phase: string,
): boolean {
  const registry = getGlobalCardRegistry();
  const printed = new RegExp(`skip your ${phase} phase`, "i");
  const zoneIds = [
    "base",
    ...Object.keys(state.battlefields ?? {}).map((bfId) => getBattlefieldZoneId(bfId) as string),
  ];
  for (const zoneId of zoneIds) {
    for (const cardId of zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)) {
      for (const ability of registry.getAbilities(cardId as string) ?? []) {
        const effect = (
          ability as { effect?: { type?: string; phase?: string; text?: string } }
        )?.effect;
        if (effect?.type === "skip-phase" && effect.phase === phase) {
          return true;
        }
        if (typeof effect?.text === "string" && printed.test(effect.text)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Rule ogn-193-298: a friendly unit on the board with static "Friendly units
 * may be played to open battlefields" (play-restriction with
 * `appliesTo: "friendly-units"`) extends the open-battlefield permission to
 * every unit its controller plays.
 */
export function hasFriendlyOpenBattlefieldGrant(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  playerId: string,
): boolean {
  const registry = getGlobalCardRegistry();
  const zoneIds = [
    "base",
    ...Object.keys(state.battlefields ?? {}).map((bfId) => getBattlefieldZoneId(bfId) as string),
  ];
  for (const zoneId of zoneIds) {
    for (const unitId of zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)) {
      for (const ability of registry.getAbilities(unitId as string) ?? []) {
        if (ability?.type !== "static") {
          continue;
        }
        const effect = (
          ability as { effect?: { type?: string; allowedLocation?: string; appliesTo?: string } }
        ).effect;
        if (
          effect?.type === "play-restriction" &&
          effect.appliesTo === "friendly-units" &&
          effect.allowedLocation === "an open battlefield"
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * rule 355.2 (rule-id: ogn-070-298 Mageseeker Warden): an ENEMY permanent at a
 * battlefield may carry a static `play-restriction` with
 * `appliesTo: "opponents"` — "opponents can only play units to their base".
 * Only battlefield zones are scanned, which is exactly the
 * `while-at-battlefield` condition such cards print.
 */
export function opponentsRestrictedToBase(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  playerId: string,
): boolean {
  const registry = getGlobalCardRegistry();
  for (const bfId of Object.keys(state.battlefields ?? {})) {
    const zoneId = getBattlefieldZoneId(bfId) as CoreZoneId;
    for (const otherId of Object.keys(state.players ?? {})) {
      if (otherId === playerId) {
        continue;
      }
      for (const cardId of zones.getCardsInZone(zoneId, otherId as CorePlayerId)) {
        for (const ability of registry.getAbilities(cardId as string) ?? []) {
          if (ability?.type !== "static") {
            continue;
          }
          const effect = (
            ability as { effect?: { type?: string; allowedLocation?: string; appliesTo?: string } }
          ).effect;
          if (
            effect?.type === "play-restriction" &&
            effect.appliesTo === "opponents" &&
            effect.allowedLocation === "their base"
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * rule 143.4 / 369.3 (rule-id: ogn-011-298 Magma Wurm): a card already on a
 * player's board may carry a static grant of the virtual `EntersReady`
 * keyword to other friendly units ("Other friendly units enter ready").
 * Static recalculation only stamps `grantedKeywords` after the unit is
 * already on the board exhausted, so the play path must consult these grants
 * up front — the same way `create-token` does via
 * `tokenEntersReadyFromStaticGrant`.
 */
export function boardEntersReadyGrantApplies(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  cardId: string,
  playerId: string,
  cards?: EnterReadyCardAccessor,
  entryZone?: string,
): boolean {
  // rule 143.4 / 364.3.a (rule-id: sfd-027-221) — the played card's OWN
  // conditional "I enter ready" static ("If you have two or fewer cards in
  // your hand") can only be evaluated with zone access, and this is the
  // enter-ready check that receives it.
  if (staticEnterReadyApplies(cardId, state, playerId, zones, cards, entryZone)) {
    return true;
  }
  const registry = getGlobalCardRegistry();
  const zoneIds = [
    "base",
    "legendZone",
    "championZone",
    ...Object.keys(state.battlefields ?? {}).map((bfId) => getBattlefieldZoneId(bfId) as string),
  ];
  for (const zoneId of zoneIds) {
    for (const sourceId of zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)) {
      for (const ability of registry.getAbilities(sourceId as string) ?? []) {
        if (ability?.type !== "static") {
          continue;
        }
        // rule 824 (rule-id: unl-191-219 Wuju Master) — "[Level 11][>] Your
        // units enter ready" is a CONDITIONAL board static: it applies only
        // while the condition holds. A condition this reader cannot evaluate
        // stays unapplied rather than granting entry readiness blindly.
        const condition = (ability as { condition?: Record<string, unknown> }).condition;
        if (
          condition &&
          evaluateEnterReadyCondition(
            condition,
            state,
            playerId,
            sourceId as string,
            zones,
            cards,
            entryZone,
          ) !== true
        ) {
          continue;
        }
        const effect = (ability as { effect?: Record<string, unknown> }).effect;
        const isBoardEnterReady =
          effect?.type === "enter-ready" &&
          typeof effect.target === "object" &&
          effect.target !== null;
        if (
          !isBoardEnterReady &&
          (effect?.type !== "grant-keyword" || effect.keyword !== "EntersReady")
        ) {
          continue;
        }
        const target = effect?.target as
          | { controller?: string; type?: string; filter?: string; excludeSelf?: boolean }
          | undefined;
        if (target?.controller && target.controller !== "friendly") {
          continue;
        }
        if (target?.type && target.type !== "unit") {
          continue;
        }
        // A token-only grant (Renata sfd-171-221) never readies a played card.
        if (target?.filter) {
          continue;
        }
        // "Other friendly units" — a grant cannot ready its own source.
        if (target?.excludeSelf && (sourceId as string) === cardId) {
          continue;
        }
        return true;
      }
    }
  }
  return false;
}

export function canPlayToOpenBattlefield(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  cardId: string,
  playerId: string,
): boolean {
  return (
    getPlayLocationPermission(cardId) === "an open battlefield" ||
    hasFriendlyOpenBattlefieldGrant(state, zones, playerId)
  );
}

/**
 * rule 355.2.b (ogn-161-298) — "You may play me to an occupied enemy
 * battlefield" adds enemy-controlled battlefields that hold at least one unit
 * (rule 170.11.a: occupied = a unit is there) to this card's play locations.
 */
export function canPlayToOccupiedEnemyBattlefield(cardId: string): boolean {
  return getPlayLocationPermission(cardId) === "an occupied enemy battlefield";
}

/**
 * rule 355.2 (sfd-025-221, Rengar Pouncing) — "I can be played to a
 * battlefield you're attacking" is modelled as a static grant-keyword
 * `CanPlayToAttacked` on self; this is the engine hook that reads it.
 */
export function canPlayToAttackedBattlefield(cardId: string): boolean {
  return selfGrantsPlayLocationKeyword(cardId, "CanPlayToAttacked");
}

/**
 * rule 355.2 / 356.2.a.1 (unl-166-219, Stalking Wolf) — "You may play me to its
 * battlefield (even if you don't have other units there)": the victim of the
 * additional cost may be the only friendly unit at the destination, so the
 * Ambush play stays legal after the kill empties that battlefield. Modelled as
 * a self static grant-keyword `CanPlayToVictimBattlefield`.
 */
export function canPlayToCostVictimBattlefield(cardId: string): boolean {
  return selfGrantsPlayLocationKeyword(cardId, "CanPlayToVictimBattlefield");
}

/**
 * A play-location permission printed as a self static `grant-keyword` marker.
 */
function selfGrantsPlayLocationKeyword(cardId: string, keyword: string): boolean {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  for (const ability of abilities) {
    if (ability?.type !== "static") {
      continue;
    }
    const effect = (ability as { effect?: { type?: string; keyword?: string } }).effect;
    if (
      (effect?.type === "grant-keyword" || effect?.type === "grant-keywords") &&
      effect?.keyword === keyword
    ) {
      return true;
    }
  }
  return false;
}

/**
 * rule 355.2 (unl-120-219, Rengar Trophy Hunter) — "I can be played to a
 * battlefield where there are enemy units (even if you don't have units
 * there)", modelled as a self static grant-keyword `CanPlayToEnemyBattlefield`.
 * Unlike `canPlayToOccupiedEnemyBattlefield` the battlefield need not be
 * enemy-CONTROLLED; enemy units being present is enough.
 */
export function canPlayToEnemyOccupiedBattlefield(cardId: string): boolean {
  return selfGrantsPlayLocationKeyword(cardId, "CanPlayToEnemyBattlefield");
}

/** A static `can-play-to-occupied` permission, once it is known to apply. */
export type OccupiedBattlefieldPermission = { readonly requiresLoneEnemy: boolean };

/**
 * Read a `can-play-to-occupied` static off one card: `forSelf` picks the
 * "I can be played …" form, otherwise the "Friendly units can be played …" grant.
 */
function readOccupiedBattlefieldPermission(
  hostId: string,
  forSelf: boolean,
): OccupiedBattlefieldPermission | undefined {
  for (const ability of getGlobalCardRegistry().getAbilities(hostId) ?? []) {
    if (ability?.type !== "static") {
      continue;
    }
    const staticAbility = ability as {
      condition?: { type?: string };
      effect?: { target?: { controller?: string; type?: string }; type?: string };
    };
    if (staticAbility.effect?.type !== "can-play-to-occupied") {
      continue;
    }
    const target = staticAbility.effect.target;
    if (forSelf !== (target?.type === "self")) {
      continue;
    }
    if (!forSelf && target?.controller !== "friendly") {
      continue;
    }
    return { requiresLoneEnemy: staticAbility.condition?.type === "enemy-unit-alone" };
  }
  return undefined;
}

/**
 * rule 355.2 (unl-117-219, Arachnoid Horror) — "I can be played to an occupied
 * battlefield if an enemy unit is alone there", plus the same permission granted
 * to every friendly unit. rule 365.1: the grant is a permanent's passive, so only
 * cards already on this player's board (base or a battlefield) hand it out — a
 * copy in hand grants nothing. Returns undefined when no permission applies.
 */
export function getOccupiedBattlefieldPermission(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  cardId: string,
  playerId: string,
): OccupiedBattlefieldPermission | undefined {
  const own = readOccupiedBattlefieldPermission(cardId, true);
  if (own) {
    return own;
  }
  const zoneIds = [
    "base",
    ...Object.keys(state.battlefields ?? {}).map((bfId) => getBattlefieldZoneId(bfId) as string),
  ];
  for (const zoneId of zoneIds) {
    for (const hostId of zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)) {
      const granted = readOccupiedBattlefieldPermission(hostId as string, false);
      if (granted) {
        return granted;
      }
    }
  }
  return undefined;
}

/**
 * rule 170.11.a (occupied = a unit is there) + rule 740.2.a (alone = no other
 * FRIENDLY unit at that location): does `bfId` match what the permission asks
 * for? "Alone" is measured from the enemy unit's own side, so my units standing
 * at the same battlefield never break an enemy unit's solitude (riftjudge
 * d8937a8abe18b2d3 — several units may be played there off one Arachnoid).
 */
export function battlefieldMatchesOccupiedPermission(
  zones: { getCardsInZone: (zone: CoreZoneId, player?: CorePlayerId) => readonly CoreCardId[] },
  getController: (cardId: CoreCardId) => string | undefined,
  bfId: string,
  playerId: string,
  permission: OccupiedBattlefieldPermission,
): boolean {
  const registry = getGlobalCardRegistry();
  const occupants = zones
    .getCardsInZone(getBattlefieldZoneId(bfId) as CoreZoneId)
    // rule 740.2.a — attached gear and equipment are not units and never
    // count for "alone".
    .filter((occupant) => registry.getCardType(occupant as string) === "unit");
  const perController = new Map<string, number>();
  for (const occupant of occupants) {
    const controller = getController(occupant);
    if (controller === undefined) {
      continue;
    }
    perController.set(controller, (perController.get(controller) ?? 0) + 1);
  }
  const enemyCounts = [...perController.entries()].filter(([controller]) => controller !== playerId);
  if (enemyCounts.length === 0) {
    return false;
  }
  // rule 740.2.a — an enemy unit is alone when no OTHER unit its own controller
  // controls shares the location; my units there are irrelevant.
  return permission.requiresLoneEnemy ? enemyCounts.some(([, n]) => n === 1) : true;
}

/**
 * rule 170.11.a — at least one unit at `bfId` is controlled by an opponent of
 * `playerId`, whoever controls the battlefield itself.
 */
export function battlefieldHasEnemyUnits(
  zones: { getCardsInZone: (zone: CoreZoneId, player?: CorePlayerId) => readonly CoreCardId[] },
  getController: (cardId: CoreCardId) => string | undefined,
  bfId: string,
  playerId: string,
): boolean {
  return zones
    .getCardsInZone(getBattlefieldZoneId(bfId) as CoreZoneId)
    .some((cardId) => {
      const controller = getController(cardId);
      return controller !== undefined && controller !== playerId;
    });
}

/**
 * rule 464.2.a — a player is attacking a battlefield for as long as their
 * Standard Move contests it (the showdown/combat is still open).
 */
export function battlefieldIsAttackedBy(
  state: RiftboundGameState,
  bfId: string,
  playerId: string,
): boolean {
  const bf = state.battlefields?.[bfId];
  return bf?.contested === true && bf.contestedBy === playerId;
}

/**
 * rule 170.11.a / 355.2.b: enemy-controlled AND holding at least one unit.
 */
export function battlefieldIsOccupiedEnemy(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player?: CorePlayerId) => readonly CoreCardId[] },
  bfId: string,
  playerId: string,
): boolean {
  const controller = state.battlefields?.[bfId]?.controller;
  if (!controller || controller === playerId) {
    return false;
  }
  return zones.getCardsInZone(getBattlefieldZoneId(bfId) as CoreZoneId).length > 0;
}

/**
 * rule 170.11.c: a battlefield is "open" only while it is BOTH uncontrolled and
 * unoccupied — an uncontrolled battlefield holding any unit (friendly or enemy)
 * is not a legal destination for "You may play me to an open battlefield".
 */
export function battlefieldIsOpen(
  state: RiftboundGameState,
  zones: { getCardsInZone: (zone: CoreZoneId, player?: CorePlayerId) => readonly CoreCardId[] },
  bfId: string,
): boolean {
  if (state.battlefields?.[bfId]?.controller) {
    return false;
  }
  const bfZoneId = getBattlefieldZoneId(bfId) as CoreZoneId;
  return zones.getCardsInZone(bfZoneId).length === 0;
}

/**
 * rule-id: sfd-015-221 — "Play me only to a battlefield you conquered this
 * turn." True when the card self-grants the `PlayOnlyToConqueredBattlefield`
 * keyword (printed or via an unconditional static).
 */
export function playOnlyToConqueredBattlefield(cardId: string): boolean {
  const registry = getGlobalCardRegistry();
  if (registry.hasKeyword(cardId, "PlayOnlyToConqueredBattlefield")) {
    return true;
  }
  return (registry.getAbilities(cardId) ?? []).some((a) => {
    const ab = a as {
      type?: string;
      condition?: unknown;
      effect?: { type?: string; keyword?: string; target?: unknown };
    };
    return (
      ab.type === "static" &&
      ab.condition === undefined &&
      ab.effect?.type === "grant-keyword" &&
      ab.effect.keyword === "PlayOnlyToConqueredBattlefield" &&
      (ab.effect.target === undefined || ab.effect.target === "self")
    );
  });
}

/**
 * Runtime replacement stored in `draft.activeReplacements` by the
 * effect-executor `case "replacement"`.
 */
export interface ActiveReplacementEntry {
  replaces?: string;
  duration?: string;
  owner?: string;
  sourceCardId?: string;
  target?: { type?: string; cardType?: string; controller?: string; excludeTokens?: boolean };
  /** rule-id: unl-219-219 — surcharge carried by a `play-cost-increase` rider. */
  amount?: number;
  /** rule-id: unl-052-219 — also [Buff] the entering unit. */
  buff?: boolean;
  /**
   * rule 390.2 (rule-id: unl-052-219) — the armed one-shot is a DELAYED
   * TRIGGERED ability, not a replacement: instead of altering how the unit
   * enters, it puts a triggered item on the Chain when the unit is played.
   */
  delayedTrigger?: boolean;
}

/**
 * The unit entering play, so riders on the matched replacement (e.g. `buff`)
 * can be applied to it.
 */
export interface EnteringUnit {
  readonly cardId: string;
  readonly ctx: Pick<EffectContext, "zones" | "cards" | "counters">;
}

/**
 * Rule 571 consumer for `enters-ready` replacements installed at runtime
 * (Sun Disc ogn-021-298: "the next unit you play this turn enters ready").
 * Scans `draft.activeReplacements` for a matching entry, removes it when
 * `duration:"next"`, and reports whether one applied so the caller can skip
 * the rule-143.4 exhaust flag.
 *
 * rule-id: unl-052-219 — when the matched entry carries `buff: true` ("the
 * next time you play a unit this turn, ready it and Buff it") and `entering`
 * is supplied, the entering unit is also buffed.
 */
export function consumeEntersReadyReplacement(
  draft: RiftboundGameState,
  playerId: string,
  entering?: EnteringUnit,
): boolean {
  const active = draft.activeReplacements as ActiveReplacementEntry[] | undefined;
  if (!active || active.length === 0) {
    return false;
  }
  for (let i = 0; i < active.length; i++) {
    const entry = active[i];
    if (entry?.replaces !== "enters-ready") {
      continue;
    }
    // "the next unit YOU play" — the replacement is scoped to its installer.
    // A friendly-controller target filter narrows to the same player; an
    // absent/any controller matches everyone.
    const controller = entry.target?.controller;
    if (entry.owner !== undefined && entry.owner !== playerId) {
      continue;
    }
    if (controller === "enemy") {
      continue;
    }
    const targetType = entry.target?.type;
    if (targetType !== undefined && targetType !== "unit") {
      continue;
    }
    if (entry.duration === "next") {
      active.splice(i, 1);
    }
    // rule 390.2 — a delayed TRIGGERED ability does not change how the unit
    // enters: the unit enters exhausted/unbuffed and a triggered item sourced
    // from the arming card goes on the Chain (ordered against any other
    // trigger of the same play per 383.3.d) to ready and Buff it on resolution.
    if (entry.delayedTrigger) {
      if (entering) {
        queueDelayedEntersReadyTrigger(draft, playerId, entry, entering.cardId);
      }
      return false;
    }
    if (entry.buff && entering) {
      executeEffect(
        { type: "buff" },
        {
          ...entering.ctx,
          boundTargets: [entering.cardId],
          draft,
          playerId,
          sourceCardId: entry.sourceCardId ?? entering.cardId,
        },
      );
    }
    return true;
  }
  return false;
}

/**
 * rule 390.2 / 392 — put the delayed trigger's payoff on the Chain as a
 * Pending triggered item sourced from the arming card (which may already have
 * left the board). Its instruction is pinned to the unit that was just played.
 */
function queueDelayedEntersReadyTrigger(
  draft: RiftboundGameState,
  playerId: string,
  entry: ActiveReplacementEntry,
  enteringCardId: string,
): void {
  const target = { filter: { idIn: [enteringCardId] }, quantity: 1, type: "permanent" };
  const effects: unknown[] = [{ target, type: "ready" }];
  if (entry.buff) {
    effects.push({ target, type: "buff" });
  }
  const turnOrder = Object.keys(draft.players ?? {});
  (draft as { interaction?: unknown }).interaction = addToChain(
    draft.interaction ?? createInteractionState(),
    {
      cardId: entry.sourceCardId ?? enteringCardId,
      controller: playerId as PlayerId,
      effect: (effects.length === 1 ? effects[0] : { effects, type: "sequence" }) as never,
      status: "pending",
      // rule 355.10 (rule-id: unl-052-219 × sfd-057-221) — the payoff applies to
      // "the next unit you play", an object the ability never chooses. Binding
      // the unit here keeps finalization from re-planning (and thus from raising
      // a `choose` event): an Irelia readied this way gets +1 for the ready only.
      targets: [enteringCardId],
      triggered: true,
      type: "ability",
    } as never,
    turnOrder,
  );
}

/**
 * rule 356.4.b (rule-id: ogn-031-298): one-shot "the next <type> you play this
 * turn costs [N] less" discounts live in `draft.activeReplacements` as
 * `replaces: "play-cost"` entries scoped to their installer. Returns the summed
 * energy discount for this play; with `consume`, spends the matched
 * `duration:"next"` entries (only call that from the pay path on a draft).
 */
export function takeNextPlayDiscount(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  consume: boolean,
): { energy: number; power: Partial<Record<string, number>> } {
  const none = { energy: 0, power: {} as Partial<Record<string, number>> };
  const active = state.activeReplacements as
    | (ActiveReplacementEntry & { reduction?: unknown; amount?: unknown })[]
    | undefined;
  if (!active || active.length === 0) {
    return none;
  }
  const cardType = getGlobalCardRegistry().get(cardId)?.cardType;
  let total = 0;
  // rule 356.4.a (ven-044-166) — "your next card costs [2][rainbow][rainbow]
  // less": a one-shot discount may waive Power pips as well as Energy.
  const power: Partial<Record<string, number>> = {};
  for (let i = active.length - 1; i >= 0; i--) {
    const entry = active[i];
    if (entry?.replaces !== "play-cost") {
      continue;
    }
    // rule 356.1.b (sfd-084-221) — a whole-Energy WAIVER ("play a gear ignoring
    // its Energy cost") is not a discount: `play-gear.ts` applies it and spends
    // the one-shot only when the player elects it, so a full-price play must
    // not consume it here.
    if ((entry as { ignoreEnergyCost?: boolean }).ignoreEnergyCost === true) {
      continue;
    }
    if (entry.owner !== undefined && entry.owner !== playerId) {
      continue;
    }
    const targetType = entry.target?.type;
    if (targetType !== undefined && targetType !== "card" && targetType !== cardType) {
      continue;
    }
    const decoded = decodeCostAmount(entry.reduction ?? entry.amount);
    total += decoded.energy;
    for (const [domain, n] of Object.entries(decoded.power)) {
      if (n && n > 0) {
        power[domain] = (power[domain] ?? 0) + n;
      }
    }
    if (consume && entry.duration === "next") {
      active.splice(i, 1);
    }
  }
  return { energy: total, power };
}

/**
 * rule 356.3 (rule-id: unl-219-219) — runtime "your <cards> cost [N] more to
 * play this turn" surcharges, installed by the `cost-increase` effect handler
 * as `replaces: "play-cost-increase"` riders on `draft.activeReplacements`
 * (so they expire with the turn like every other runtime rider, 517.2).
 * Increases are added after all discounts and are never floored.
 *
 * rule 185 / 186: an `excludeTokens` rider skips tokens — an effect puts them
 * into play, they are not played for a cost of their own.
 */
export function getRuntimePlayCostIncrease(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
): number {
  const active = state.activeReplacements as ActiveReplacementEntry[] | undefined;
  if (!active || active.length === 0) {
    return 0;
  }
  const registry = getGlobalCardRegistry();
  const playedType = registry.get(cardId)?.cardType;
  let total = 0;
  for (const entry of active) {
    if (entry?.replaces !== "play-cost-increase") {
      continue;
    }
    if (entry.owner !== undefined && entry.owner !== playerId) {
      continue;
    }
    const wanted = entry.target?.cardType ?? entry.target?.type;
    if (wanted !== undefined && wanted !== "card" && wanted !== playedType) {
      continue;
    }
    if (entry.target?.excludeTokens === true && registry.isToken(cardId)) {
      continue;
    }
    total += entry.amount ?? 0;
  }
  return total;
}

/**
 * Optional additional-cost declared on a unit card at play time.
 */
export interface OptionalPlayCost {
  /** `"accelerate"` (rule 717) enters the unit ready when paid. */
  readonly kind:
    | "accelerate"
    | "kill"
    | "pay"
    | "exhaust"
    | "discard"
    | "spend-buff"
    | "return-to-hand";
  /**
   * rule 356.2.a.1 — the additional cost is printed without "you may", so the
   * card cannot be played at all unless it is paid.
   */
  readonly mandatory?: boolean;
  /**
   * rule-id: sfd-044-221 (rule 356.2.a.1) — descriptor for "return a friendly
   * gear to its owner's hand" as an additional cost to play me.
   */
  readonly returnToHand?: { readonly type?: string; readonly controller?: string };
  /**
   * rule 356.5 (ogn-146-298 Wallop) — "If you do, ignore this spell's cost":
   * paying the optional additional cost waives the base cost entirely.
   */
  readonly ignoresBaseCost?: boolean;
  /**
   * rule 356.2.b (ogn-002-298) — "you may discard N as an additional cost":
   * how many cards leave the hand when the cost is paid.
   */
  readonly discard?: number;
  /**
   * Extra energy/power to deduct when the cost is paid.
   * rule-id: unl-178-219 — `xp` is spent from the player's XP total.
   */
  readonly cost?: { energy?: number; power?: readonly string[]; xp?: number };
  /** Target descriptor for a "kill a friendly X" additional cost. */
  readonly kill?: unknown;
  /** rule-id: ogn-048-298 (rule 356.2) — descriptor for "you may exhaust a friendly X". */
  readonly exhaust?: unknown;
  /**
   * rule-id: unl-178-219 (rule 560) — "If you do, I cost [N] less": energy
   * discount applied to the base cost when the optional cost is paid.
   */
  readonly energyDiscount?: number;
  /**
   * rule-id: unl-122-219 (rule 364.3.a) — the OFFER itself may be gated ("if
   * you've played a spell this turn, you may pay …"). Carries the declaring
   * ability's condition so state-aware callers can withhold the option.
   */
  readonly condition?: Record<string, unknown>;
  /**
   * rule-id: unl-122-219 (rule 369.3) — "If you do, I enter ready": paying the
   * optional cost replaces how the unit enters, exactly like a paid Accelerate.
   */
  readonly entersReadyIfPaid?: boolean;
}

/**
 * rule 364.3.a (rule-id: unl-122-219) — is a gated optional additional cost on
 * the menu right now? An absent or unevaluable condition leaves the offer open.
 */
export function optionalPlayCostOffered(
  optional: OptionalPlayCost | undefined,
  state: RiftboundGameState,
  playerId: string,
  cardId?: string,
): boolean {
  if (!optional?.condition) {
    return true;
  }
  return evaluateEnterReadyCondition(optional.condition, state, playerId, cardId) !== false;
}

/** Decode an "I cost [N] less" ifPaid rider into an energy discount. */
function ifPaidEnergyDiscount(ifPaid: unknown): number {
  if (typeof ifPaid !== "object" || ifPaid === null) {
    return 0;
  }
  const r = ifPaid as { type?: string; reduction?: unknown; amount?: unknown; energy?: unknown };
  if (r.type !== "cost-reduction") {
    return 0;
  }
  let discount = 0;
  for (const v of [r.reduction, r.amount, r.energy]) {
    if (typeof v === "number") {
      discount += v;
    } else if (typeof v === "string") {
      for (const m of v.matchAll(/:rb_energy_(\d+):/g)) {
        discount += Number.parseInt(m[1], 10);
      }
    } else if (typeof v === "object" && v !== null) {
      const e = (v as { energy?: unknown }).energy;
      if (typeof e === "number") {
        discount += e;
      }
    }
  }
  return discount;
}

/**
 * Read a unit's optional additional play-cost from its abilities.
 *
 * Recognises Accelerate (`{type:"keyword", keyword:"Accelerate", cost}`), the
 * "you may kill a friendly X as an additional cost to play me" pattern
 * (`{type:"static"|"additional-cost-option", cost:{kill: TargetDescriptor}}`),
 * and the plain "you may pay [X] as an additional cost to play me" pattern
 * emitted by the parser as
 * `{type:"static", effect:{type:"additional-cost-option", additionalCost}}`.
 */
export function getOptionalPlayCost(cardId: string): OptionalPlayCost | undefined {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  for (const ability of abilities) {
    if (ability.type === "keyword" && ability.keyword === "Accelerate") {
      const cost = ability.cost as { energy?: number; power?: readonly string[] } | undefined;
      return { cost, kind: "accelerate" };
    }
    // rule 356.2.a.1 / 204.2 (unl-173-219) — "As an additional cost to play
    // this, kill a friendly [Mighty] unit": on a SPELL ability the parser
    // hangs the descriptor off `additionalCost` at the top level. It is
    // mandatory, so the spell is unplayable without a legal sacrifice.
    const spellAdditional = (ability as { additionalCost?: { kill?: unknown } }).additionalCost;
    if (ability.type === "spell" && spellAdditional?.kill) {
      return { kill: spellAdditional.kill, kind: "kill", mandatory: true };
    }
    const rawCost = ability.cost as { kill?: unknown } | undefined;
    if (
      (ability.type === "static" || ability.type === "additional-cost-option") &&
      rawCost?.kill
    ) {
      return { kill: rawCost.kill, kind: "kill" };
    }
    // Rule 560 — sfd-109-221: plain "you may pay COST" additional cost. The
    // parser wraps it as a static ability whose effect is
    // `{type:"additional-cost-option", additionalCost}` with no top-level
    // `cost`, so read the nested effect and decode the rune-token string.
    // Rule 560 — unl-178-219: "you may spend N XP as an additional cost … If
    // you do, I cost [N] less" arrives as `additionalCost:{xp:N}` with an
    // `ifPaid` cost-reduction rider.
    const effect = ability.effect as
      | { type?: string; additionalCost?: unknown; ifPaid?: unknown }
      | undefined;
    if (
      (ability.type === "static" || ability.type === "additional-cost-option") &&
      effect?.type === "additional-cost-option" &&
      effect.additionalCost !== undefined
    ) {
      let energy = 0;
      let xp = 0;
      let discard = 0;
      const power: string[] = [];
      const raw = effect.additionalCost;
      const ignoresBaseCost =
        (effect.ifPaid as { type?: string } | undefined)?.type === "ignore-cost";
      if (typeof raw === "string" && /^spend a buff$/i.test(raw.trim())) {
        // rule 356.2.b (ogn-146-298) — "you may spend a buff as an additional
        // cost": a buff counter on a friendly unit pays for the play.
        return { kind: "spend-buff", ...(ignoresBaseCost ? { ignoresBaseCost } : {}) };
      }
      if (typeof raw === "string") {
        // rule 356.2.b (ogn-002-298) — "discard N as an additional cost".
        const d = /^discard (\d+)$/.exec(raw.trim());
        if (d) {
          discard = Number.parseInt(d[1], 10);
        }
        for (const m of raw.matchAll(/:rb_energy_(\d+):/g)) {
          energy += Number.parseInt(m[1], 10);
        }
        for (const m of raw.matchAll(
          /:rb_rune_(fury|calm|mind|body|chaos|order|rainbow):/g,
        )) {
          power.push(m[1]);
        }
      } else if (typeof raw === "object" && raw !== null) {
        const obj = raw as {
          energy?: number;
          power?: readonly string[];
          xp?: number;
          exhaust?: unknown;
          discard?: number;
        };
        // rule 356.2 — ogn-048-298: "you may exhaust a friendly unit" as an
        // additional cost; the unit is chosen and exhausted at pay time.
        if (obj.exhaust) {
          return { exhaust: obj.exhaust, kind: "exhaust" };
        }
        // rule 356.2.a.1 (sfd-044-221) — "As an additional cost to play me,
        // return a friendly gear to its owner's hand": no "may", so the play
        // is illegal without a friendly gear on the board.
        const bounce = (obj as { returnToHand?: { type?: string; controller?: string } })
          .returnToHand;
        if (bounce) {
          return {
            kind: "return-to-hand",
            returnToHand: bounce,
            ...((effect as { optional?: boolean }).optional === false
              ? { mandatory: true }
              : {}),
          };
        }
        // rule 356.2.a.1 (ogn-208-298) — "As an additional cost to play me,
        // kill a friendly unit": no "may", so the kill is MANDATORY and the
        // play is illegal without a victim.
        if ((obj as { kill?: unknown }).kill) {
          return {
            kill: (obj as { kill?: unknown }).kill,
            kind: "kill",
            ...((effect as { optional?: boolean }).optional === false
              ? { mandatory: true }
              : {}),
          };
        }
        energy = obj.energy ?? 0;
        xp = obj.xp ?? 0;
        discard = obj.discard ?? 0;
        if (obj.power) {power.push(...obj.power);}
      }
      // rule 356.2.b / 204.2 (ogn-002-298): the discarded card is the whole
      // additional cost; an "If you do, reduce my cost by [N]" rider nets
      // against the base cost.
      if (discard > 0) {
        return {
          discard,
          kind: "discard",
          ...(ifPaidEnergyDiscount(effect.ifPaid) > 0
            ? { energyDiscount: ifPaidEnergyDiscount(effect.ifPaid) }
            : {}),
        };
      }
      if (energy > 0 || power.length > 0 || xp > 0) {
        const energyDiscount = ifPaidEnergyDiscount(effect.ifPaid);
        // rule 369.3 (unl-122-219) — "If you do, I enter ready".
        const entersReadyIfPaid =
          (effect.ifPaid as { type?: string } | undefined)?.type === "enter-ready";
        const gate = (ability as { condition?: Record<string, unknown> }).condition;
        return {
          cost: { energy, power, ...(xp > 0 ? { xp } : {}) },
          kind: "pay",
          ...(energyDiscount > 0 ? { energyDiscount } : {}),
          ...(entersReadyIfPaid ? { entersReadyIfPaid } : {}),
          ...(gate ? { condition: gate } : {}),
        };
      }
    }
  }
  return undefined;
}

/**
 * rule-id: sfd-029-221 (rule 805.1.a) — "Friendly units played from anywhere
 * other than a player's hand have [Accelerate]." Accelerate is an optional
 * additional cost paid AS the unit is played, so a board static grants it as a
 * play-time licence (`{type:"static", effect:{type:"grant-keyword-on-play",
 * keyword:"Accelerate", playedFrom:"non-hand"}}`) rather than as a keyword on
 * the card. The granted cost is the printed Accelerate price, [1] plus one pip
 * of the played card's own domain.
 *
 * `boardCards` is every card in play with its controller; only permanents
 * controlled by the playing player license their controller's plays.
 */
export function getGrantedAcceleratePlayCost(
  cardId: string,
  playerId: string,
  boardCards: readonly { readonly cardId: string; readonly controller: string | undefined }[],
  playedFromHand: boolean,
): { energy: number; power: string[] } | undefined {
  if (playedFromHand) {
    return undefined;
  }
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId) as { cardType?: string; domain?: string } | undefined;
  if (def?.cardType !== "unit") {
    return undefined;
  }
  const granted = boardCards.some((entry) => {
    if (entry.controller !== playerId || entry.cardId === cardId) {
      return false;
    }
    return (registry.getAbilities(entry.cardId) ?? []).some((ability) => {
      if (ability.type !== "static") {
        return false;
      }
      const effect = ability.effect as
        | { type?: string; keyword?: string; playedFrom?: string }
        | undefined;
      return (
        effect?.type === "grant-keyword-on-play" &&
        effect.keyword === "Accelerate" &&
        effect.playedFrom === "non-hand"
      );
    });
  });
  if (!granted) {
    return undefined;
  }
  // rule 805.1.a.2 / 135.2.e.6.b — [Accelerate] is [1] plus one pip of the
  // card's Domain; a card with NO Domain pays [A] (any Domain) instead of
  // nothing at all.
  return { energy: 1, power: [def.domain ?? "rainbow"] };
}

/**
 * Calculate the Deflect surcharge for targeting a card (rule 721.1.b).
 *
 * Reads the Deflect value from each target's `keyword`-typed abilities
 * (shape: `{ type: "keyword", keyword: "Deflect", value: N }`). Multiple
 * Deflect abilities on the same target stack (rule 721.2). Falls back to
 * +1 per target if the card declares Deflect in its flat `keywords[]`
 * array but no ability carries an explicit numeric value (rule 721.1.b.3).
 *
 * rule-id: unl-030-219 (rule 721.1.c) — "OPPONENTS must pay": targets the
 * caster controls (or owns, when no controller accessor is available) never
 * contribute a surcharge.
 */
/**
 * rule 809.1.c.1 (rule-id: sfd-077-221) — pay the [Deflect] surcharge for
 * `targets` out of `playerId`'s pooled Power (any Domain, most-stocked Domain
 * first). Used wherever a target is CHOSEN after the source was already paid
 * for: a modal spell/ability picks its target as it resolves, so the surcharge
 * was never quoted at play time. Returns false (paying nothing) when short.
 */
export function payDeflectSurcharge(
  draft: RiftboundGameState,
  playerId: string,
  targets: readonly string[],
  cards?: Parameters<typeof getDeflectSurcharge>[3],
  zones?: Parameters<typeof getDeflectSurcharge>[5],
): boolean {
  const amount = getDeflectSurcharge(draft, playerId, [...targets], cards, undefined, zones);
  if (amount <= 0) {
    return true;
  }
  const pool = draft.runePools[playerId]?.power as Partial<Record<string, number>> | undefined;
  const pooled = pool ? Object.values(pool).reduce((a: number, b) => a + (b ?? 0), 0) : 0;
  if (!pool || pooled < amount) {
    return false;
  }
  for (let i = 0; i < amount; i++) {
    const key = Object.entries(pool)
      .filter(([, v]) => (v ?? 0) > 0)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0];
    if (key === undefined) {
      return false;
    }
    pool[key] = (pool[key] ?? 0) - 1;
  }
  return true;
}

/**
 * rule 809.1.d (rule-id: ven-061-166) — "Ignore [Deflect] while paying this
 * spell's cost": the source waives the Deflect additional cost entirely, so it
 * is neither quoted while choosing targets nor deducted when the cost is paid.
 * Recognised as an `{type:"ignore-deflect"}` effect, or from the printed clause
 * while the card's text is still unparsed (`raw`).
 */
export function sourceIgnoresDeflect(sourceCardId?: string): boolean {
  if (sourceCardId === undefined) {
    return false;
  }
  for (const ability of getGlobalCardRegistry().getAbilities(sourceCardId) ?? []) {
    const effect = (ability as { effect?: { type?: string; text?: string } }).effect;
    if (effect?.type === "ignore-deflect") {
      return true;
    }
    if (typeof effect?.text === "string" && /ignore\s+\[?deflect\]?/i.test(effect.text)) {
      return true;
    }
  }
  return false;
}

/**
 * rule 765 / 766 / 767 (rule-id: ven-158-166) — a battlefield printing
 * "Players ignore [Deflect] while paying for spells and abilities choosing
 * something here" makes Deflect Inactive for the PAYMENT procedure only, and
 * only for objects AT that battlefield (767); the object keeps the keyword
 * (809.3) and Deflect elsewhere is still taxed. `players: "all"` is symmetric
 * (105/190) — the waiver helps whoever is choosing, controller or not.
 */
function locationIgnoresDeflect(
  state: RiftboundGameState,
  targetId: string,
  zones?: { getCardZone?: (cardId: CoreCardId) => string | undefined },
): boolean {
  const zone = zones?.getCardZone?.(targetId as CoreCardId);
  if (typeof zone !== "string" || !zone.startsWith("battlefield-")) {
    return false;
  }
  const bfKey = zone.slice("battlefield-".length);
  const bfCardId = (state.battlefields?.[bfKey]?.id as string | undefined) ?? bfKey;
  const registry = getGlobalCardRegistry();
  for (const id of new Set([bfCardId, bfKey])) {
    for (const ability of registry.getAbilities(id) ?? []) {
      if (ability.type !== "static") {
        continue;
      }
      const effect = (ability as { effect?: Record<string, unknown> }).effect;
      if (
        effect?.type === "ignore-keyword" &&
        effect.keyword === "Deflect" &&
        effect.procedure === "paying-costs" &&
        (effect.location === undefined || effect.location === "here")
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Does this effect tree name a Chain object (a spell/ability) as its target? */
function namesChainObject(node: unknown, depth = 0): boolean {
  if (node === null || typeof node !== "object" || depth > 8) {
    return false;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (
      key === "target" &&
      typeof value === "object" &&
      value !== null &&
      ["ability", "spell", "spell-or-ability"].includes(
        String((value as { type?: unknown }).type),
      )
    ) {
      return true;
    }
    if (namesChainObject(value, depth + 1)) {
      return true;
    }
  }
  return false;
}

/**
 * rule 809.1.c (unl-106-219 × ogn-041-298) — [Deflect] taxes spells and
 * abilities that choose the PERMANENT ("each time they choose me"). A counter
 * aimed at that permanent's ABILITY on the Chain chooses a different object —
 * the Chain Item — so it owes no Deflect, even though the item is keyed by the
 * permanent's card id.
 */
function choiceIsChainAbility(
  state: RiftboundGameState,
  targetId: string,
  sourceCardId?: string,
): boolean {
  if (sourceCardId === undefined) {
    return false;
  }
  const items =
    (
      state as {
        interaction?: { chain?: { items?: readonly { cardId?: string; type?: string }[] } };
      }
    ).interaction?.chain?.items ?? [];
  if (!items.some((it) => it?.cardId === targetId && it.type === "ability")) {
    return false;
  }
  return (getGlobalCardRegistry().getAbilities(sourceCardId) ?? []).some((ability) =>
    namesChainObject((ability as { effect?: unknown }).effect),
  );
}

export function getDeflectSurcharge(
  _state: RiftboundGameState,
  _playerId: string,
  _targets?: string[],
  cards?: {
    getCardOwner?: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
    getCardMeta?: (cardId: CoreCardId) => unknown;
  },
  sourceCardId?: string,
  zones?: { getCardZone?: (cardId: CoreCardId) => string | undefined },
): number {
  if (!_targets || _targets.length === 0 || sourceIgnoresDeflect(sourceCardId)) {
    return 0;
  }
  const registry = getGlobalCardRegistry();
  let surcharge = 0;
  for (const targetId of _targets) {
    // rule 766 / 767 — Deflect is Inactive for this payment while the chosen
    // object sits at a battlefield that waives it.
    if (locationIgnoresDeflect(_state, targetId, zones)) {
      continue;
    }
    // rule 809.1.c — the choice is the ability on the Chain, not the unit.
    if (choiceIsChainAbility(_state, targetId, sourceCardId)) {
      continue;
    }
    const controller =
      cards?.getCardController?.(targetId as CoreCardId) ??
      cards?.getCardOwner?.(targetId as CoreCardId);
    if (controller !== undefined && controller === _playerId) {
      continue;
    }
    const abilities = registry.getAbilities(targetId) ?? [];
    let targetSurcharge = 0;
    for (const ability of abilities) {
      if (ability.type === "keyword" && ability.keyword === "Deflect") {
        targetSurcharge += ability.value ?? 1;
      }
    }
    // Fallback: flat-keyword Deflect with no numeric ability entry — treat
    // As value 1 (rule 721.1.b.3).
    if (targetSurcharge === 0 && registry.hasKeyword(targetId, "Deflect")) {
      targetSurcharge = 1;
    }
    // Rule-id: ogn-063-298 (rule 721.2) — Deflect granted at runtime (e.g. by
    // a static "friendly units have [Deflect]") lives in meta.grantedKeywords,
    // not the printed definition, and stacks with any printed Deflect.
    const meta = cards?.getCardMeta?.(targetId as CoreCardId) as
      | {
          grantedKeywords?: readonly { keyword: string; value?: number }[];
          equippedWith?: readonly string[];
        }
      | undefined;
    // rule 136.2.c / 718 / 809.2 (rule-id: sfd-059-221 Svellsongur) — an
    // attached Equipment whose effect text COPIES the wearer's text appends
    // that text back onto the unit, so each printed [Deflect] instance applies
    // once more per copy and the surcharges stack (Ornn: 2 + 2 = 4).
    let printedTextCopies = 0;
    for (const equipId of meta?.equippedWith ?? []) {
      const equipMeta = cards?.getCardMeta?.(equipId as CoreCardId) as
        | { copiedFromCardId?: string }
        | undefined;
      if (
        registry.get(equipId)?.copyAttachedUnitText === true &&
        equipMeta?.copiedFromCardId === targetId
      ) {
        printedTextCopies += 1;
      }
    }
    targetSurcharge *= 1 + printedTextCopies;
    for (const gk of meta?.grantedKeywords ?? []) {
      if (gk.keyword === "Deflect") {
        targetSurcharge += gk.value ?? 1;
      }
    }
    surcharge += targetSurcharge;
  }
  return surcharge;
}

/**
 * Create a typed getCardMeta accessor from the move context's cards API.
 */
export function createMetaAccessor(cards: {
  getCardMeta: (cardId: CoreCardId) => unknown;
}): (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined {
  return (cardId: CoreCardId) =>
    cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
}

/**
 * Get the cost modifier for a card from its metadata.
 */
export function getCostModifier(
  cardId: string,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): number {
  if (!getCardMeta) {
    return 0;
  }
  const meta = getCardMeta(cardId as CoreCardId);
  return meta?.costModifier ?? 0;
}

/**
 * Get the effective Might of a card at the moment of play.
 *
 * Used for interactive cost reduction: the engine needs to read the
 * chosen target's current Might before the card is played to compute
 * the effective cost. Includes base Might plus any equipment bonus,
 * buff counter, and runtime Might modifiers stored on meta.
 */
/**
 * rule 807.1.c (Assault) / rule 811.1.c (Shield): "While I'm an attacker /
 * defender, I have +X [Might]". The bonus is part of the unit's current Might
 * — not just its combat damage — for as long as the combat role is stamped.
 */
function getCombatRoleMightBonus(
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

export function getCardEffectiveMight(
  cardId: string,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): number {
  const registry = getGlobalCardRegistry();
  const printedMight = registry.getMight(cardId);
  if (printedMight === 0) {
    return 0;
  }
  const meta = getCardMeta?.(cardId as CoreCardId);
  // rule 323.5 — "its base Might becomes N" replaces the printed base; every
  // other layer still stacks on top of it.
  const baseMight = meta?.baseMightOverride ?? printedMight;
  const roleBonus = getCombatRoleMightBonus(cardId, meta);
  const buffBonus = (meta?.buffed ? 1 : 0) + (meta?.extraBuffs ?? 0);
  const mightMod = meta?.mightModifier ?? 0;
  const staticBonus = meta?.staticMightBonus ?? 0;
  let equipBonus = 0;
  for (const equipId of meta?.equippedWith ?? []) {
    equipBonus += registry.getMightBonus(equipId);
  }
  return Math.max(0, baseMight + buffBonus + mightMod + staticBonus + equipBonus + roleBonus);
}

/**
 * Compute the interactive cost reduction (rule: "Energy cost is reduced
 * by the Might of the unit you choose") for a card being played.
 * Returns 0 if the card has no interactive reduction or no chosen target.
 */
export function getInteractiveReduction(
  cardId: string,
  chosenTargetId: string | undefined,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): number {
  if (!chosenTargetId) {
    return 0;
  }
  const registry = getGlobalCardRegistry();
  const mode = registry.getInteractiveCostReduction(cardId);
  if (mode !== "target-might") {
    return 0;
  }
  return getCardEffectiveMight(chosenTargetId, getCardMeta);
}

/**
 * Optional extras for card affordability and cost deduction.
 */
export interface CostExtras {
  /** Targets of the card (used for Deflect surcharge calculation). */
  targets?: string[];
  /**
   * Card ID of the target chosen at play time for interactive cost
   * reduction (e.g., Hextech Gauntlets chooses a unit; the unit's
   * Might reduces the gauntlets' energy cost).
   */
  chosenTargetId?: string;
  /**
   * Value of X for X-cost spells — the chosen non-negative integer
   * amount the player pays on top of the card's base cost. Each point
   * of X consumes 1 energy from the rune pool.
   */
  xAmount?: number;
  /**
   * Number of EXTRA Repeat activations for spells with the `[Repeat]`
   * keyword. Each additional repeat adds the spell's `repeat` cost on
   * top of the base cost. See RiftboundMoves.playSpell.repeatCount.
   */
  repeatCount?: number;
  /**
   * rule-id: ven-049-166 — when true, the card is being played via its
   * `[Flow]` keyword from the trash: substitute the Flow cost for the
   * card's printed base cost.
   */
  viaFlow?: boolean;
  /**
   * rule 829.1.c.3 (rule-id: ven-113-166) — WHICH [Flow] instance the
   * controller elected, as an index into `getFlowCostOptionsForPlay` (printed
   * first, then granted). Omitted = let the engine pick a payable one.
   */
  flowIndex?: number;
  /**
   * rule-id: ven-083-166 — optional "you may pay [X] as an additional cost"
   * (rule 560) elected by the caster; stacks on top of the base cost.
   * rule-id: unl-178-219 — `energy` may be negative when the paid optional
   * cost carries an "I cost [N] less" rider; the total is clamped at 0.
   */
  additionalCost?: { energy?: number; power?: readonly string[] };
  /**
   * rule 357.3 / 805.1.a.1 — PAY-TIME hint only (it never changes what the
   * play costs): pips of a separate cost of this same play that is settled
   * afterwards and can only be paid from these Domains (an [Accelerate] pip of
   * the card's Domain alongside a battlefield's any-Domain redirect pips), so
   * this payment's any-Domain pips leave them alone.
   */
  reservePower?: readonly string[];
  /**
   * rule 356.5 (ogn-146-298) — the paid optional additional cost says to
   * ignore the card's cost: nothing is paid at all.
   */
  ignoreBaseCost?: boolean;
  /**
   * rule 356.1.b (ogn-196-298) — the play ignores only the card's Energy cost
   * component ("ignoring its Energy cost"); its Power cost is still paid.
   */
  ignoreEnergyCost?: boolean;
  /**
   * rule-id: ogn-150-298 (rule 560) — power pips waived by a paid optional
   * additional cost ("reduce my cost by [body] for each buff you spend"),
   * keyed by domain. Waived exactly like a board static's power waiver.
   */
  waivePower?: Partial<Record<string, number>>;
  /**
   * rule-id: ven-055-166 — board accessors so friendly permanents' static
   * cost-reductions ("Your spells cost [1][rainbow] less, to a minimum of
   * [1]") apply at pay time (rule 466). Omitted → no board statics apply.
   */
  board?: Pick<CostReductionContext, "zones" | "cards">;
  /**
   * rule 356.1 (rule-id: unl-089-219) — an ALTERNATE play cost ("you may play
   * me for [mind]") replaces the card's printed cost entirely for this play.
   */
  altCost?: { energy?: number; power?: readonly string[] };
  /**
   * rule-id: sfd-141-221 — pre-target gate: targets are not chosen yet, so a
   * "spells that choose me cost less" aura is assumed to apply. The move's
   * `condition` re-checks with the real targets.
   */
  assumeChooseDiscount?: boolean;
  /**
   * rule 356.4.b / 356.4.c.1 (rule-id: sfd-141-221) — which half of an
   * "[N] or [rainbow] less" discount the caster elects for THIS play. Resolved
   * by `computePlayResourceCost` (it elects the half the pool can actually
   * pay); left undefined by callers.
   */
  preferPowerWaiver?: boolean;
  /**
   * rule 822.1.c / 822.4 / 813.4 — this play grants the card [Reaction] for its
   * duration ([Ambush] played to a battlefield where you control units), so
   * "cards with [Reaction] cost … more" audiences (Mystic Vortex) see it.
   */
  grantedReaction?: boolean;
}

const NO_BOARD_REDUCTION: StaticCostReduction = { minimum: 0, power: {}, reduction: 0 };

/** rule-id: ven-055-166 — friendly permanents' static cost-reduction for this play. */
function getBoardCostReduction(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
): StaticCostReduction {
  if (!extras.board) {
    return NO_BOARD_REDUCTION;
  }
  return computeStaticCostReduction({ draft: state, ...extras.board }, playerId, cardId, {
    assumeChosen: extras.assumeChooseDiscount === true,
    chosenTargetIds: [
      ...(extras.targets ?? []),
      ...(extras.chosenTargetId ? [extras.chosenTargetId] : []),
    ],
    preferAlternative: extras.preferPowerWaiver ?? prefersPowerWaiver(state, playerId, cardId),
    viaFlow: extras.viaFlow === true,
  });
}

/**
 * rule 356.4.b (rule-id: sfd-141-221) — an "[N] or [rainbow] less" discount is
 * ONE discount the caster elects. The Power half is only ever the better pick
 * when the pool cannot cover the card's printed pips, so elect it exactly then.
 */
function prefersPowerWaiver(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
): boolean {
  const printed = getGlobalCardRegistry().getPowerCost(cardId) ?? [];
  if (printed.length === 0) {
    return false;
  }
  const pool = state.runePools[playerId];
  const have: Record<string, number> = {};
  for (const [d, v] of Object.entries(pool?.power ?? {})) {
    if (typeof v === "number" && v > 0) {
      have[d] = v;
    }
  }
  const need: Record<string, number> = {};
  for (const d of printed) {
    need[d] = (need[d] ?? 0) + 1;
  }
  let namedShort = 0;
  let spare = 0;
  for (const [d, n] of Object.entries(need)) {
    if (d === "rainbow") {
      continue;
    }
    namedShort += Math.max(0, n - (have[d] ?? 0));
  }
  for (const [d, n] of Object.entries(have)) {
    if (d !== "rainbow") {
      spare += Math.max(0, n - (need[d] ?? 0));
    }
  }
  // Pooled [rainbow] Power covers any named shortfall first (rule 135.2.e.5.a).
  let wild = have.rainbow ?? 0;
  const usedWild = Math.min(wild, namedShort);
  wild -= usedWild;
  if (namedShort - usedWild > 0) {
    return true;
  }
  return (need.rainbow ?? 0) > wild + spare;
}


const NO_COST_INCREASE: { energy: number; power: Partial<Record<string, number>> } = {
  energy: 0,
  power: {},
};

/**
 * rule 356.3 / 135.2.e.5.a (rule-id: sfd-146-221) — opponents' permanents may
 * impose a static cost INCREASE on the cards you play ("enemy spells cost
 * [1][rainbow] more"). Increases are added after every discount and are never
 * floored away by a discount's minimum.
 */
function getBoardCostIncrease(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
): { energy: number; power: Partial<Record<string, number>> } {
  if (!extras.board) {
    return NO_COST_INCREASE;
  }
  return computeStaticCostIncrease({ draft: state, ...extras.board }, playerId, cardId, {
    grantedReaction: extras.grantedReaction === true,
  });
}

/** Merge two per-domain pip tallies. */
function mergePower(
  a: Partial<Record<string, number>>,
  b: Partial<Record<string, number>>,
): Partial<Record<string, number>> {
  if (Object.keys(b).length === 0) {
    return a;
  }
  const out: Partial<Record<string, number>> = { ...a };
  for (const [d, n] of Object.entries(b)) {
    if (n && n > 0) {
      out[d] = (out[d] ?? 0) + n;
    }
  }
  return out;
}

/**
 * rule-id: ogn-150-298 (rule 560) — pips waived by board statics plus those
 * waived by a paid optional additional cost, merged per domain.
 */
function waivedPower(
  boardReduction: StaticCostReduction,
  extras: CostExtras,
  extraWaived?: Partial<Record<string, number>>,
): Partial<Record<string, number>> {
  const extraEntries = Object.entries(extraWaived ?? {});
  if (!extras.waivePower && extraEntries.length === 0) {
    return boardReduction.power;
  }
  const out: Partial<Record<string, number>> = { ...boardReduction.power };
  for (const [domain, n] of [...Object.entries(extras.waivePower ?? {}), ...extraEntries]) {
    if (n && n > 0) {
      out[domain] = (out[domain] ?? 0) + n;
    }
  }
  return out;
}

/**
 * rule-id: sfd-146-221 (rules 356.2.a.2, 356.4.f, 809.1.d) — Deflect's
 * [rainbow] is a mandatory ADDITIONAL cost added before discounts, so an
 * any-domain ([rainbow]) discount may offset that surcharge as well as a
 * printed pip — the payer picks (rule 356.4.d.1). Returns the surcharge left
 * owing plus the waivers still available for the printed cost.
 */
function offsetDeflectWithWaivedRainbow(
  waived: Partial<Record<string, number>>,
  deflectSurcharge: number,
  printedNeed: Partial<Record<string, number>> = {},
  available: Partial<Record<string, number>> = {},
): { surcharge: number; waived: Partial<Record<string, number>> } {
  const wild = waived.rainbow ?? 0;
  if (wild <= 0 || deflectSurcharge <= 0) {
    return { surcharge: deflectSurcharge, waived };
  }
  // rule 356.4.d.1 — the payer orders the discounts. A printed named pip is
  // payable only from its own Domain (or pooled [rainbow]), while the Deflect
  // surcharge takes Power of ANY Domain (rule 809.1.c.1), so hold the
  // any-Domain discount back for the printed pips the pool cannot cover and
  // spend only the remainder on the surcharge.
  let shortfall = 0;
  for (const [domain, n] of Object.entries(printedNeed)) {
    if (!n || n <= 0 || domain === "rainbow") {
      continue;
    }
    shortfall += Math.max(0, n - (available[domain] ?? 0));
  }
  // rule 135.2.e.5.b — pooled [rainbow] Power already covers a named shortfall.
  shortfall = Math.max(0, shortfall - (available.rainbow ?? 0));
  const used = Math.min(Math.max(0, wild - shortfall), deflectSurcharge);
  return {
    surcharge: deflectSurcharge - used,
    waived: { ...waived, rainbow: wild - used },
  };
}

/**
 * rule 356.4.d / 356.4.f — the pip waivers left over after `reducePowerCost`
 * applied `waived` to the printed cost `need` (yielding `after`). Named
 * waivers are spent on their own Domain first, so whatever the printed pips
 * did not absorb is still available for the additional costs that were added
 * to the total before the discount.
 */
function unusedPowerWaivers(
  waived: Partial<Record<string, number>>,
  need: Partial<Record<string, number>>,
  after: Partial<Record<string, number>>,
): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  let reduced = 0;
  for (const domain of new Set([...Object.keys(need), ...Object.keys(after)])) {
    reduced += Math.max(0, (need[domain] ?? 0) - (after[domain] ?? 0));
  }
  let namedUsed = 0;
  for (const [domain, n] of Object.entries(waived)) {
    if (domain === "rainbow" || !n || n <= 0) {
      continue;
    }
    const used = Math.min(n, need[domain] ?? 0);
    namedUsed += used;
    if (n - used > 0) {
      out[domain] = n - used;
    }
  }
  const wild = Math.max(0, (waived.rainbow ?? 0) - Math.max(0, reduced - namedUsed));
  if (wild > 0) {
    out.rainbow = wild;
  }
  return out;
}

/**
 * rule-id: ogn-150-298 (rule 560 / 702.2.b) — "you may spend any number of
 * buffs as an additional cost. Reduce my cost by [D] for each buff you spend."
 * Returns the domain pip waived per buff spent. Kept separate from
 * `getOptionalPlayCost` because a card may declare BOTH this and another
 * optional cost (Kraken Hunter also has Accelerate).
 */
export function getBuffSpendCost(cardId: string): { domain: string } | undefined {
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    if (ability.type !== "static" && ability.type !== "additional-cost-option") {
      continue;
    }
    const effect = ability.effect as
      | { type?: string; additionalCost?: { spendBuff?: string; reducePower?: string } }
      | undefined;
    if (effect?.type !== "additional-cost-option") {
      continue;
    }
    const spec = effect.additionalCost;
    if (spec?.spendBuff === "any" && typeof spec.reducePower === "string") {
      return { domain: spec.reducePower };
    }
  }
  return undefined;
}

/**
 * rule-id: ogn-231-298 (rule 356.2.b / 356.4) — "you may kill any number of
 * friendly units as an additional cost. Reduce my cost by [D] for each killed
 * this way." Returns the domain pip waived per kill plus the target descriptor
 * naming what may be killed. Kept out of `getOptionalPlayCost` because the
 * count is variable, so it prices like the buff-spend cost, not a single kill.
 */
export function getKillAnyNumberCost(
  cardId: string,
): { domain: string; target: unknown } | undefined {
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    if (ability.type !== "static" && ability.type !== "additional-cost-option") {
      continue;
    }
    const effect = ability.effect as
      | {
          type?: string;
          additionalCost?: { killAnyNumber?: unknown };
          ifPaid?: { reducePower?: string };
        }
      | undefined;
    if (effect?.type !== "additional-cost-option") {
      continue;
    }
    const target = effect.additionalCost?.killAnyNumber;
    const domain = effect.ifPaid?.reducePower;
    if (target !== undefined && typeof domain === "string") {
      return { domain, target };
    }
  }
  return undefined;
}

/**
 * rule-id: unl-170-219 (rule 356.4) — "you may kill a friendly unit as an
 * additional cost to play me. If you do, I cost [1] less for each Energy it
 * costs and [D] less for each Power it costs." Prices ONE named victim: the
 * Energy discount is its printed Energy cost, and each of its Power pips (of
 * ANY Domain) waives one [D] pip. Undefined when the played card carries no
 * `sacrificeCostDiscount` marker.
 */
export function getSacrificeCostDiscount(
  cardId: string,
  sacrificeId: string,
): { energy: number; power: Partial<Record<string, number>> } | undefined {
  const registry = getGlobalCardRegistry();
  const marker = registry.get(cardId)?.sacrificeCostDiscount;
  if (!marker) {
    return undefined;
  }
  const pips = registry.getPowerCost(sacrificeId).length;
  return {
    energy: registry.getEnergyCost(sacrificeId),
    power: pips > 0 ? { [marker.powerDomain]: pips } : {},
  };
}

export type RepeatTiers = readonly { energy: number; power: readonly string[] }[];

/**
 * rule-id: unl-146-219 — a spell's effective Repeat tiers: its own printed
 * Repeat instances plus any granted by the caster's board permanents ("your
 * spells have [Repeat] [2][chaos]"). Rule 820.3: each instance is a
 * separately payable tier. Undefined when the spell has no Repeat at all.
 */
export function getEffectiveSpellRepeatCost(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  board?: CostExtras["board"],
): RepeatTiers | undefined {
  const intrinsic = getGlobalCardRegistry().getSpellRepeatCost(cardId) ?? [];
  const granted = board
    ? computeGrantedSpellRepeatCost({ draft: state, ...board }, playerId, cardId)
    : [];
  // rule-id: sfd-078-221 / unl-216-219 (rule 206) — a pending "next spell you
  // play this turn has [Repeat] equal to its cost" grant prices its tier at the
  // spell's PRINTED cost; additional costs (a mandatory kill) are not folded in.
  const pending = Math.max(0, (state as { nextSpellRepeat?: Record<string, number> }).nextSpellRepeat?.[playerId] ?? 0);
  const nextSpellTiers: { energy: number; power: readonly string[] }[] = [];
  if (pending > 0 && getGlobalCardRegistry().getCardType(cardId) === "spell") {
    const printed = {
      energy: getGlobalCardRegistry().getEnergyCost(cardId),
      power: [...getGlobalCardRegistry().getPowerCost(cardId)],
    };
    for (let i = 0; i < pending; i++) {
      nextSpellTiers.push(printed);
    }
  }
  let tiers: RepeatTiers = [...intrinsic, ...granted, ...nextSpellTiers];
  // rule-id: sfd-211-221 (rules 356.4.c, 356.6) — "friendly [Repeat] costs
  // cost [1] less" discounts EVERY tier's energy part; a [rainbow]-only tier
  // has no energy to reduce and stays as printed.
  const perTier = board ? computeStaticRepeatCostReduction({ draft: state, ...board }, playerId) : 0;
  if (perTier > 0) {
    tiers = tiers.map((t) => ({ ...t, energy: Math.max(0, t.energy - perTier) }));
  }
  // rule-id: sfd-149-221 (rules 356.4.c, 356.4.c.1) — "Optional additional
  // costs you pay cost [1] or [rainbow] less": each Repeat tier is an optional
  // additional cost, and the payer chooses which half of the tier each
  // reduction shaves off. Resolve that choice against the pool so a tier that
  // could go either way is dropped from whichever resource is short.
  const flex = board
    ? computeOptionalAdditionalCostFlexReduction({ draft: state, ...board }, playerId)
    : 0;
  if (flex > 0) {
    tiers = applyFlexibleRepeatReduction(tiers, flex, availablePowerForRepeats(state, playerId, cardId));
  }
  return tiers.length > 0 ? tiers : undefined;
}

/** Power pips left over for [Repeat] costs once the printed cost is covered. */
function availablePowerForRepeats(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
): number {
  const pool = state.runePools[playerId];
  if (!pool) {
    return 0;
  }
  const have = Object.values(pool.power).reduce((a, b) => a + (b ?? 0), 0);
  const printed = getGlobalCardRegistry().getPowerCost(cardId)?.length ?? 0;
  return Math.max(0, have - printed);
}

/**
 * rule 356.4.c.1 — apply `flex` "one Energy OR one Power pip less" reductions
 * to every tier. A tier with only one kind of cost left has no choice; a tier
 * with both defers to the pool: shave the Energy when the remaining pips are
 * still payable, otherwise shave a pip.
 */
function applyFlexibleRepeatReduction(
  tiers: RepeatTiers,
  flex: number,
  availablePower: number,
): RepeatTiers {
  const work = tiers.map((t) => ({ energy: t.energy, power: [...t.power] }));
  const pending: number[] = [];
  for (const [i, tier] of work.entries()) {
    for (let n = 0; n < flex; n++) {
      if (tier.energy > 0 && tier.power.length > 0) {
        pending.push(i);
      } else if (tier.energy > 0) {
        tier.energy -= 1;
      } else if (tier.power.length > 0) {
        tier.power.pop();
      }
    }
  }
  let pips = work.reduce((a, t) => a + t.power.length, 0);
  for (const i of pending) {
    const tier = work[i] as { energy: number; power: string[] };
    if (tier.energy > 0 && pips <= availablePower) {
      tier.energy -= 1;
    } else if (tier.power.length > 0) {
      tier.power.pop();
      pips -= 1;
    } else if (tier.energy > 0) {
      tier.energy -= 1;
    }
  }
  return work;
}

/**
 * rule 315.2.b / 467 — points this player scored THIS turn from HOLDING.
 * `scoredThisTurn` records every battlefield scored by either method, so the
 * ones taken by conquering (`conqueredThisTurn`) are removed.
 */
function countHoldPointsThisTurn(state: RiftboundGameState, playerId: string): number {
  // Points actually GAINED from holding (a denied / replaced Hold scored 0).
  return pointsGainedThisTurn(state, playerId, "hold");
}

/**
 * rule 356.6 (rule-id: ven-119-166) — the POWER half of a self static
 * "I cost [N][domain] less if CONDITION". `getSelfConditionalEnergyReduction`
 * only removes the energy component; the pips in the same reduction have to be
 * waived from the printed power cost too, neither component below 0.
 */
function getSelfConditionalPowerReduction(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  // rule 824 (rule-id: unl-059-219) — a tier worded "… less INSTEAD" replaces
  // the lower tiers' pips rather than stacking with them, so the active
  // "instead" tiers are collected apart and only the largest is waived.
  const instead: Partial<Record<string, number>>[] = [];
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    if (ability?.type !== "static") {
      continue;
    }
    const { effect, condition } = ability as {
      effect?: { type?: string; target?: unknown; scope?: unknown; by?: unknown; reduction?: unknown; amount?: unknown; instead?: unknown };
      condition?: Record<string, unknown>;
    };
    if (effect?.type !== "cost-reduction" || effect.target !== "self") {
      continue;
    }
    // rule 824 (rule-id: unl-059-219) — `scope:"instead"` is the stacking rule
    // of a [Level N] tier, not a "for each …" scaling scope: it must not divert
    // the tier to the scaled path, which would drop the discount entirely.
    if (
      (effect.scope !== undefined && effect.scope !== "instead") ||
      effect.by !== undefined ||
      !condition
    ) {
      continue;
    }
    if (
      evaluateEnterReadyCondition(
        condition,
        state,
        playerId,
        cardId,
        extras.board?.zones,
        extras.board?.cards,
      ) !== true
    ) {
      continue;
    }
    const pips = decodeCostAmount(effect.reduction ?? effect.amount).power;
    if (effect.instead === true) {
      instead.push(pips);
      continue;
    }
    for (const [domain, n] of Object.entries(pips)) {
      if (n && n > 0) {
        out[domain] = (out[domain] ?? 0) + n;
      }
    }
  }
  if (instead.length > 0) {
    const totalPips = (p: Partial<Record<string, number>>): number =>
      Object.values(p).reduce((a, n) => a + (n ?? 0), 0);
    const best = instead.reduce((a, b) => (totalPips(b) > totalPips(a) ? b : a));
    return Object.fromEntries(Object.entries(best).filter(([, n]) => (n ?? 0) > 0));
  }
  return out;
}

/**
 * rule 466 (rule-id: sfd-055-221) — the POWER half of a self static
 * "I cost [N][domain] less for each …". `getSelfScaledEnergyReduction` only
 * yields energy; the pips it decodes have to be waived from the printed power
 * cost as well, so they are returned here and merged into the waived-power map.
 */
function getSelfScaledPowerReduction(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
): Partial<Record<string, number>> {
  if (!extras.board?.zones) {
    return {};
  }
  const out: Partial<Record<string, number>> = getSelfConditionalPowerReduction(
    state,
    playerId,
    cardId,
    extras,
  );
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    if (ability?.type !== "static") {
      continue;
    }
    const effect = ability.effect as
      | { type?: string; target?: unknown; scope?: unknown; reduction?: unknown; amount?: unknown; by?: unknown }
      | undefined;
    if (effect?.type !== "cost-reduction" || effect.target !== "self") {
      continue;
    }
    if (typeof effect.scope !== "string") {
      continue;
    }
    if (!effect.scope.toLowerCase().startsWith("for each point you scored from holding this turn")) {
      continue;
    }
    const count = countHoldPointsThisTurn(state, playerId);
    if (count <= 0) {
      continue;
    }
    const pips = decodeCostAmount(effect.reduction ?? effect.amount ?? effect.by).power;
    for (const [domain, n] of Object.entries(pips)) {
      if (n && n > 0) {
        out[domain] = (out[domain] ?? 0) + n * count;
      }
    }
  }
  return out;
}

/**
 * rule-id: ven-096-166 (rule 466) — the played card's OWN static
 * "I cost [N] less for each …" reduction, scaled by a countable scope read
 * off the trash. Board statics skip the played card, and `costModifier` is
 * only written by triggered effects, so a self static on a card in hand needs
 * its own path. Unrecognised scopes contribute 0.
 */
/**
 * rule 356.4 (rule-id: sfd-010-221 / sfd-164-221) — the printed energy value of
 * a card's own "I cost [N] less to play from anywhere other than your hand"
 * static. Callers that already know the play's origin is not the owner's hand
 * (a play out of trash / banishment / deck resolved by an effect) apply it
 * directly; `canAffordCard`'s path checks the hand itself.
 */
export function getNotHandSelfEnergyReduction(cardId: string): number {
  let total = 0;
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    if (ability?.type !== "static") continue;
    const effect = ability.effect as
      | { type?: string; target?: unknown; whenPlayedFrom?: unknown; by?: unknown; reduction?: unknown; amount?: unknown }
      | undefined;
    if (
      effect?.type !== "cost-reduction" ||
      effect.target !== "self" ||
      effect.whenPlayedFrom !== "not-hand"
    ) {
      continue;
    }
    total += Math.max(0, decodeCostAmount(effect.by ?? effect.reduction ?? effect.amount).energy);
  }
  return total;
}

/**
 * rule 356.4 — a card's OWN scaled/gated self discount ("Reduce my cost by [1]
 * for each … among your units"). It lives on the card being played, so
 * `computeStaticCostReduction` (which walks board permanents and skips the
 * played card) never sees it; any surface that prices a hand card — the pay
 * bar included — has to add this on top or it shows a cost the engine will not
 * charge.
 */
export function getSelfScaledEnergyReduction(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
): number {
  const zones = extras.board?.zones;
  if (!zones) {
    return 0;
  }
  const registry = getGlobalCardRegistry();
  let total = 0;
  for (const ability of registry.getAbilities(cardId) ?? []) {
    if (ability?.type !== "static") {
      continue;
    }
    const effect = ability.effect as
      | { type?: string; target?: unknown; scope?: unknown; reduction?: unknown; amount?: unknown; by?: unknown }
      | undefined;
    if (effect?.type !== "cost-reduction" || effect.target !== "self") {
      continue;
    }
    // rule 356.4 / 466 (rule-id: ven-059-166) — "This costs [N] less if you
    // control something that's [Empowered]": a flat self-discount gated on a
    // board CONDITION rather than a countable scope. "Something" is any
    // permanent — unit, gear or equipment — and only ones the caster controls.
    const gate = (effect as { condition?: { type?: string; controller?: string } }).condition;
    if (gate?.type === "control-empowered") {
      const cards = extras.board?.cards;
      const wantEnemy = gate.controller === "enemy";
      const controlsEmpowered = (id: CoreCardId): boolean => {
        if ((id as string) === cardId) return false;
        const meta = cards?.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined;
        if (meta?.empowered !== true) return false;
        const controller = cards?.getCardController?.(id) ?? cards?.getCardOwner(id);
        return wantEnemy ? controller !== playerId : controller === playerId;
      };
      // rule 441 (rule-id: ven-195-166) — "something" is any game object you
      // control, and a LEGEND is one: scan every per-player board zone, not
      // just base.
      const PLAYER_BOARD_ZONES = ["base", "legendZone", "championZone"] as const;
      const scanPlayer = (owner: string): boolean =>
        PLAYER_BOARD_ZONES.some((zoneId) =>
          zones.getCardsInZone(zoneId as CoreZoneId, owner as CorePlayerId).some(controlsEmpowered),
        );
      let found = scanPlayer(playerId);
      if (!found && wantEnemy) {
        for (const other of Object.keys(state.players ?? {})) {
          if (other === playerId) continue;
          if (scanPlayer(other)) {
            found = true;
            break;
          }
        }
      }
      if (!found) {
        for (const bfId of Object.keys(state.battlefields ?? {})) {
          if (zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId).some(controlsEmpowered)) {
            found = true;
            break;
          }
        }
      }
      if (found) {
        total += Math.max(0, decodeCostAmount(effect.by ?? effect.reduction ?? effect.amount).energy);
      }
      continue;
    }
    // rule 356.4 (rule-id: sfd-164-221) — "I cost [N] less to play from
    // anywhere other than your hand": a flat self-discount gated on the play's
    // origin zone. A [Flow] play always comes from the trash (rule 829.1.b).
    if ((effect as { whenPlayedFrom?: unknown }).whenPlayedFrom === "not-hand") {
      // rule 356.4 (rule-id: sfd-010-221) — the gate reads the play's ORIGIN
      // zone, not the play mode: any play of the card while it is not in its
      // owner's hand (trash / banishment / deck) is discounted too.
      const inHand = zones
        .getCardsInZone("hand" as CoreZoneId, playerId as CorePlayerId)
        .some((id) => (id as string) === cardId);
      if (extras.viaFlow || !inHand) {
        total += Math.max(0, decodeCostAmount(effect.by ?? effect.reduction ?? effect.amount).energy);
      }
      continue;
    }
    // rule 356.4 / rule-id: ogn-014-298 — "This spell's Energy cost is reduced
    // by the highest Might among units you control": a flat discount equal to
    // the current (effective) Might of the caster's mightiest unit on the board.
    if (typeof effect.by === "string" && /highest might among units you control/i.test(effect.by)) {
      const cards = extras.board?.cards;
      let highest = 0;
      const consider = (id: CoreCardId): void => {
        if (registry.getCardType(id as string) !== "unit") return;
        const controller = cards?.getCardController?.(id) ?? cards?.getCardOwner(id);
        if (controller !== playerId) return;
        highest = Math.max(highest, getCardEffectiveMight(id as string, cards?.getCardMeta));
      };
      for (const id of zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId)) consider(id);
      for (const bfId of Object.keys(state.battlefields ?? {})) {
        for (const id of zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)) consider(id);
      }
      total += highest;
      continue;
    }
    if (typeof effect.scope !== "string") {
      continue;
    }
    const scope = effect.scope.toLowerCase();
    let count = 0;
    // rule 356.4.e / 419.1 (rule-id: sfd-012-221) — "I cost [1] less for each
    // card you've played this turn, to a minimum of [1]": only CARDS you
    // finalized this turn count (tokens are not cards — rule 350.2 — and hiding
    // is not playing), and this card never counts itself because its cost is
    // determined before it is finalized. The printed minimum floors THIS
    // discount alone, so clamp it here rather than at the summed cost.
    if (scope.startsWith("for each card you've played this turn")) {
      const played = state.cardsPlayedThisTurn?.[playerId] ?? 0;
      const perCard = Math.max(
        0,
        decodeCostAmount(effect.reduction ?? effect.amount ?? effect.by).energy,
      );
      const floorText = /to a minimum of\s+(.+)$/.exec(scope);
      const floor = floorText ? decodeCostAmount(floorText[1]).energy : 0;
      const printed = registry.getEnergyCost(cardId) ?? 0;
      total += Math.max(0, Math.min(perCard * played, Math.max(0, printed - floor)));
      continue;
    }
    // rule 315.2.b / 467 (rule-id: sfd-055-221) — "for each point you scored
    // from holding this turn": only Beginning-Phase holds count, so the
    // battlefields this player took by CONQUERING are excluded, and the
    // opponent's own scoring is irrelevant.
    if (scope.startsWith("for each point you scored from holding this turn")) {
      count = countHoldPointsThisTurn(state, playerId);
    } else if (/^for each of your \[?mighty\]? units?/.test(scope)) {
      // rule 710 (rule-id: sfd-103-221) — "Mighty" reads CURRENT Might on the
      // board (buffs count, damage never lowers Might), only units you control,
      // and never the copy being played (it is on the chain, not in your base).
      const cards = extras.board?.cards;
      const consider = (id: CoreCardId): void => {
        if ((id as string) === cardId) return;
        if (registry.getCardType(id as string) !== "unit") return;
        const controller = cards?.getCardController?.(id) ?? cards?.getCardOwner(id);
        if (controller !== playerId) return;
        if (getCardEffectiveMight(id as string, cards?.getCardMeta) >= 5) count += 1;
      };
      for (const id of zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId)) {
        consider(id);
      }
      for (const bfId of Object.keys(state.battlefields ?? {})) {
        for (const id of zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)) consider(id);
      }
    } else if (scope.startsWith("for each of the following tags among your units")) {
      // rule 356.4 (rule-id: unl-196-219) — the discount counts DISTINCT listed
      // tags present among the units you control (0–4), not units: two Poros
      // count once and an enemy's Cat counts for nothing.
      count = countDistinctTagsAmongUnits(
        zones,
        extras.board?.cards,
        Object.keys(state.battlefields ?? {}),
        playerId,
        ((effect as { distinctTags?: readonly string[] }).distinctTags ?? []),
      );
    } else if (/^for each (?:other )?gear you control/.test(scope)) {
      // rule 356.4 / 108.2 (rule-id: ven-064-166) — "for each gear you control"
      // reads the board when the cost is determined: control, not ownership, so
      // an opponent's gear never counts. The card being played is on the chain,
      // not on the board, so it never counts itself.
      const cards = extras.board?.cards;
      const consider = (id: CoreCardId): void => {
        if ((id as string) === cardId) return;
        const type = registry.getCardType(id as string);
        if (type !== "gear" && type !== "equipment") return;
        const controller = cards?.getCardController?.(id) ?? cards?.getCardOwner(id);
        if (controller !== playerId) return;
        count += 1;
      };
      for (const id of zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId)) {
        consider(id);
      }
      for (const bfId of Object.keys(state.battlefields ?? {})) {
        for (const id of zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)) {
          consider(id);
        }
      }
    } else if (scope.startsWith("for each card with my name in your trash")) {
      // rule 419.1 (rule-id: ven-096-166) — playing a card puts it on the chain
      // BEFORE its cost is determined, so a card played out of the trash never
      // counts itself; only the other copies still there reduce the cost.
      const name = registry.get(cardId)?.name;
      const trash = zones.getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId);
      count = name
        ? trash.filter((id) => (id as string) !== cardId && registry.get(id as string)?.name === name)
            .length
        : 0;
    } else if (scope.startsWith("for each card in your trash")) {
      // rule-id: ogn-195-298 — same shape, unfiltered trash count.
      count = zones
        .getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId)
        .filter((id) => (id as string) !== cardId).length;
    }
    if (count <= 0) {
      continue;
    }
    const per = decodeCostAmount(effect.reduction ?? effect.amount ?? effect.by).energy;
    total += Math.max(0, per) * count;
  }
  return total;
}

/**
 * rule 356.4.f (rule-id: sfd-103-221) — "Discounts can reduce additional costs,
 * including to 0." A discount larger than the printed Energy cost is not lost:
 * the overflow keeps eating the Energy half of an optional additional cost
 * (e.g. [Accelerate]'s [1]). Paying 0 still counts as paying it (356.4.f.1).
 */
function applyDiscountOverflowToAdditionalCost(additionalEnergy: number, discounted: number): number {
  // A negative "additional cost" is a discount rider ("if you do, I cost [N]
  // less") — it is never clamped, only real extra Energy is.
  if (additionalEnergy <= 0) {
    return additionalEnergy;
  }
  return Math.max(0, additionalEnergy - Math.max(0, -discounted));
}

/** Per-domain tally of an optional additional cost's power pips. */
export function additionalCostPower(extras: CostExtras): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  for (const d of extras.additionalCost?.power ?? []) {
    out[d] = (out[d] ?? 0) + 1;
  }
  return out;
}

/**
 * rule 805.1.a.1 / 135.2.e.5 — walk an optional additional cost's pips against
 * a power pool. A named-domain pip is paid from that domain, falling back to
 * pooled [rainbow] Power (rule 135.2.e.5.b); a [rainbow] pip is paid from any
 * domain (rule 135.2.e.5.a). Returns the leftover pool, or undefined when the
 * cost cannot be met.
 */
function walkOptionalPlayCostPower(
  power: Partial<Record<string, number>>,
  pips: readonly string[],
): Record<string, number> | undefined {
  const remaining: Record<string, number> = {};
  for (const [d, v] of Object.entries(power)) {
    if (typeof v === "number" && v > 0) {
      remaining[d] = v;
    }
  }
  for (const domain of pips) {
    if (domain === "rainbow") {
      const any = Object.keys(remaining).find((k) => (remaining[k] ?? 0) > 0);
      if (any === undefined) {
        return undefined;
      }
      remaining[any] -= 1;
      continue;
    }
    if ((remaining[domain] ?? 0) > 0) {
      remaining[domain] -= 1;
      continue;
    }
    if ((remaining.rainbow ?? 0) > 0) {
      remaining.rainbow -= 1;
      continue;
    }
    return undefined;
  }
  return remaining;
}

/**
 * rule 356.4.c / 356.4.c.1 (sfd-149-221 Ezreal, Prodigy) — apply `flex`
 * "one Energy OR one Power pip less" reductions to an optional additional cost
 * (e.g. [Accelerate]'s [1][fury]). The payer picks which half each reduction
 * shaves, so resolve the choice against the pool: drop the Energy while the
 * remaining pips stay payable, otherwise drop a pip.
 */
export function applyFlexibleOptionalCostReduction(
  cost: { energy?: number; power?: readonly string[] },
  flex: number,
  pool: { energy: number; power: Partial<Record<string, number>> } | undefined,
): { energy: number; power: readonly string[] } {
  let energy = cost.energy ?? 0;
  let pips = [...(cost.power ?? [])];
  const payable = (list: readonly string[]): boolean =>
    pool === undefined || walkOptionalPlayCostPower(pool.power, list) !== undefined;
  for (let i = 0; i < flex; i++) {
    if (energy > 0 && payable(pips)) {
      energy -= 1;
      continue;
    }
    if (pips.length > 0) {
      // rule 356.4.c.1: drop whichever pip the pool cannot cover.
      const drop = pips.findIndex((_, idx) => payable(pips.filter((__, j) => j !== idx)));
      pips = pips.filter((_, idx) => idx !== (drop >= 0 ? drop : pips.length - 1));
      continue;
    }
    if (energy > 0) {
      energy -= 1;
    }
  }
  return { energy, power: pips };
}

/**
 * rule 356.4.c (sfd-149-221) — the optional additional cost `cost` as the
 * player actually pays it, after friendly "optional additional costs you pay
 * cost [1] or [rainbow] less" statics. Returns `cost` unchanged when no such
 * static is on the board (or no board accessors were supplied).
 */
export function discountOptionalPlayCost(
  state: RiftboundGameState,
  playerId: string,
  cost: { energy?: number; power?: readonly string[] } | undefined,
  board: CostExtras["board"] | undefined,
): { energy: number; power: readonly string[] } | undefined {
  if (!cost || !board) {
    return cost === undefined ? undefined : { energy: cost.energy ?? 0, power: cost.power ?? [] };
  }
  const flex = computeOptionalAdditionalCostFlexReduction({ draft: state, ...board }, playerId);
  if (flex <= 0) {
    return { energy: cost.energy ?? 0, power: cost.power ?? [] };
  }
  return applyFlexibleOptionalCostReduction(cost, flex, state.runePools[playerId]);
}

/** rule 356.1.b.3 / 805.1.a — can `pool` pay this optional additional cost right now? */
export function canPayOptionalPlayCost(
  pool: { energy: number; power: Partial<Record<string, number>> } | undefined,
  cost: { energy?: number; power?: readonly string[] } | undefined,
): boolean {
  if (!pool) {
    return false;
  }
  if (!cost) {
    return true;
  }
  if (pool.energy < (cost.energy ?? 0)) {
    return false;
  }
  return walkOptionalPlayCostPower(pool.power, cost.power ?? []) !== undefined;
}

/** rule 356.1.b.3 / 805.1.a — spend an optional additional cost from `pool`. */
export function payOptionalPlayCost(
  pool: { energy: number; power: Partial<Record<string, number>> },
  cost: { energy?: number; power?: readonly string[] } | undefined,
): void {
  if (!cost) {
    return;
  }
  pool.energy = Math.max(0, pool.energy - (cost.energy ?? 0));
  const left = walkOptionalPlayCostPower(pool.power, cost.power ?? []);
  if (!left) {
    return;
  }
  for (const domain of Object.keys(pool.power)) {
    (pool.power as Record<string, number>)[domain] = left[domain] ?? 0;
  }
}

/**
 * Compute the total Repeat surcharge (energy) for a spell being played
 * with `repeatCount` additional effects. `tiers` overrides the printed
 * Repeat cost (rule-id: unl-146-219 — board-granted Repeat).
 */
export function getRepeatEnergySurcharge(
  cardId: string,
  repeatCount: number,
  tiers: RepeatTiers | undefined = getGlobalCardRegistry().getSpellRepeatCost(cardId),
): number {
  if (repeatCount <= 0) {
    return 0;
  }
  if (!tiers || tiers.length === 0) {
    return 0;
  }
  // Rule 820.1.c.2 / 820.1.c.3 / 820.3: nth repeat pays tiers[n-1]. A
  // single-tier Repeat applies its cost to every repeat, so clamp the
  // index instead of stopping at tiers.length.
  let energy = 0;
  for (let i = 0; i < repeatCount; i++) {
    energy += tiers[Math.min(i, tiers.length - 1)].energy;
  }
  return energy;
}

/**
 * Compute the total Repeat surcharge (power, per domain) for a spell
 * being played with `repeatCount` additional effects.
 * Rule 820.1.c.2 / 820.1.c.3 / 820.3.
 */
export function getRepeatPowerSurcharge(
  cardId: string,
  repeatCount: number,
  tiers: RepeatTiers | undefined = getGlobalCardRegistry().getSpellRepeatCost(cardId),
): Partial<Record<string, number>> {
  if (repeatCount <= 0) {
    return {};
  }
  if (!tiers || tiers.length === 0) {
    return {};
  }
  const power: Partial<Record<string, number>> = {};
  for (let i = 0; i < repeatCount; i++) {
    for (const domain of tiers[Math.min(i, tiers.length - 1)].power) {
      power[domain] = (power[domain] ?? 0) + 1;
    }
  }
  return power;
}

/**
 * Rule 357.1.a permits activating rune Add-abilities during Pay Costs, but by
 * design the engine requires the player to exhaust runes explicitly first —
 * crediting ready runes here made the enumerator offer plays the reducer then
 * under-charged for. Returns 0; kept for existing callsites.
 */
export function getPotentialRuneEnergy(
  _zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  _counters: { getFlag: (cardId: CoreCardId, flag: string) => boolean | undefined },
  _playerId: string,
): number {
  return 0;
}

/**
 * rule-id: ven-113-166 (rule 829.1.b) — a card's [Flow] cost, whether printed
 * as a keyword or granted this turn by an effect ("give a spell in your trash
 * [Flow] equal to its cost"). Granted Flow is card meta, so every reader that
 * offers or prices a play from the trash must consult it, not just the
 * registry's printed keyword.
 */
export function getFlowCostForPlay(
  cardId: string,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): { energy: number; power: readonly string[] } | undefined {
  return getFlowCostOptionsForPlay(cardId, getCardMeta)[0];
}

/**
 * rule 829.1.c.3 (rule-id: ven-113-166) — a card may carry SEVERAL [Flow]
 * instances (a printed one plus one granted this turn); its controller chooses
 * which Flow cost to pay. Printed first, then granted.
 */
export function getFlowCostOptionsForPlay(
  cardId: string,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): { energy: number; power: readonly string[] }[] {
  const options: { energy: number; power: readonly string[] }[] = [];
  const printed = getGlobalCardRegistry().getSpellFlowCost(cardId);
  if (printed) {
    options.push(printed);
  }
  const granted = getCardMeta?.(cardId as CoreCardId)?.grantedFlow;
  if (granted) {
    options.push({ energy: granted.energy, power: granted.power });
  }
  return options;
}

/**
 * rule 829.1.c.3 — with more than one [Flow] cost available the controller
 * picks; the engine picks for them by preferring a cost the current pool can
 * actually cover (cheapest Energy first), falling back to the printed one.
 */
function chooseFlowCost(
  cardId: string,
  getCardMeta: ((cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined) | undefined,
  pool: { energy: number; power: Partial<Record<string, number>> } | undefined,
): { energy: number; power: readonly string[] } | undefined {
  const options = getFlowCostOptionsForPlay(cardId, getCardMeta);
  if (options.length <= 1 || !pool) {
    return options[0];
  }
  const payable = options
    .filter((option) => option.energy <= pool.energy && planPowerFromPool(option.power, pool.power))
    .sort((a, b) => a.energy - b.energy);
  return payable[0] ?? options[0];
}

/** Can `pips` be paid out of `have` (own domain, else pooled [rainbow])? */
function planPowerFromPool(
  pips: readonly string[],
  have: Partial<Record<string, number>>,
): boolean {
  const left: Record<string, number> = {};
  for (const [domain, count] of Object.entries(have)) {
    left[domain] = count ?? 0;
  }
  for (const pip of pips) {
    if (pip !== "rainbow" && (left[pip] ?? 0) > 0) {
      left[pip] = (left[pip] ?? 0) - 1;
      continue;
    }
    const wild = Object.keys(left).find((d) => (left[d] ?? 0) > 0);
    if (pip === "rainbow" && wild !== undefined) {
      left[wild] = (left[wild] ?? 0) - 1;
      continue;
    }
    if ((left.rainbow ?? 0) > 0) {
      left.rainbow = (left.rainbow ?? 0) - 1;
      continue;
    }
    return false;
  }
  return true;
}

/**
 * rule-id: ven-049-166 — resolve the base cost to charge for a play. Normally
 * the printed cost; when playing via [Flow] from the trash, the card's Flow
 * keyword cost replaces the printed cost.
 */
/**
 * rule 356.1 (rule-id: unl-089-219) — read a card's ALTERNATE play cost
 * ("If you've spent [4] or more to play a spell this turn, you may play me for
 * [mind]"), declared as
 * `{type:"static", condition:{type:"spell-energy-spent-this-turn", amount},
 *   effect:{type:"alternate-play-cost", cost:{energy?, power?}}}`.
 *
 * Returns the replacement cost only when the condition is currently met; an
 * unrecognised condition denies the alternate cost (a cheaper play must never
 * be offered on a guess).
 */
export function getAlternatePlayCost(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
): { energy?: number; power?: readonly string[] } | undefined {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  for (const ability of abilities) {
    if (ability.type !== "static") {
      continue;
    }
    const effect = ability.effect as
      | { type?: string; cost?: { energy?: number; power?: readonly string[] } }
      | undefined;
    if (effect?.type !== "alternate-play-cost") {
      continue;
    }
    const condition = (ability as { condition?: { type?: string; amount?: number } }).condition;
    if (condition !== undefined) {
      if (condition.type !== "spell-energy-spent-this-turn") {
        continue;
      }
      const spent = state.spellEnergySpentThisTurn?.[playerId] ?? 0;
      if (spent < (condition.amount ?? 0)) {
        continue;
      }
    }
    return effect.cost ?? { energy: 0 };
  }
  return undefined;
}

/**
 * rule-id: unl-089-219 — remember the Energy paid to play a SPELL so
 * "if you've spent [4] or more to play a spell this turn" can be evaluated
 * later in the turn. Kept as the largest single-spell spend.
 */
function recordSpellEnergySpent(
  draft: RiftboundGameState,
  playerId: string,
  cardId: string,
  energy: number,
): void {
  if (energy <= 0 || getGlobalCardRegistry().getCardType(cardId) !== "spell") {
    return;
  }
  const ledger = (draft as { spellEnergySpentThisTurn?: Record<string, number> })
    .spellEnergySpentThisTurn ?? {};
  ledger[playerId] = Math.max(ledger[playerId] ?? 0, energy);
  (draft as { spellEnergySpentThisTurn?: Record<string, number> }).spellEnergySpentThisTurn =
    ledger;
}

/**
 * rule 364.3.a (rule-id: sfd-143-221) — "if you've spent at least [rainbow][rainbow]
 * this turn": only POWER actually paid counts, of any domain. Energy paid and power
 * merely sitting in the pool never do.
 */
export function recordPowerSpent(
  draft: RiftboundGameState,
  playerId: string,
  pips: number,
): void {
  if (pips <= 0) {
    return;
  }
  const ledger = (draft as { powerSpentThisTurn?: Record<string, number> })
    .powerSpentThisTurn ?? {};
  ledger[playerId] = (ledger[playerId] ?? 0) + pips;
  (draft as { powerSpentThisTurn?: Record<string, number> }).powerSpentThisTurn = ledger;
}

function totalPowerPips(power: Partial<Record<string, number>>): number {
  return Object.values(power).reduce((a: number, b) => a + (b ?? 0), 0);
}

export function getBaseCostForPlay(
  cardId: string,
  extras: CostExtras,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
  // rule 829.1.c.3 — the pool the play would be paid from, so a card with two
  // [Flow] costs is priced at the one its controller can actually pay.
  pool?: { energy: number; power: Partial<Record<string, number>> },
): { energy: number; power: Partial<Record<string, number>> } {
  const registry = getGlobalCardRegistry();
  // rule 356.1 (rule-id: unl-089-219) — an alternate play cost supplants the
  // printed cost; discounts still apply on top of it.
  if (extras.altCost) {
    const power: Partial<Record<string, number>> = {};
    for (const domain of extras.altCost.power ?? []) {
      power[domain] = (power[domain] ?? 0) + 1;
    }
    return { energy: extras.altCost.energy ?? 0, power };
  }
  if (extras.viaFlow) {
    // rule 829.1.c.3 — the controller's election wins over the engine's guess.
    const elected =
      extras.flowIndex === undefined
        ? undefined
        : getFlowCostOptionsForPlay(cardId, getCardMeta)[extras.flowIndex];
    const flow = elected ?? chooseFlowCost(cardId, getCardMeta, pool);
    if (flow) {
      const power: Partial<Record<string, number>> = {};
      for (const domain of flow.power) {
        power[domain] = (power[domain] ?? 0) + 1;
      }
      return { energy: flow.energy, power };
    }
  }
  return registry.getCostToDeduct(cardId);
}

/**
 * Rule 135.2.e.6.c (rule-id: ven-150-166): a multi-domain card's printed [C]
 * power pips are hybrid — payable only with Power of that card's own Domains,
 * not "any Domain" like a true [rainbow] pip. Returns those Domains for a
 * multi-domain card, otherwise undefined.
 */
/**
 * rule 204.3.b / rule 135.2.e (rule-id: ogn-268-298): "Pay any amount of
 * [rainbow]" — the variable X payment is Power of any Domain, never Energy.
 * Spell abilities declare this with `xCost: "power"`.
 */
export function xCostIsPower(cardId: string): boolean {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  return abilities.some(
    (a) => a?.type === "spell" && (a as { xCost?: unknown }).xCost === "power",
  );
}

export function getHybridPipDomains(cardId: string): string[] | undefined {
  const domain = getGlobalCardRegistry().get(cardId)?.domain;
  return Array.isArray(domain) && domain.length > 1 ? domain : undefined;
}

/**
 * Drain one Power from the most-stocked eligible domain in `pool`. Returns
 * false if nothing eligible remains.
 *
 * rule 357.3 / 805.1.a.1 — `reserve` names Power a SEPARATE cost of the same
 * play still has to be paid from (an [Accelerate] pip of the card's own Domain
 * settled after this one): an any-Domain pip spends a domain the reservation
 * does not need, so a payable assignment is never destroyed by pay order.
 */
function drainOnePowerPip(
  pool: Partial<Record<string, number>>,
  eligible: (domain: string) => boolean,
  reserve?: Partial<Record<string, number>>,
): boolean {
  const key = Object.entries(pool)
    .filter(([d, v]) => (v ?? 0) > 0 && eligible(d))
    .sort(
      ([da, a], [db, b]) =>
        (b ?? 0) - (reserve?.[db] ?? 0) - ((a ?? 0) - (reserve?.[da] ?? 0)) || (b ?? 0) - (a ?? 0),
    )[0]?.[0];
  if (key === undefined) {
    return false;
  }
  pool[key] = (pool[key] ?? 0) - 1;
  return true;
}

/**
 * Check if player can afford a card's cost from their rune pool.
 */
/**
 * rule 429.4 (ogs-014-024 Lux, Crownguard): how much of `playerId`'s Energy pool
 * is earmarked "use only to play spells / gear" for a card type OTHER than the
 * one being played — that much Energy cannot pay for this card.
 */
function getLockedEnergy(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
): number {
  return lockedEnergyForPurpose(
    state,
    playerId,
    getGlobalCardRegistry().getCardType(cardId),
  );
}

/**
 * rule 429.4 — the same earmark ledger read for a purpose that is not a card
 * play: `allowedFor` is the card type being played, or `"ability:<card type>"`
 * for an activated ability of a card of that type (ven-141-166).
 */
export function lockedEnergyForPurpose(
  state: RiftboundGameState,
  playerId: string,
  allowedFor: string | undefined,
): number {
  const entry = (
    state as { restrictedEnergy?: Record<string, Record<string, number>> }
  ).restrictedEnergy?.[playerId];
  if (!entry) {
    return 0;
  }
  let locked = 0;
  for (const [kind, amount] of Object.entries(entry)) {
    if (!energyEarmarkPermits(state, kind, allowedFor)) {
      locked += amount ?? 0;
    }
  }
  return Math.min(locked, state.runePools[playerId]?.energy ?? 0);
}

/**
 * rule 429.4 (unl-197-219 Scorn of the Moon) — "Spend this Energy only during
 * showdowns" is a WHEN earmark, not a what: it funds any card type, but only
 * while a showdown is in progress. Every other earmark names a card type, and
 * a "…or activated abilities of X" clause extends it to `ability:<X>`.
 */
function energyEarmarkPermits(
  state: RiftboundGameState,
  kind: string,
  allowedFor: string | undefined,
): boolean {
  if (kind === "showdown") {
    return showdownInProgress(state);
  }
  if (allowedFor === undefined) {
    return false;
  }
  // rule 429.4 (ven-141-166 Butcher of the Sands) — "only to play units or
  // activated abilities of units".
  if (kind === "unit") {
    return allowedFor === "unit" || allowedFor === "ability:unit";
  }
  // rule 429.4 (sfd-189-221) — the printed gear earmark also funds gear
  // abilities; card data types Equipment cards `equipment`.
  if (kind === "gear") {
    return (
      allowedFor === "gear" ||
      allowedFor === "equipment" ||
      allowedFor === "ability:gear" ||
      allowedFor === "ability:equipment"
    );
  }
  return kind === allowedFor;
}

function showdownInProgress(state: RiftboundGameState): boolean {
  return state.interaction?.showdownStack?.some((sd) => sd.active) ?? false;
}

/**
 * rule 429.4 (ogn-247-298 Daughter of the Void) — the Power half of the earmark:
 * `playerId`'s Rune Pool minus every pip reserved for a purpose OTHER than
 * `allowedFor`. `allowedFor` is the card type being played, or `"ability:<card
 * type>"` for an activated ability such as [Equip]; `undefined` hides every
 * earmarked pip.
 */
function earmarkPermits(kind: string, allowedFor: string | undefined): boolean {
  if (allowedFor === undefined) {
    return false;
  }
  // rule 429.4 — the printed "gear" earmark reads "Use only to play gear or use
  // gear abilities" (sfd-189-221), so it also funds an Equipment's own
  // activated abilities; card data types those cards `equipment`.
  if (kind === "gear") {
    return (
      allowedFor === "equipment" ||
      allowedFor === "gear" ||
      allowedFor === "ability:equipment" ||
      allowedFor === "ability:gear"
    );
  }
  return kind === allowedFor;
}

export function spendablePowerPool(
  state: RiftboundGameState,
  playerId: string,
  allowedFor: string | undefined,
): Partial<Record<string, number>> {
  const pool = state.runePools[playerId]?.power ?? {};
  const entry = (
    state as { restrictedPower?: Record<string, Record<string, Record<string, number>>> }
  ).restrictedPower?.[playerId];
  const available: Record<string, number> = {};
  for (const [d, v] of Object.entries(pool)) {
    if (typeof v === "number" && v > 0) {
      available[d] = v;
    }
  }
  if (!entry) {
    return available;
  }
  for (const [kind, byDomain] of Object.entries(entry)) {
    if (earmarkPermits(kind, allowedFor)) {
      continue;
    }
    for (const [domain, count] of Object.entries(byDomain ?? {})) {
      if (!count) {
        continue;
      }
      available[domain] = Math.max(0, (available[domain] ?? 0) - count);
    }
  }
  return available;
}

/**
 * rule 429.4 — an earmark rides on Power still in the pool; once those pips are
 * spent (necessarily on something the earmark allows) it can no longer tax
 * later payments. Clamp every ledger entry back to what the pool still holds.
 */
export function reconcileRestrictedPower(draft: RiftboundGameState, playerId: string): void {
  const entry = (
    draft as { restrictedPower?: Record<string, Record<string, Record<string, number>>> }
  ).restrictedPower?.[playerId];
  if (!entry) {
    return;
  }
  const pool = draft.runePools[playerId]?.power ?? {};
  for (const byDomain of Object.values(entry)) {
    for (const domain of Object.keys(byDomain ?? {})) {
      const have = (pool as Partial<Record<string, number>>)[domain] ?? 0;
      byDomain[domain] = Math.min(byDomain[domain] ?? 0, have);
    }
  }
}

/**
 * rule 429.4: spending Energy on a card the earmark allows consumes the
 * earmarked portion first, so it stops blocking later plays.
 */
function consumeRestrictedEnergy(
  draft: RiftboundGameState,
  playerId: string,
  cardId: string,
  spent: number,
): void {
  consumeRestrictedEnergyForPurpose(
    draft,
    playerId,
    getGlobalCardRegistry().getCardType(cardId),
    spent,
  );
}

/** rule 429.4 — `consumeRestrictedEnergy` for a non-play purpose (see `lockedEnergyForPurpose`). */
export function consumeRestrictedEnergyForPurpose(
  draft: RiftboundGameState,
  playerId: string,
  allowedFor: string | undefined,
  spent: number,
): void {
  const entry = (
    draft as { restrictedEnergy?: Record<string, Record<string, number>> }
  ).restrictedEnergy?.[playerId];
  if (!entry || spent <= 0) {
    return;
  }
  const cardType = allowedFor;
  let remaining = spent;
  for (const kind of Object.keys(entry)) {
    if (remaining <= 0) {
      break;
    }
    if (!energyEarmarkPermits(draft, kind, cardType)) {
      continue;
    }
    const current = entry[kind] ?? 0;
    const used = Math.min(current, remaining);
    entry[kind] = current - used;
    remaining -= used;
  }
}

/**
 * rule 356.4.f (rule-id: sfd-103-221) — how much Energy discount is left over
 * once the printed Energy cost has been reduced to 0. Callers that charge an
 * optional additional cost outside `deductCost` shave its Energy half by this,
 * because "discounts can reduce additional costs, including to 0".
 */
export function getPlayEnergyDiscountOverflow(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): number {
  const modifier = getCostModifier(cardId, getCardMeta);
  const baseCost = getBaseCostForPlay(cardId, extras, getCardMeta, state.runePools[playerId]);
  const interactive = getInteractiveReduction(cardId, extras.chosenTargetId, getCardMeta);
  const boardReduction = getBoardCostReduction(state, playerId, cardId, extras);
  const selfScaled =
    getSelfScaledEnergyReduction(state, playerId, cardId, extras) +
    getSelfConditionalEnergyReduction(state, playerId, cardId, extras) +
    getSelfLegionEnergyReduction(state, playerId, cardId);
  const nextPlayEnergy = takeNextPlayDiscount(state, playerId, cardId, false).energy;
  const discounted =
    applyStaticCostReduction(Math.max(0, baseCost.energy + modifier), boardReduction) -
    interactive -
    selfScaled -
    nextPlayEnergy;
  return Math.max(0, -discounted);
}

/**
 * rule 356.4.d / 356.4.f — the Power-pip half of `getPlayEnergyDiscountOverflow`:
 * the pip waivers still unspent once the printed pips have been covered.
 * Callers that charge an optional additional cost outside `deductCost` shave
 * its pips by these, because a total-cost discount applies to the additional
 * costs that were added to the total before it.
 */
export function getPlayPowerDiscountOverflow(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): Partial<Record<string, number>> {
  const pool = state.runePools[playerId];
  const baseCost = getBaseCostForPlay(cardId, extras, getCardMeta, pool);
  const boardReduction = getBoardCostReduction(state, playerId, cardId, extras);
  const nextPlay = takeNextPlayDiscount(state, playerId, cardId, false);
  const deflect = offsetDeflectWithWaivedRainbow(
    waivedPower(
      boardReduction,
      extras,
      mergePower(nextPlay.power ?? {}, getSelfScaledPowerReduction(state, playerId, cardId, extras)),
    ),
    getDeflectSurcharge(state, playerId, extras.targets, extras.board?.cards, cardId, extras.board?.zones),
    baseCost.power,
    pool?.power ?? {},
  );
  const after = reducePowerCost(baseCost.power, deflect.waived, pool?.power ?? {});
  return unusedPowerWaivers(deflect.waived, baseCost.power, after);
}

/**
 * rule 356.4.f.1 — drop from an additional cost's pip list every pip a leftover
 * waiver covers (its own Domain first, then any-Domain [rainbow] waivers).
 */
export function applyPowerWaiversToPips(
  pips: readonly string[],
  waived: Partial<Record<string, number>>,
): string[] {
  const left: Partial<Record<string, number>> = { ...waived };
  const out: string[] = [];
  for (const pip of pips) {
    if ((left[pip] ?? 0) > 0) {
      left[pip] = (left[pip] ?? 0) - 1;
      continue;
    }
    if ((left.rainbow ?? 0) > 0) {
      left.rainbow = (left.rainbow ?? 0) - 1;
      continue;
    }
    out.push(pip);
  }
  return out;
}

/**
 * rule 356 — the RESOURCE half of a play's Total Cost after every base-cost
 * modification, additional cost, increase and discount: Energy, named-Domain
 * pips, any-Domain pips (`any` — [rainbow] pips, Deflect, X paid in Power,
 * enemy surcharges) and hybrid pips (a multi-domain card's printed pips,
 * payable only from its own Domains — rule 135.2.e.6.c).
 */
export interface PlayResourceCost {
  /** rule 356.5 — nothing at all is paid ("if you do, ignore my cost"). */
  readonly free: boolean;
  /** rule 356.1.b.2 — the Energy component is ignored (not checked, not paid). */
  readonly ignoreEnergy: boolean;
  readonly energy: number;
  /** Named-Domain pips (never `rainbow`). */
  readonly named: Partial<Record<string, number>>;
  /** Pips payable with Power of ANY Domain. */
  readonly any: number;
  /** Pips payable only from `domains` (or pooled [rainbow] Power). */
  readonly hybrid?: { readonly domains: readonly string[]; readonly n: number };
}

const FREE_PLAY: PlayResourceCost = { any: 0, energy: 0, free: true, ignoreEnergy: false, named: {} };

/**
 * rule 356.1.b.1 / 356.1.b.3 — the total cost of a play whose BASE cost is
 * ignored ("If you do, ignore this spell's cost"): nothing but the increases
 * that apply after the base is zeroed (an enemy static's [rainbow], a
 * turn-scoped runtime surcharge). No discount rider is read or consumed —
 * there is no base left for one to reduce.
 */
function ignoredBaseCost(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
): PlayResourceCost {
  const boardIncrease = getBoardCostIncrease(state, playerId, cardId, extras);
  const energy = boardIncrease.energy + getRuntimePlayCostIncrease(state, playerId, cardId);
  const named: Partial<Record<string, number>> = {};
  let any = 0;
  for (const [domain, n] of Object.entries(boardIncrease.power)) {
    if (!n || n <= 0) {
      continue;
    }
    // rule 356.3 — an added [rainbow] pip is payable with Power of any Domain.
    if (domain === "rainbow") {
      any += n;
    } else {
      named[domain] = (named[domain] ?? 0) + n;
    }
  }
  if (energy === 0 && any === 0 && Object.keys(named).length === 0) {
    return FREE_PLAY;
  }
  return { any, energy, free: false, ignoreEnergy: false, named };
}

/**
 * rule 356 — Determine Total Cost (resources). The ONE computation behind
 * both the affordability gate (`canAffordCard`) and the payment
 * (`deductCost`); `consume` spends one-shot "next card costs N less" riders
 * and must only be set on a draft inside the pay path.
 */
export function computePlayResourceCost(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
  consume = false,
): PlayResourceCost {
  // rule 356.1.b.1 — the elected additional cost waives the card's BASE cost
  // (Energy and Power alike). rule 356.1.b.3 / 356.3 (ven-160-166 Mystic
  // Vortex × ogn-207-298 Call to Glory) — increases are applied AFTER the base
  // is zeroed, so an ignored base never shields the play from them.
  if (extras.ignoreBaseCost) {
    return ignoredBaseCost(state, playerId, cardId, extras);
  }
  // rule 356.4.b / 356.4.c.1 — an "[N] or [rainbow] less" discount is ONE
  // discount whose half the CASTER elects, and the election is made while the
  // cost is determined: elect the half this pool can actually pay rather than
  // guessing from the printed pips alone (other waivers may already cover them).
  if (extras.preferPowerWaiver === undefined) {
    const preferred = prefersPowerWaiver(state, playerId, cardId);
    const elective =
      JSON.stringify(getBoardCostReduction(state, playerId, cardId, { ...extras, preferPowerWaiver: false })) !==
      JSON.stringify(getBoardCostReduction(state, playerId, cardId, { ...extras, preferPowerWaiver: true }));
    let elected = preferred;
    if (elective) {
      const first = computePlayResourceCost(
        state,
        playerId,
        cardId,
        { ...extras, preferPowerWaiver: preferred },
        getCardMeta,
        false,
      );
      if (!canPayResourceCost(state, playerId, cardId, first)) {
        const alt = computePlayResourceCost(
          state,
          playerId,
          cardId,
          { ...extras, preferPowerWaiver: !preferred },
          getCardMeta,
          false,
        );
        if (canPayResourceCost(state, playerId, cardId, alt)) {
          elected = !preferred;
        }
      }
    }
    return computePlayResourceCost(
      state,
      playerId,
      cardId,
      { ...extras, preferPowerWaiver: elected },
      getCardMeta,
      consume,
    );
  }
  const pool = state.runePools[playerId];
  const modifier = getCostModifier(cardId, getCardMeta);
  const baseCost = getBaseCostForPlay(cardId, extras, getCardMeta, pool);
  const interactive = getInteractiveReduction(cardId, extras.chosenTargetId, getCardMeta);
  const xAmount = Math.max(0, extras.xAmount ?? 0);
  // rule 204.3.b / 135.2.e: an X paid in [rainbow] never touches Energy.
  const xPower = xAmount > 0 && xCostIsPower(cardId) ? xAmount : 0;
  const xEnergy = xAmount - xPower;
  const repeatN = Math.max(0, extras.repeatCount ?? 0);
  // rule-id: unl-146-219 — include board-granted Repeat instances.
  const repeatTiers =
    repeatN > 0 ? getEffectiveSpellRepeatCost(state, playerId, cardId, extras.board) : undefined;
  const repeatSurcharge = getRepeatEnergySurcharge(cardId, repeatN, repeatTiers);
  const boardReduction = getBoardCostReduction(state, playerId, cardId, extras);
  // rule 356.3 — opponents' static cost increases, added after all discounts.
  const boardIncrease = getBoardCostIncrease(state, playerId, cardId, extras);
  // rule 356.3 (rule-id: unl-219-219) — turn-scoped runtime surcharges.
  const runtimeIncrease = getRuntimePlayCostIncrease(state, playerId, cardId);
  // rule-id: ven-096-166 — self static "I cost [N] less for each …".
  const selfScaled =
    getSelfScaledEnergyReduction(state, playerId, cardId, extras) +
    getSelfConditionalEnergyReduction(state, playerId, cardId, extras) +
    getSelfLegionEnergyReduction(state, playerId, cardId);
  // rule 356.4.b / 356.6: the one-shot "next spell costs [N] less" (spent only when `consume`).
  const nextPlay = takeNextPlayDiscount(state, playerId, cardId, consume);
  const nextPlayEnergy = nextPlay.energy;
  // rule 353.3 → 353.4 (rule-id: ogn-084-298 × sfd-146-221): increases join the
  // total cost BEFORE any reduction, so a discount — and its own minimum — is
  // measured against the INCREASED cost, not the printed one.
  // rule 820.1.c.1 / 356.2.b.1 — the [Repeat] surcharge is an ADDITIONAL COST of
  // this play, so it joins the total before any discount: rule 356.4.f lets a
  // discount eat an additional cost, and a discount's own minimum (356.4.e) is
  // measured against that total, not against the printed Energy alone.
  const increased =
    Math.max(0, baseCost.energy + modifier) + boardIncrease.energy + runtimeIncrease + repeatSurcharge;
  // rule 356.4.e: a discount's minimum binds only that discount, and the payer
  // orders discounts — floored board auras go first so unfloored ones aren't lost.
  const discounted =
    applyStaticCostReduction(increased, boardReduction) - interactive - selfScaled - nextPlayEnergy;
  const energy = Math.max(
    0,
    Math.max(0, discounted) +
      xEnergy +
      applyDiscountOverflowToAdditionalCost(extras.additionalCost?.energy ?? 0, discounted),
  );

  // Power (domain requirements are not affected by cost modifiers, only by
  // board statics that waive power pips).
  // Rule 820.1.c.2 / 820.3: multi-tier Repeat power costs stack on top.
  // rule 356.4.f / 809.1.d: a [rainbow] discount can cancel the Deflect
  // surcharge (an additional cost added before discounts) or a printed pip —
  // rule 356.4.d.1 lets the payer choose, so resolve it against the pool.
  const deflect = offsetDeflectWithWaivedRainbow(
    // rule 466 (rule-id: sfd-055-221) — a self scaled discount can waive power
    // pips as well as energy.
    waivedPower(
      boardReduction,
      extras,
      mergePower(nextPlay.power ?? {}, getSelfScaledPowerReduction(state, playerId, cardId, extras)),
    ),
    getDeflectSurcharge(state, playerId, extras.targets, extras.board?.cards, cardId, extras.board?.zones),
    baseCost.power,
    pool?.power ?? {},
  );
  const basePower = reducePowerCost(baseCost.power, deflect.waived, pool?.power ?? {});
  const repeatPower = getRepeatPowerSurcharge(cardId, repeatN, repeatTiers);
  // rule 356.4.d / 356.4.f — optional additional costs (Accelerate's [1][D])
  // join the total cost BEFORE a total-cost discount is applied, so pip
  // waivers the printed cost did not consume spill onto them, exactly as
  // `applyDiscountOverflowToAdditionalCost` does for the Energy half.
  const spillWaivers = unusedPowerWaivers(deflect.waived, baseCost.power, basePower);
  const additionalPower = additionalCostPower(extras);
  const spillPower = reducePowerCost(additionalPower, spillWaivers, pool?.power ?? {});
  // rule 356.4.d / 356.4.f (rule-id: ven-055-166 × ven-045-166) — a total-cost
  // discount is measured against the INCREASED total (356.3 increases are part
  // of it), so a pip waiver the printed cost and the additional costs did not
  // consume also cancels a pip an opponent's static ADDED.
  const increasePower = reducePowerCost(
    boardIncrease.power,
    unusedPowerWaivers(spillWaivers, additionalPower, spillPower),
    pool?.power ?? {},
  );
  // rule 356.3 — an enemy static's [rainbow] surcharge is an added pip, not a
  // printed one, so it is never covered by a hybrid/domain restriction.
  const extraPower = mergePower(spillPower, increasePower);
  const powerDomains = new Set([
    ...Object.keys(basePower),
    ...Object.keys(repeatPower),
    ...Object.keys(extraPower),
  ]);
  // Rule 135.2.e.5.a: [rainbow] pips are payable with Power of any Domain.
  // Rule 721.1.c / 721.1.c.1 (unl-030-219): the Deflect surcharge is Power of
  // any Domain, so it joins the rainbow requirement rather than energy.
  let any = deflect.surcharge + xPower;
  // Rule 135.2.e.6.c (rule-id: ven-150-166): a multi-domain card's printed
  // pips are hybrid — payable only from the card's own Domains.
  const hybridDomains = getHybridPipDomains(cardId);
  let hybridNeed = 0;
  const named: Partial<Record<string, number>> = {};
  for (const domain of powerDomains) {
    const need =
      (basePower[domain] ?? 0) +
      (repeatPower[domain] ?? 0) +
      (extraPower[domain] ?? 0);
    if (domain === "rainbow") {
      const printed = need - (extraPower[domain] ?? 0);
      if (hybridDomains) {
        hybridNeed += printed;
        any += need - printed;
      } else {
        any += need;
      }
      continue;
    }
    if (need > 0) {
      named[domain] = need;
    }
  }
  // rule 356.1.b.2 / 356.1.b.3 — "ignoring its Energy cost" waives only the
  // CARD's own Energy component. An optional additional cost declared while
  // playing it (Accelerate's [1][D]) is added on top of the zeroed base and is
  // still paid in full, so the waiver may not swallow its Energy half.
  const additionalEnergy = Math.max(0, extras.additionalCost?.energy ?? 0);
  const ignoresBaseEnergy = extras.ignoreEnergyCost === true;
  // rule 356.1.b.3 / 356.3 — increases are applied AFTER the base is zeroed and
  // can lift the total back above zero, so the waiver never swallows them.
  // rule 820.1.c.1 (rule-id: sfd-080-221 × sfd-140-221) — an elected [Repeat]
  // is an ADDITIONAL cost of this play, so it survives the waiver too.
  const waivedEnergy = additionalEnergy + boardIncrease.energy + runtimeIncrease + repeatSurcharge;
  // rule 356.4.e / 356.4.f — what the waiver left is still a Total Cost a
  // discount may eat, bounded by that discount's own minimum: a floor never
  // RAISES a total that the waiver already brought to 0.
  const waivedAfterDiscount = Math.max(
    0,
    applyStaticCostReduction(waivedEnergy, boardReduction) - interactive - selfScaled - nextPlayEnergy,
  );
  return {
    any,
    energy: ignoresBaseEnergy ? waivedAfterDiscount : energy,
    free: false,
    ignoreEnergy: ignoresBaseEnergy && waivedAfterDiscount === 0,
    named,
    ...(hybridDomains && hybridNeed > 0 ? { hybrid: { domains: hybridDomains, n: hybridNeed } } : {}),
  };
}

/**
 * rule 357.1 — can `playerId`'s Rune Pool (plus `potentialEnergy` the caller
 * vouches is addable) cover `cost`? rule 429.4: Energy earmarked "use only to
 * play <another card type>" is invisible to this play. Named pips fall back to
 * pooled [rainbow] Power (135.2.e.5.b); any-Domain and hybrid pips are covered
 * from whatever is left.
 */
export function canPayResourceCost(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  cost: PlayResourceCost,
  potentialEnergy = 0,
): boolean {
  const pool = state.runePools[playerId];
  if (!pool) {
    return false;
  }
  if (cost.free) {
    return true;
  }
  const availableEnergy =
    Math.max(0, pool.energy - getLockedEnergy(state, playerId, cardId)) + potentialEnergy;
  if (!cost.ignoreEnergy && availableEnergy < cost.energy) {
    return false;
  }
  // rule 429.4: Power earmarked "use only to play <another card type>" is
  // invisible to this play, exactly as earmarked Energy is.
  const remaining: Record<string, number> = {
    ...spendablePowerPool(state, playerId, getGlobalCardRegistry().getCardType(cardId)),
  };
  for (const [domain, need] of Object.entries(cost.named)) {
    if (!need) {
      continue;
    }
    const available = remaining[domain] ?? 0;
    if (available < need) {
      // Rule 135.2.e.5.b (unl-022-219): [rainbow] Power in the pool can be
      // spent as Power of any Domain — cover the shortfall from it.
      const shortfall = need - available;
      const wild = remaining.rainbow ?? 0;
      if (wild < shortfall) {
        return false;
      }
      remaining.rainbow = wild - shortfall;
      remaining[domain] = 0;
      continue;
    }
    remaining[domain] = available - need;
  }
  const hybridNeed = cost.hybrid?.n ?? 0;
  if (cost.hybrid && hybridNeed > 0) {
    // Rule 135.2.e.6.c: only the card's own Domains (or pooled [rainbow]
    // Power, Rule 135.2.e.5.b) may cover hybrid pips.
    let hybridAvailable = remaining.rainbow ?? 0;
    for (const d of cost.hybrid.domains) {
      hybridAvailable += remaining[d] ?? 0;
    }
    if (hybridAvailable < hybridNeed) {
      return false;
    }
  }
  if (cost.any + hybridNeed > 0) {
    const leftover = Object.values(remaining).reduce((a, b) => a + b, 0);
    if (leftover < cost.any + hybridNeed) {
      return false;
    }
  }
  return true;
}

/**
 * rule 357.1 — spend `cost` from `playerId`'s Rune Pool (earmarked Energy
 * first, rule 429.4), recording the Energy/Power ledgers other cards read
 * ("if you've spent [4] or more to play a spell this turn", "spent [A][A]").
 * Never drives a pool negative: callers gate on `canPayResourceCost`.
 */
export function payResourceCost(
  draft: RiftboundGameState,
  playerId: string,
  cardId: string,
  cost: PlayResourceCost,
  /**
   * rule 357.3 — Power (per Domain) that a SEPARATE cost of this same play is
   * still owed and can only take from those Domains; any-Domain pips avoid it.
   */
  reserve?: Partial<Record<string, number>>,
): void {
  const pool = draft.runePools[playerId];
  if (!pool || cost.free) {
    return;
  }
  // rule 364.3.a — tally the pips this play actually drains from the pool.
  const powerPipsBefore = totalPowerPips(pool.power);
  // rule 356.1.b: "ignoring its Energy cost" skips only that component.
  if (!cost.ignoreEnergy) {
    // rule 429.4: earmarked Energy is spent first on the plays it allows.
    consumeRestrictedEnergy(draft, playerId, cardId, Math.min(cost.energy, pool.energy));
    pool.energy = Math.max(0, pool.energy - cost.energy);
    recordSpellEnergySpent(draft, playerId, cardId, cost.energy);
  }
  for (const [domain, amount] of Object.entries(cost.named)) {
    if (!amount || amount <= 0) {
      continue;
    }
    const key = domain as keyof typeof pool.power;
    const have = pool.power[key] ?? 0;
    pool.power[key] = Math.max(0, have - amount);
    // Rule 135.2.e.5.b (unl-022-219): pooled [rainbow] Power covers any
    // domain shortfall.
    const shortfall = amount - have;
    if (shortfall > 0) {
      const wildPool = pool.power as Partial<Record<string, number>>;
      wildPool.rainbow = Math.max(0, (wildPool.rainbow ?? 0) - shortfall);
    }
  }
  // Rule 135.2.e.5.a: [rainbow] pips are paid with any Domain's Power — after
  // named domains, drain one pip at a time from whichever domain has the most.
  const anyPool = pool.power as Partial<Record<string, number>>;
  // Rule 135.2.e.6.c: hybrid pips first, restricted to the card's own
  // Domains (pooled [rainbow] Power as fallback per Rule 135.2.e.5.b).
  let hybridOwed = cost.hybrid?.n ?? 0;
  const hybridDomains = cost.hybrid?.domains;
  while (hybridDomains && hybridOwed > 0) {
    if (!drainOnePowerPip(anyPool, (d) => d === "rainbow" || hybridDomains.includes(d), reserve)) {
      break;
    }
    hybridOwed--;
  }
  let anyOwed = cost.any;
  while (anyOwed > 0) {
    if (!drainOnePowerPip(anyPool, () => true, reserve)) {
      break;
    }
    anyOwed--;
  }
  recordPowerSpent(draft, playerId, powerPipsBefore - totalPowerPips(pool.power));
  reconcileRestrictedPower(draft, playerId);
}

/**
 * Check if player can afford a card's cost from their rune pool — thin wrapper
 * over `computePlayResourceCost` + `canPayResourceCost` (the same computation
 * `deductCost` pays, so the two can never drift).
 */
export function canAffordCard(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
  potentialEnergy = 0,
): boolean {
  if (!state.runePools[playerId]) {
    return false;
  }
  const cost = computePlayResourceCost(state, playerId, cardId, extras, getCardMeta, false);
  return canPayResourceCost(state, playerId, cardId, cost, potentialEnergy);
}

/**
 * Deduct a card's cost from the player's rune pool — `computePlayResourceCost`
 * (consuming one-shot riders) + `payResourceCost`.
 */
export function deductCost(
  draft: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
  _addContext?: unknown,
): void {
  if (!draft.runePools[playerId]) {
    return;
  }
  const cost = computePlayResourceCost(draft, playerId, cardId, extras, getCardMeta, true);
  // rule 356.5 / 356.1.b.3 — an ignored base pays nothing and consumes no
  // rider, but the increases stacked on top of it are still paid.
  if (cost.free) {
    return;
  }
  // rule 357.3 — keep the Domains a later half of this play's cost needs.
  const reserve: Partial<Record<string, number>> = {};
  for (const pip of extras.reservePower ?? []) {
    if (pip !== "rainbow") {
      reserve[pip] = (reserve[pip] ?? 0) + 1;
    }
  }
  payResourceCost(draft, playerId, cardId, cost, reserve);
}
