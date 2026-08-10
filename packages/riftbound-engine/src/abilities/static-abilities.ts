/**
 * Static / Passive Ability Evaluator (rules 567-570)
 *
 * Static abilities are continuous effects that apply while a card is on the board.
 * They're identified by "while", "if", or statements of fact in card text.
 *
 * This module uses a **recalculate-from-scratch** approach:
 * 1. Strip all static modifications from all cards
 * 2. Scan all board cards for static abilities
 * 3. Evaluate each ability's condition
 * 4. Apply modifications to matching targets
 *
 * Called after every state mutation via performCleanup.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { getActiveShowdown } from "../chain/chain-state";
import { KEYWORD_DEFINITIONS } from "../keywords/keyword-effects";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import { additionalCostWasPaid } from "../operations/additional-costs-paid";
import type { GrantedKeyword, RiftboundCardMeta, RiftboundGameState } from "../types";

const MIGHTY_THRESHOLD = 5;

/**
 * Context needed for static ability evaluation.
 */
export interface StaticAbilityContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
  };
  readonly cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
    updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
}

/**
 * rule 108.2 — "your"/"friendly" addresses the cards you CONTROL. A card you
 * control but do not own (Possession) is still yours; ownership only decides
 * where it goes when it leaves the board.
 */
function controllerOf(ctx: StaticAbilityContext, cardId: string, fallback?: string): string {
  return (
    ctx.cards.getCardController?.(cardId as CoreCardId) ??
    ctx.cards.getCardOwner(cardId as CoreCardId) ??
    fallback ??
    ""
  );
}

/**
 * A board card with its location info.
 */
interface BoardCard {
  id: string;
  owner: string;
  zone: string;
}

/**
 * Collect all cards currently on the board (base + battlefields + legendZone).
 */
function getAllBoardCards(ctx: StaticAbilityContext): BoardCard[] {
  const cards: BoardCard[] = [];

  for (const playerId of Object.keys(ctx.draft.players)) {
    const baseCards = ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId);
    for (const cardId of baseCards) {
      cards.push({ id: cardId as string, owner: playerId, zone: "base" });
    }

    const legendCards = ctx.zones.getCardsInZone(
      "legendZone" as CoreZoneId,
      playerId as CorePlayerId,
    );
    for (const cardId of legendCards) {
      cards.push({ id: cardId as string, owner: playerId, zone: "legendZone" });
    }
  }

  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const bfCards = ctx.zones.getCardsInZone(bfZoneId);
    for (const cardId of bfCards) {
      const owner = ctx.cards.getCardOwner(cardId) ?? "";
      cards.push({ id: cardId as string, owner, zone: bfZoneId as string });
    }
  }

  // Get cards from battlefieldRow (battlefield cards themselves)
  const battlefieldRowCards = ctx.zones.getCardsInZone("battlefieldRow" as CoreZoneId);
  for (const cardId of battlefieldRowCards) {
    const owner = ctx.cards.getCardOwner(cardId) ?? "";
    cards.push({ id: cardId as string, owner, zone: "battlefieldRow" });
  }

  // Get cards from championZone (per player)
  for (const playerId of Object.keys(ctx.draft.players)) {
    const championCards = ctx.zones.getCardsInZone(
      "championZone" as CoreZoneId,
      playerId as CorePlayerId,
    );
    for (const cardId of championCards) {
      cards.push({ id: cardId as string, owner: playerId, zone: "championZone" });
    }
  }

  return cards;
}

/**
 * rule 615.1 (rule-id: sfd-054-221) — "Your Equipment EVERYWHERE have
 * [Quick-Draw]": a static whose target descriptor says `location:"anywhere"`
 * also addresses cards outside the board, so hand copies are collected here.
 * They never act as static SOURCES, only as targets.
 */
function getOffBoardGrantCards(ctx: StaticAbilityContext): BoardCard[] {
  const cards: BoardCard[] = [];
  for (const playerId of Object.keys(ctx.draft.players)) {
    for (const cardId of ctx.zones.getCardsInZone(
      "hand" as CoreZoneId,
      playerId as CorePlayerId,
    )) {
      cards.push({ id: cardId as string, owner: playerId, zone: "hand" });
    }
  }
  return cards;
}

// rule 143.1 / 355.9.a.1 — the Board is bases, battlefields and the
// battlefield row: a card waiting in the Champion Zone (or in hand) is not a
// unit on the board, so an aura like "Other friendly units have +2 [Might]"
// never reaches it. Only a `location:"anywhere"` static addresses those.
function isBoardZone(zone: string): boolean {
  return zone !== "hand" && zone !== "championZone";
}

/**
 * State/tag filter for an `exists-here` condition descriptor. Board state lives
 * on the card meta, sometimes under `__flags` — read both, as the target
 * resolver does.
 */
function existsHereFilterMatches(
  filter: string | { tag?: string } | undefined,
  cardId: string,
  ctx: StaticAbilityContext,
): boolean {
  if (!filter) {
    return true;
  }
  if (typeof filter === "object") {
    if (!filter.tag) {
      return true;
    }
    return (getGlobalCardRegistry().get(cardId)?.tags ?? []).includes(filter.tag);
  }
  const meta = (ctx.cards.getCardMeta(cardId as CoreCardId) ?? {}) as Partial<RiftboundCardMeta> &
    Record<string, unknown>;
  const flags = (meta.__flags ?? {}) as Record<string, unknown>;
  const flag = (name: string): boolean => meta[name] === true || flags[name] === true;
  switch (filter) {
    case "stunned":
      return flag("stunned");
    case "buffed":
      return flag("buffed");
    case "damaged":
      return ((meta.damage ?? 0) as number) > 0;
    case "exhausted":
      return flag("exhausted");
    case "ready":
      return !flag("exhausted");
    // rule 445.2 / 464.2 — combat designations: "another unit attacking with
    // me" is another unit that holds the Attacker designation here.
    case "attacking":
      return meta.combatRole === "attacker";
    case "defending":
      return meta.combatRole === "defender";
    case "in-combat":
      return meta.combatRole === "attacker" || meta.combatRole === "defender";
    default:
      // Unknown filter strings match everything, as elsewhere in the resolver.
      return true;
  }
}

/** rule 740.2.a — "alone" = no OTHER friendly unit at the same location. */
function unitIsAloneAtLocation(card: BoardCard, ctx: StaticAbilityContext): boolean {
  if (!card.zone.startsWith("battlefield-")) {
    return false;
  }
  const registry = getGlobalCardRegistry();
  const cardsAtZone = ctx.zones.getCardsInZone(card.zone as CoreZoneId);
  // rule 740.2.a — only other friendly UNITS break "alone"; attached gear and
  // equipment travel with the unit but are not units.
  return (
    cardsAtZone.filter(
      (id) =>
        ctx.cards.getCardOwner(id) === card.owner && registry.get(id as string)?.cardType === "unit",
    ).length === 1
  );
}

/**
 * rule 464.2.c.3 / 740.2.a — does THIS unit hold the combat state named by a
 * `while-unit-state` condition? Such a condition describes the subject of the
 * effect ("while a unit here is defending alone"), so it is checked per target,
 * never once against the source card.
 */
function unitMatchesUnitState(
  card: BoardCard,
  state: string | undefined,
  ctx: StaticAbilityContext,
): boolean {
  const meta = (ctx.cards.getCardMeta(card.id as CoreCardId) ?? {}) as Partial<RiftboundCardMeta>;
  switch (state) {
    case "defending-alone":
      return meta.combatRole === "defender" && unitIsAloneAtLocation(card, ctx);
    case "attacking-alone":
      return meta.combatRole === "attacker" && unitIsAloneAtLocation(card, ctx);
    case "in-combat-alone":
      return (
        (meta.combatRole === "attacker" || meta.combatRole === "defender") &&
        unitIsAloneAtLocation(card, ctx)
      );
    case "defending":
      return meta.combatRole === "defender";
    case "attacking":
      return meta.combatRole === "attacker";
    case "in-combat":
      return meta.combatRole === "attacker" || meta.combatRole === "defender";
    case "alone":
      return unitIsAloneAtLocation(card, ctx);
    default:
      // Unknown states behave like the rest of the resolver: no narrowing.
      return true;
  }
}

/**
 * rule 434.1.d / 718 — condition kinds whose subject is the Equipment ITSELF
 * ("if this was attached to me this turn"), so they are NOT remapped to the
 * holder the way the rest of an `effectText` sentence is.
 */
const SELF_IS_ATTACHMENT_CONDITIONS = new Set(["attached-this-turn"]);

/**
 * Evaluate whether a static ability's condition is met.
 */
export function evaluateCondition(
  condition: Record<string, unknown>,
  source: BoardCard,
  ctx: StaticAbilityContext,
): boolean {
  const condType = condition.type as string;

  switch (condType) {
    case "while-at-battlefield": {
      return source.zone.startsWith("battlefield");
    }

    case "while-mighty": {
      const registry = getGlobalCardRegistry();
      const def = registry.get(source.id);
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const baseMight = def?.might ?? 0;
      const buffBonus = (meta?.buffed ? 1 : 0) + (meta?.extraBuffs ?? 0);
      const mightMod = meta?.mightModifier ?? 0;
      // rule 710 / 476.3 — Mighty reads CURRENT Might, so every layer that
      // raises it counts: buffs, modifiers, other statics, and attached
      // equipment (whose bonus lives on the gear, not on `staticMightBonus`).
      const staticBonus = meta?.staticMightBonus ?? 0;
      let equipBonus = 0;
      for (const equipId of meta?.equippedWith ?? []) {
        equipBonus += registry.getMightBonus(equipId as string);
      }
      return baseMight + buffBonus + mightMod + staticBonus + equipBonus >= MIGHTY_THRESHOLD;
    }

    case "while-buffed": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.buffed === true;
    }

    case "while-damaged": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return (meta?.damage ?? 0) > 0;
    }

    case "while-ready": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.exhausted !== true;
    }

    case "while-exhausted": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.exhausted === true;
    }

    case "while-alone": {
      if (!source.zone.startsWith("battlefield")) {
        return false;
      }
      const cardsAtZone = ctx.zones.getCardsInZone(source.zone as CoreZoneId);
      const friendlyCount = cardsAtZone.filter(
        (id) => ctx.cards.getCardOwner(id) === source.owner,
      ).length;
      return friendlyCount === 1;
    }

    // rule-id: sfd-159-221 — "While you have another unit here": count the
    // units matching the descriptor at the source's location. Rule 445.2:
    // "here" is the source's own location (base counts as a location too), and
    // "another" excludes the source itself.
    case "exists-here": {
      const target = (condition.target ?? {}) as {
        controller?: string;
        excludeSelf?: boolean;
        filter?: string | { tag?: string };
        location?: string;
        type?: string;
        quantity?: { atLeast?: number; exactly?: number };
      };
      const registry = getGlobalCardRegistry();
      const zoneIds: string[] =
        target.location === "battlefield"
          ? Object.keys(ctx.draft.battlefields ?? {}).map((bf) => `battlefield-${bf}`)
          : [source.zone];
      let count = 0;
      for (const zoneId of zoneIds) {
        const ids = zoneId.startsWith("battlefield")
          ? ctx.zones.getCardsInZone(zoneId as CoreZoneId)
          : ctx.zones.getCardsInZone(zoneId as CoreZoneId, source.owner as CorePlayerId);
        for (const id of ids) {
          const cardId = id as string;
          if (target.excludeSelf === true && cardId === source.id) {
            continue;
          }
          const owner = ctx.cards.getCardOwner(id as CoreCardId) as string | undefined;
          if (target.controller === "enemy" ? owner === source.owner : owner !== source.owner) {
            continue;
          }
          if (target.type === "unit" && registry.get(cardId)?.cardType !== "unit") {
            continue;
          }
          if (!existsHereFilterMatches(target.filter, cardId, ctx)) {
            continue;
          }
          count++;
        }
      }
      if (typeof target.quantity?.exactly === "number") {
        return count === target.quantity.exactly;
      }
      return count >= (target.quantity?.atLeast ?? 1);
    }

    // rule 430.1 — "runes you have" are the runes in your rune pool, ready or
    // exhausted; an opponent's runes never count.
    case "runes-at-least": {
      const runes = ctx.zones.getCardsInZone(
        "runePool" as CoreZoneId,
        source.owner as CorePlayerId,
      ).length;
      return runes >= ((condition.amount as number | undefined) ?? 0);
    }

    // rule 430.1 (rule-id: ven-001-166) — mirror of `runes-at-least`.
    case "runes-at-most": {
      const runes = ctx.zones.getCardsInZone(
        "runePool" as CoreZoneId,
        source.owner as CorePlayerId,
      ).length;
      return runes <= ((condition.amount as number | undefined) ?? 0);
    }

    case "while-equipped": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return (meta?.equippedWith?.length ?? 0) > 0;
    }

    // rule 434.1.d / 434.1.f — "if this was attached to me this turn": the
    // source Equipment must be attached right now AND its attach stamp must be
    // the current turn. A same-turn re-equip detaches first and re-stamps, so
    // the clause turns on again without ever stacking (435.1.e).
    case "attached-this-turn": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      if (meta?.attachedTo === undefined) {
        return false;
      }
      const attachedOnTurn = meta.attachedOnTurn;
      return attachedOnTurn !== undefined && attachedOnTurn === ctx.draft.turn?.number;
    }

    // Rule 827 (rule-id: ven-136-166): `[Empowered][>]` abilities function
    // only while the host is Empowered.
    case "while-empowered": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      // rule 441.1.c.1 (rule-id: ven-134-166) — "While I'm [Empowered] three
      // times" is a tier on the empower COUNT, not the bare status.
      const times = (condition as { times?: number }).times;
      if (typeof times === "number") {
        const count =
          (meta as { empowerCount?: number } | undefined)?.empowerCount ??
          (meta?.empowered === true ? 1 : 0);
        return count >= times;
      }
      return meta?.empowered === true;
    }

    // rule-id: unl-146-219 — "While I'm in a showdown" (rules 545-553): the
    // source sits at the battlefield where the active showdown is open.
    case "while-in-showdown": {
      const interaction = ctx.draft.interaction;
      const showdown = interaction ? getActiveShowdown(interaction) : null;
      if (!showdown?.active) {
        return false;
      }
      // rule 190.6.d / 363 — printed ON a battlefield ("during showdowns here")
      // the source IS the location, so compare battlefield ids; the battlefield
      // card sits in the battlefield row, not in `battlefield-<id>`.
      if (ctx.draft.battlefields?.[source.id]) {
        return showdown.battlefieldId === source.id;
      }
      return source.zone === `battlefield-${showdown.battlefieldId}`;
    }

    case "control-battlefield": {
      const comparison = condition.count as { gte?: number; lte?: number; eq?: number } | undefined;
      // rule 190.6.d — "While you control this battlefield" printed ON a
      // battlefield card means THAT battlefield, not any battlefield; its
      // "you" is the battlefield's current controller (conquest moves it).
      const ownBattlefield = ctx.draft.battlefields?.[source.id];
      if (ownBattlefield && comparison === undefined) {
        // rule 740.1.a — the aura's "you" IS the controller, so any controller
        // switches it on (its audience is scoped to that player elsewhere).
        return ownBattlefield.controller !== null && ownBattlefield.controller !== undefined;
      }
      let controlledCount = 0;
      for (const bf of Object.values(ctx.draft.battlefields)) {
        if (bf.controller === source.owner) {
          controlledCount++;
        }
      }
      if (comparison?.gte !== undefined) {
        return controlledCount >= comparison.gte;
      }
      if (comparison?.eq !== undefined) {
        return controlledCount === comparison.eq;
      }
      return controlledCount > 0;
    }

    case "attacking": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.combatRole === "attacker";
    }

    case "defending": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.combatRole === "defender";
    }

    case "in-combat": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return meta?.combatRole === "attacker" || meta?.combatRole === "defender";
    }

    // rule 740.2.a / 740.2.c: "While I'm attacking or defending alone" — the
    // source has a combat designation matching `role` and no other friendly
    // unit shares its location.
    case "alone-in-combat": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const role = (condition.role as string | undefined) ?? "either";
      const combatRole = meta?.combatRole;
      const roleOk =
        role === "attacking"
          ? combatRole === "attacker"
          : role === "defending"
            ? combatRole === "defender"
            : combatRole === "attacker" || combatRole === "defender";
      if (!roleOk) {
        return false;
      }
      return evaluateCondition({ type: "while-alone" }, source, ctx);
    }

    // rule 364.3 (unl-210-219) — "While a unit here is <state>": the condition
    // gates on at least one qualifying unit in scope; which units actually take
    // the effect is narrowed per target where the effect is applied.
    case "while-unit-state": {
      const state = condition.state as string | undefined;
      const location = condition.location as string | undefined;
      const sourceZone = staticSourceZone(source, ctx);
      return getAllBoardCards(ctx).some((c) => {
        if (location === "here" && c.zone !== sourceZone) {
          return false;
        }
        return unitMatchesUnitState(c, state, ctx);
      });
    }

    case "and": {
      const subConditions = condition.conditions as Record<string, unknown>[];
      return subConditions.every((c) => evaluateCondition(c, source, ctx));
    }

    case "or": {
      const subConditions = condition.conditions as Record<string, unknown>[];
      return subConditions.some((c) => evaluateCondition(c, source, ctx));
    }

    case "not": {
      const subCondition = condition.condition as Record<string, unknown>;
      return !evaluateCondition(subCondition, source, ctx);
    }

    case "paid-additional-cost": {
      return additionalCostWasPaid(ctx.draft, source.id, condition.costId as string | undefined);
    }

    // rule 824.1.c.1 / 108.2 — "[Level N]" reads "you" = the card's CONTROLLER,
    // not its owner: a Visionary you control but do not own uses your XP.
    case "while-level": {
      const threshold = (condition.threshold as number) ?? 0;
      const player = ctx.draft.players[controllerOf(ctx, source.id, source.owner)];
      return (player?.xp ?? 0) >= threshold;
    }

    // rule 364.3.a (rule-id: sfd-143-221) — "if you've spent at least
    // [rainbow][rainbow] this turn": POWER pips paid by this card's controller,
    // any domain. Continuously re-evaluated; the tally resets each turn.
    case "spent-power": {
      const spent =
        (ctx.draft as { powerSpentThisTurn?: Record<string, number> }).powerSpentThisTurn?.[
          source.owner
        ] ?? 0;
      return spent >= ((condition.amount as number) ?? 1);
    }

    // rule 135.2 / 357 (rule-id: unl-004-219) — "If you've spent [N] or more to
    // play a spell this turn": the ENERGY this card's controller actually paid
    // while playing spells this turn (additional costs included, 820.1.d).
    // Power pips never count, and the ledger resets each turn.
    case "spell-energy-spent-this-turn": {
      const spent =
        (ctx.draft as { spellEnergySpentThisTurn?: Record<string, number> })
          .spellEnergySpentThisTurn?.[source.owner] ?? 0;
      return spent >= ((condition.amount as number) ?? 1);
    }

    // rule 191.4.a — an ability's controller is its source's CONTROLLER, so
    // "if you've gained XP this turn" reads the thief's ledger for a stolen unit.
    case "xp-gained-this-turn": {
      const gained =
        ctx.draft.xpGainedThisTurn?.[controllerOf(ctx, source.id, source.owner)] ?? 0;
      return gained > 0;
    }

    case "event-this-turn": {
      const eventType = condition.event as string;
      const events = ctx.draft.turnEvents?.[source.owner] ?? [];
      return events.includes(eventType);
    }

    // rule-id: ogn-019-298 — "If you've discarded a card this turn, I have …":
    // true only while this turn's event log holds a matching entry for the
    // source's controller (never by default).
    case "this-turn": {
      const eventType = condition.event as string;
      const events = ctx.draft.turnEvents?.[source.owner] ?? [];
      const n = events.filter((e) => e === eventType).length;
      const cmp = condition.count as { gte?: number; eq?: number; lte?: number } | undefined;
      if (cmp?.eq !== undefined) return n === cmp.eq;
      if (cmp?.lte !== undefined) return n <= cmp.lte && n >= (cmp.gte ?? 0);
      return n >= (cmp?.gte ?? 1);
    }

    case "turn-count-at-least": {
      // True when the source card's controlling player has taken at least
      // `threshold` turns. Used by Forgotten Monument to gate scoring on
      // A player's third turn.
      const threshold = (condition.threshold as number) ?? 0;
      const player = ctx.draft.players[source.owner];
      return (player?.turnsTaken ?? 0) >= threshold;
    }

    default: {
      // Unknown condition — default to true (apply the effect)
      return true;
    }
  }
}

/**
 * rule 208.3 / 476.1 — a gear with the printed [Equip] ability IS Equipment
 * (set-JSON cards type every non-unit permanent as "gear").
 */
function isEquipmentSource(cardId: string): boolean {
  const registry = getGlobalCardRegistry();
  const type = registry.get(cardId)?.cardType;
  return type === "equipment" || (type === "gear" && registry.hasKeyword(cardId, "Equip"));
}

/**
 * rule 718 — an attached Equipment's effect text speaks as the equipped unit:
 * "I"/"me" is the holder. Abilities flagged `effectText` therefore evaluate
 * their conditions (and trigger subjects) against the holder while attached; an
 * unattached Equipment, or any non-effectText ability, still speaks as itself.
 */
function effectTextSelf(
  card: BoardCard,
  ability: { effectText?: boolean },
  boardCards: BoardCard[],
  ctx: StaticAbilityContext,
): BoardCard {
  if (ability.effectText !== true) {
    return card;
  }
  const attachedTo = (
    ctx.cards.getCardMeta(card.id as CoreCardId) as { attachedTo?: string } | undefined
  )?.attachedTo;
  if (attachedTo === undefined) {
    return card;
  }
  return boardCards.find((c) => c.id === attachedTo) ?? card;
}

/**
 * Resolve which cards a static ability's effect applies to.
 */
function resolveStaticTargets(
  affects: string | undefined,
  source: BoardCard,
  boardCards: BoardCard[],
  ctx?: StaticAbilityContext,
): string[] {
  switch (affects) {
    case "self":
    case undefined: {
      // rule 150.2 — a keyword bar printed on an Equipment applies to the unit
      // it is attached to, and only while it is attached (an unattached
      // Equipment grants nothing).
      // rule 208.3 / 476.1 — set-JSON Equipment keeps the printed type "gear",
      // so a gear with the printed [Equip] ability counts as Equipment here.
      if (ctx !== undefined && isEquipmentSource(source.id)) {
        const attachedTo = (
          ctx.cards.getCardMeta(source.id as CoreCardId) as { attachedTo?: string } | undefined
        )?.attachedTo;
        return attachedTo === undefined ? [] : [attachedTo];
      }
      return [source.id];
    }

    case "units": {
      // All friendly units at the same location
      const registry = getGlobalCardRegistry();
      return boardCards
        .filter((c) => c.owner === source.owner && c.zone === source.zone)
        .filter((c) => registry.get(c.id)?.cardType === "unit")
        .map((c) => c.id);
    }

    case "all-friendly": {
      const registry = getGlobalCardRegistry();
      return boardCards
        .filter((c) => c.owner === source.owner)
        .filter((c) => registry.get(c.id)?.cardType === "unit")
        .map((c) => c.id);
    }

    case "all-enemy": {
      const registry = getGlobalCardRegistry();
      return boardCards
        .filter((c) => c.owner !== source.owner)
        .filter((c) => registry.get(c.id)?.cardType === "unit")
        .map((c) => c.id);
    }

    case "battlefield": {
      // All units at the same battlefield
      if (!source.zone.startsWith("battlefield")) {
        return [];
      }
      const registry = getGlobalCardRegistry();
      return boardCards
        .filter((c) => c.zone === source.zone)
        .filter((c) => registry.get(c.id)?.cardType === "unit")
        .map((c) => c.id);
    }

    case "gear": {
      return boardCards
        .filter((c) => c.owner === source.owner)
        .filter((c) => {
          const reg = getGlobalCardRegistry();
          return reg.get(c.id)?.cardType === "gear" || reg.get(c.id)?.cardType === "equipment";
        })
        .map((c) => c.id);
    }

    default: {
      return [source.id];
    }
  }
}

/**
 * rule-id: unl-058-219, ogn-100-298 — parser-emitted statics ("Your token units
 * have [Tank]", "Other friendly units have [Vision]") carry no `affects`; they describe
 * the audience on `effect.target` instead. Resolve that descriptor against
 * the board so the grant lands on the described units rather than the source.
 * Returns undefined when the target is not a group descriptor (self / bare).
 */
/**
 * rule 105.2 / 187.7 — a battlefield card sits in `battlefieldRow`, but "here"
 * on its own aura means the units AT that battlefield. Map the row source onto
 * its `battlefield-<id>` zone; every other source keeps its own zone.
 */
function staticSourceZone(source: BoardCard, ctx: StaticAbilityContext): string {
  if (source.zone !== "battlefieldRow") {
    return source.zone;
  }
  for (const [bfId, bf] of Object.entries(ctx.draft.battlefields)) {
    if (bfId === source.id || (bf as { id?: string }).id === source.id) {
      return `battlefield-${bfId}`;
    }
  }
  return source.zone;
}

function resolveStaticTargetsFromDescriptor(
  target: unknown,
  source: BoardCard,
  boardCards: BoardCard[],
  ctx: StaticAbilityContext,
): string[] | undefined {
  if (!target || typeof target !== "object") {
    return undefined;
  }
  const t = target as {
    type?: string;
    controller?: string;
    excludeSelf?: boolean;
    includeSelf?: boolean;
    location?: string;
    filter?: unknown;
    quantity?: unknown;
  };
  // rule-id: unl-146-219 — "your spells have [X]" addresses spells as they
  // are played (read by the play-cost path), never a board permanent.
  if (t.type === "spell") {
    return [];
  }
  // rule 135.4.b (sfd-208-221) — "friendly legends have '…'": a legend in the
  // legend zone is a board card an aura can address, like a unit or gear.
  if (t.type !== "unit" && t.type !== "gear" && t.type !== "equipment" && t.type !== "legend") {
    return undefined;
  }
  const isGroup =
    t.controller !== undefined ||
    t.filter !== undefined ||
    t.excludeSelf === true ||
    t.includeSelf === true ||
    t.location !== undefined ||
    t.quantity === "all";
  if (!isGroup) {
    return undefined;
  }
  // rule 143.1 — the champion zone (and hand) is not the board, so a static
  // whose source waits there functions on nobody.
  if (source.zone === "championZone" || source.zone === "hand") {
    return [];
  }
  // rule 105.2 — a base is not a battlefield: "at my battlefield" addresses
  // nobody while the source sits anywhere other than a battlefield.
  const sourceZone = staticSourceZone(source, ctx);
  if (t.location === "battlefield" && !sourceZone.startsWith("battlefield-")) {
    return [];
  }
  const registry = getGlobalCardRegistry();
  // rule 740.1.a (sfd-208-221) — the "you" of a battlefield's aura is whoever
  // CONTROLS that battlefield right now, not the player who brought it.
  const ownBattlefield =
    source.zone === "battlefieldRow" ? ctx.draft.battlefields?.[source.id] : undefined;
  const sourceController =
    ownBattlefield?.controller ?? controllerOf(ctx, source.id, source.owner);
  return boardCards
    .filter((c) => {
      // rule 208.2 (sfd-089-221) — "(including me)": the source is addressed by
      // its own aura even when it does not match the aura's subject (Rumble is
      // tagged Rumble, not Mech).
      if (t.includeSelf && c.id === source.id) {
        return true;
      }
      const def = registry.get(c.id);
      const cardType = def?.cardType;
      if (t.type === "unit" && cardType !== "unit") {
        return false;
      }
      if (t.type === "gear" && cardType !== "gear" && cardType !== "equipment") {
        return false;
      }
      if (t.type === "legend" && cardType !== "legend") {
        return false;
      }
      // rule 208.3 / 476.1 — "Equipment" is the strict subset of gear with the
      // printed [Equip] ability; plain gear must not be addressed.
      if (
        t.type === "equipment" &&
        cardType !== "equipment" &&
        !(cardType === "gear" && registry.hasKeyword(c.id, "Equip"))
      ) {
        return false;
      }
      // Only an "anywhere"-scoped static reaches cards off the board.
      if (t.location !== "anywhere" && !isBoardZone(c.zone)) {
        return false;
      }
      // rule 108.2 — "your token units" follows CONTROL, not ownership.
      if (t.controller === "friendly" && controllerOf(ctx, c.id, c.owner) !== sourceController) {
        return false;
      }
      if (t.controller === "enemy" && controllerOf(ctx, c.id, c.owner) === sourceController) {
        return false;
      }
      if (t.excludeSelf && c.id === source.id) {
        return false;
      }
      if ((t.location === "here" || t.location === "battlefield") && c.zone !== sourceZone) {
        return false;
      }
      // rule 355.1 (unl-076-219): "at my battlefield" is the battlefield the
      // source is at — a base is not a battlefield, so nothing qualifies there.
      if (t.location === "here-battlefield") {
        if (!sourceZone.startsWith("battlefield-") || c.zone !== sourceZone) {
          return false;
        }
      }
      if (t.filter !== undefined) {
        if (typeof t.filter === "string") {
          if (t.filter === "token") {
            const isToken =
              registry.isToken(c.id) ||
              (def as { isToken?: boolean } | undefined)?.isToken === true;
            if (!isToken) {
              return false;
            }
          } else {
            const meta = ctx.cards.getCardMeta(c.id as CoreCardId) as
              | Record<string, unknown>
              | undefined;
            if (meta?.[t.filter] !== true) {
              return false;
            }
          }
        } else if (typeof t.filter === "object" && t.filter !== null) {
          // A tag list is read as "any of" (unl-t03 Brush: "Bird, Cat, Dog,
          // Poro, and Ivern units here have +1 [Might]").
          const tag = (t.filter as { tag?: string | readonly string[] }).tag;
          if (tag !== undefined) {
            const tags = def?.tags ?? [];
            const wanted = Array.isArray(tag) ? (tag as readonly string[]) : [tag as string];
            if (!wanted.some((w) => tags.includes(w))) {
              return false;
            }
          }
          // rule-id: ven-097-166 — "with my name": `"self"` means the source's
          // own printed name (Spiderling counting other Spiderlings).
          const name = (t.filter as { name?: string }).name;
          if (name !== undefined) {
            const sourceDef = registry.get(source.id);
            const wanted = name === "self" ? sourceDef?.name : name;
            if (!wanted || def?.name !== wanted) {
              return false;
            }
          }
          // rule-id: unl-076-219 — "your units with [KEYWORD]": printed keywords
          // and keywords granted by other continuous effects both count.
          const keyword = (t.filter as { keyword?: string }).keyword;
          if (keyword !== undefined) {
            const wantedKw = keyword.toLowerCase();
            const printed = registry.hasKeyword(c.id, keyword);
            const meta = ctx.cards.getCardMeta(c.id as CoreCardId) as
              | { grantedKeywords?: readonly { keyword?: string }[] }
              | undefined;
            const granted = (meta?.grantedKeywords ?? []).some(
              (g) => (g.keyword ?? "").toLowerCase() === wantedKw,
            );
            const onDef = ((def as { keywords?: readonly string[] } | undefined)?.keywords ?? []).some(
              (k) => k.toLowerCase() === wantedKw,
            );
            if (!printed && !granted && !onDef) {
              return false;
            }
          }
        }
      }
      return true;
    })
    .map((c) => c.id);
}

/**
 * rule 809.2 (sfd-071-221) — keywords whose VALUE sums when several
 * independent sources grant them (two Breakneck Mechs ⇒ Deflect 2). Grants of
 * every other keyword are idempotent, so identical static grants collapse.
 */
const STACKABLE_GRANT_KEYWORDS = new Set(["Assault", "Deflect", "Shield"]);

/**
 * rule 817.2 / 817.2.a / 817.2.b — keywords that are pure trigger shorthand
 * ("when <event> happens to me, get this effect"). Each INSTANCE is its own
 * triggered ability, so two independent sources granting the same keyword (two
 * Forecasters: "Your Mechs have [Vision]") leave the unit with two separate
 * triggers, each chosen independently. Mirrors `trigger-runner.ts`
 * GRANTED_KEYWORD_TRIGGERS / KEYWORD_SELF_TRIGGER_EVENTS.
 */
const PER_INSTANCE_TRIGGER_KEYWORDS = new Set(["Deathknell", "Vision"]);

function isStackableKeyword(keyword: string): boolean {
  return STACKABLE_GRANT_KEYWORDS.has(keyword) || PER_INSTANCE_TRIGGER_KEYWORDS.has(keyword);
}

/**
 * Apply a static effect (might modification or keyword grant) to target cards.
 *
 * Accumulates into `staticMightBonus` and adds keywords with `duration: "static"`.
 */
function applyStaticEffect(
  effect: Record<string, unknown>,
  targetIds: string[],
  ctx: StaticAbilityContext,
  source?: BoardCard,
): void {
  const effectType = effect.type as string;

  // A static line may bundle several continuous effects ("I have [Deflect 3]
  // and [Ganking]") — each half applies under the same condition and targets.
  if (effectType === "sequence") {
    for (const sub of (effect.effects as Record<string, unknown>[]) ?? []) {
      applyStaticEffect(sub, targetIds, ctx, source);
    }
    return;
  }

  if (effectType === "modify-might") {
    let amount = 0;
    const rawAmount = effect.amount;
    // rule 442.1 (rule-id: ven-018-166) — "…they have +N [Might] instead" while
    // the source is [Empowered]: the higher tier REPLACES the printed amount.
    const empoweredAmount = effect.empoweredAmount;
    let empoweredTierApplies = false;
    if (typeof empoweredAmount === "number" && source) {
      const srcMeta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      empoweredTierApplies = srcMeta?.empowered === true;
    }
    if (empoweredTierApplies) {
      amount = empoweredAmount as number;
    } else if (typeof rawAmount === "number") {
      amount = rawAmount;
    } else if (rawAmount && typeof rawAmount === "object" && "cardsInTrash" in rawAmount) {
      // rule-id: ogn-109-298 — dynamic static Might equal to cards in a player's trash.
      const whose = (rawAmount as { cardsInTrash: string }).cardsInTrash;
      const ownerId = source?.owner ?? "";
      const pid =
        whose === "opponent"
          ? (Object.keys(ctx.draft.players).find((p) => p !== ownerId) ?? ownerId)
          : ownerId;
      amount = pid
        ? ctx.zones.getCardsInZone("trash" as CoreZoneId, pid as CorePlayerId).length
        : 0;
    } else if (rawAmount && typeof rawAmount === "object" && "count" in rawAmount) {
      // rule-id: ogn-240-298 — "+1 [Might] for each buffed friendly unit at my
      // battlefield": a dynamic static amount counting the board cards matching
      // a descriptor (scoped relative to the source), times an optional factor.
      const spec = rawAmount as { count: unknown; multiplier?: number };
      const counted = source
        ? (resolveStaticTargetsFromDescriptor(spec.count, source, getAllBoardCards(ctx), ctx) ?? [])
        : [];
      amount = counted.length * (typeof spec.multiplier === "number" ? spec.multiplier : 1);
    } else if (rawAmount && typeof rawAmount === "object" && "empowerCount" in rawAmount) {
      // rule 441.1.c.1 (rule-id: ven-134-166) — "+2 [Might] for each time I'm
      // [Empowered]": zero times is +0, so the bonus scales with the count.
      const srcMeta = source
        ? (ctx.cards.getCardMeta(source.id as CoreCardId) as
            | { empowerCount?: number; empowered?: boolean }
            | undefined)
        : undefined;
      const count = srcMeta?.empowerCount ?? (srcMeta?.empowered === true ? 1 : 0);
      const spec = rawAmount as { multiplier?: number };
      amount = count * (typeof spec.multiplier === "number" ? spec.multiplier : 1);
    } else if (rawAmount && typeof rawAmount === "object" && "score" in rawAmount) {
      // rule-id: ogn-028-298 — dynamic static Might equal to a player's points.
      const whose = (rawAmount as { score: string }).score;
      const ownerId = source?.owner ?? "";
      const pid =
        whose === "opponent"
          ? (Object.keys(ctx.draft.players).find((p) => p !== ownerId) ?? ownerId)
          : ownerId;
      amount = pid ? (ctx.draft.players[pid]?.victoryPoints ?? 0) : 0;
    }
    // rule-id: sfd-068-221 — "Each Equipment attached to me gives double its
    // base Might bonus": effective-might sites already add the base bonus once,
    // so contribute the extra (multiplier - 1) x sum of attached base bonuses.
    const equipMultiplier =
      effect.source === "equipment" && typeof effect.multiplier === "number"
        ? (effect.multiplier as number)
        : undefined;
    const registry = equipMultiplier !== undefined ? getGlobalCardRegistry() : undefined;
    for (const targetId of targetIds) {
      const meta = ctx.cards.getCardMeta(targetId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      let targetAmount = amount;
      if (equipMultiplier !== undefined && registry) {
        let equipBase = 0;
        for (const equipId of meta?.equippedWith ?? []) {
          equipBase += registry.getMightBonus(equipId as string);
        }
        targetAmount += equipBase * (equipMultiplier - 1);
      }
      // rule-id: ogn-079-298 — "-8 [Might], to a minimum of 1": a penalty can't
      // take the unit's current Might below the stated floor (nor raise it).
      if (typeof effect.minimum === "number" && targetAmount < 0) {
        const reg = registry ?? getGlobalCardRegistry();
        let cur = reg.getMight(targetId) + (meta?.buffed ? 1 : 0) + (meta?.extraBuffs ?? 0);
        cur += (meta?.mightModifier ?? 0) + (meta?.staticMightBonus ?? 0);
        for (const equipId of meta?.equippedWith ?? []) cur += reg.getMightBonus(equipId as string);
        targetAmount = Math.min(0, Math.max(targetAmount, (effect.minimum as number) - cur));
      }
      const current = meta?.staticMightBonus ?? 0;
      ctx.cards.updateCardMeta(
        targetId as CoreCardId,
        {
          staticMightBonus: current + targetAmount,
        } as Partial<RiftboundCardMeta>,
      );
    }
  } else if (effectType === "grant-keyword") {
    const keyword = effect.keyword as string;
    if (!keyword) {
      return;
    }
    let value = typeof effect.value === "number" ? effect.value : undefined;
    // rule 807.1.c (sfd-131-221) — "I have [Assault] equal to the number of
    // enemy units here": the value is a continuously evaluated board count,
    // recomputed on every static recalculation.
    const rawValue = effect.value;
    if (rawValue && typeof rawValue === "object" && "count" in rawValue) {
      const spec = rawValue as { count: unknown; multiplier?: number };
      const counted = source
        ? (resolveStaticTargetsFromDescriptor(spec.count, source, getAllBoardCards(ctx), ctx) ?? [])
        : [];
      value = counted.length * (typeof spec.multiplier === "number" ? spec.multiplier : 1);
    }
    // rule 809 (ogn-063-298) — "have [Keyword] if they didn't already": a card
    // that already prints the keyword gets nothing, so values never sum.
    const onlyIfMissing = effect.ifMissing === true;
    const keywordRegistry = onlyIfMissing ? getGlobalCardRegistry() : undefined;
    // rule 137.3 / 718 (sfd-183-221) — an Equipment is not a unit: a keyword an
    // aura gives to an ATTACHED Equipment ("Your Equipment each give
    // [Assault]") functions on its equipped unit, and each Equipment grants its
    // own instance, so stackable keywords sum (807.2).
    // rule 819.3 / 718.2 — but a keyword that governs how the CARD ITSELF is
    // played ([Quick-Draw], [Reaction], [Ambush], …) is a characteristic of the
    // Equipment and never reaches the bearer: only keywords a unit can use are
    // appended to it (718.3).
    const recipients = targetIds.map((id) => {
      if (!keywordFunctionsOnBearer(keyword)) {
        return id;
      }
      const attachedTo = (
        ctx.cards.getCardMeta(id as CoreCardId) as { attachedTo?: string } | undefined
      )?.attachedTo;
      return attachedTo ?? id;
    });
    for (const targetId of recipients) {
      if (keywordRegistry?.hasKeyword(targetId, keyword)) {
        continue;
      }
      const meta = ctx.cards.getCardMeta(targetId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const existing = meta?.grantedKeywords ?? [];
      // Only add if not already granted statically with same keyword —
      // rule 809.2 (sfd-071-221): stackable keywords (Deflect, Assault,
      // Shield, …) sum across INDEPENDENT sources, so they are never deduped.
      const alreadyGranted =
        !isStackableKeyword(keyword) &&
        existing.some((gk) => gk.keyword === keyword && gk.duration === "static");
      if (!alreadyGranted) {
        ctx.cards.updateCardMeta(
          targetId as CoreCardId,
          {
            grantedKeywords: [
              ...existing,
              {
                duration: "static" as GrantedKeyword["duration"],
                keyword,
                value,
              } as GrantedKeyword,
            ],
          } as Partial<RiftboundCardMeta>,
        );
      }
    }
  } else if (effectType === "grant-keywords") {
    const keywords = (effect.keywords as string[]) ?? [];
    for (const targetId of targetIds) {
      const meta = ctx.cards.getCardMeta(targetId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const existing = meta?.grantedKeywords ?? [];
      const newEntries: GrantedKeyword[] = keywords
        .filter(
          (kw) =>
            // rule 809.2 (sfd-071-221) — stackable keywords sum across sources.
            isStackableKeyword(kw) ||
            !existing.some((gk) => gk.keyword === kw && gk.duration === "static"),
        )
        .map(
          (kw) =>
            ({ duration: "static" as GrantedKeyword["duration"], keyword: kw }) as GrantedKeyword,
        );
      if (newEntries.length > 0) {
        ctx.cards.updateCardMeta(
          targetId as CoreCardId,
          {
            grantedKeywords: [...existing, ...newEntries],
          } as Partial<RiftboundCardMeta>,
        );
      }
    }
  } else if (effectType === "grant-ability") {
    // rule 364 / 135.4.b (unl-213-219) — "Units here have '<cost>: <effect>.'":
    // a continuous grant of the activated ability printed on the SOURCE card at
    // `abilityIndex`. The host pays the cost and is `self` for the effect.
    const abilityIndex = effect.abilityIndex;
    if (typeof abilityIndex !== "number" || !source) {
      return;
    }
    for (const targetId of targetIds) {
      const meta = ctx.cards.getCardMeta(targetId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const existing = meta?.grantedAbilities ?? [];
      const alreadyGranted = existing.some(
        (ga) =>
          ga.sourceCardId === source.id &&
          ga.abilityIndex === abilityIndex &&
          ga.duration === "static",
      );
      if (alreadyGranted) {
        continue;
      }
      ctx.cards.updateCardMeta(
        targetId as CoreCardId,
        {
          grantedAbilities: [
            ...existing,
            { abilityIndex, duration: "static", sourceCardId: source.id },
          ],
        } as unknown as Partial<RiftboundCardMeta>,
      );
    }
  }
}

/**
 * Recalculate all static ability effects on the board.
 *
 * This is the main entry point. Call after any state mutation:
 * 1. Strips all "static" duration keywords and staticMightBonus from all cards
 * 2. Scans board cards for static abilities
 * 3. Evaluates conditions
 * 4. Applies effects to matching targets
 *
 * @returns true if any static effects were applied
 */
export function recalculateStaticEffects(ctx: StaticAbilityContext): boolean {
  const boardCards = getAllBoardCards(ctx);
  // "…everywhere" statics also address hand cards; they are stripped and
  // re-granted alongside the board so a grant ends when its source leaves.
  const grantableCards = [...boardCards, ...getOffBoardGrantCards(ctx)];
  const registry = getGlobalCardRegistry();
  let anyApplied = false;

  // Step 1: Strip all static modifications
  for (const card of grantableCards) {
    const meta = ctx.cards.getCardMeta(card.id as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    if (!meta) {
      continue;
    }

    let changed = false;

    // Clear staticMightBonus
    if (meta.staticMightBonus && meta.staticMightBonus !== 0) {
      ctx.cards.updateCardMeta(
        card.id as CoreCardId,
        {
          staticMightBonus: 0,
        } as Partial<RiftboundCardMeta>,
      );
      changed = true;
    }

    // Remove static-duration granted keywords
    if (meta.grantedKeywords && meta.grantedKeywords.length > 0) {
      const nonStatic = meta.grantedKeywords.filter((gk) => gk.duration !== "static");
      if (nonStatic.length !== meta.grantedKeywords.length) {
        ctx.cards.updateCardMeta(
          card.id as CoreCardId,
          {
            grantedKeywords: nonStatic.length > 0 ? nonStatic : undefined,
          } as Partial<RiftboundCardMeta>,
        );
        changed = true;
      }
    }

    // rule 364 (unl-213-219) — remove static-duration granted abilities; the
    // grant is re-applied below only while the card still matches its source's
    // descriptor (it ends the moment the unit leaves the battlefield).
    if (meta.grantedAbilities && meta.grantedAbilities.length > 0) {
      const nonStatic = meta.grantedAbilities.filter((ga) => ga.duration !== "static");
      if (nonStatic.length !== meta.grantedAbilities.length) {
        ctx.cards.updateCardMeta(
          card.id as CoreCardId,
          {
            grantedAbilities: nonStatic.length > 0 ? nonStatic : undefined,
          } as Partial<RiftboundCardMeta>,
        );
        changed = true;
      }
    }
  }

  // Step 2 + 3: Apply static abilities in layered order to handle
  // Dependencies between statics (rule 638.1.a-c, 639.1). We use a simple
  // Two-pass approach inspired by MTG's layer system:
  //   Pass 1 (layer "type" / "grant"): type-setting and ability-granting
  //                                     Effects (grant-keyword, grant-keywords)
  //   Pass 2 (layer "arithmetic"): might/stat arithmetic (modify-might)
  //
  // This handles the common "if X has keyword Y, then +N might" style
  // Dependencies without needing a full dependency graph. For effects
  // That are commutative (e.g., two +1 Might auras) the order does not
  // Matter, so the observable result is unchanged for those cases.

  const PASS_1_EFFECTS = new Set(["grant-keyword", "grant-keywords", "grant-ability"]);
  const PASS_2_EFFECTS = new Set(["modify-might"]);

  // rule 476.3 — the ability layer is re-checked after the arithmetic layer, so
  // a keyword grant conditioned on Might ("While I'm [Mighty], I have
  // [Deflect]…") sees a static +1 Might exactly as it sees a buff. Only
  // abilities that did NOT already apply in pass 1 are revisited, so stackable
  // keywords are never granted twice.
  const conditionReadsMight = (condition: Record<string, unknown> | undefined): boolean => {
    if (!condition) {
      return false;
    }
    if (condition.type === "while-mighty") {
      return true;
    }
    const nested = condition.conditions;
    if (Array.isArray(nested)) {
      return nested.some((c) => conditionReadsMight(c as Record<string, unknown>));
    }
    return conditionReadsMight(condition.condition as Record<string, unknown> | undefined);
  };
  const pass1Applied = new Set<string>();

  const applyPass = (allowedEffects: Set<string>, opts?: { onlyMightDependent?: boolean }): void => {
    for (const card of boardCards) {
      const abilities = registry.getAbilities(card.id) ?? [];

      for (const [abilityIndex, ability] of abilities.entries()) {
        if (ability.type !== "static") {
          continue;
        }
        const abilityKey = `${card.id}#${abilityIndex}`;

        const effect = ability.effect as Record<string, unknown> | undefined;
        if (!effect) {
          continue;
        }
        // rule-id: ven-070-166 — a static "+N Might and [Keyword]" parses as a
        // `sequence`; unwrap so each sub-effect lands in its proper pass.
        const candidateEffects =
          effect.type === "sequence" && Array.isArray(effect.effects)
            ? (effect.effects as Record<string, unknown>[])
            : [effect];
        const passEffects = candidateEffects.filter((e) => {
          const t = e?.type as string | undefined;
          return !!t && allowedEffects.has(t);
        });
        if (passEffects.length === 0) {
          continue;
        }

        // Evaluate condition (if any). Pass 2 sees the effects of pass 1
        // Already applied (granted keywords), which is what enables
        // Dependency cases like "while-has-keyword-tank: +1 might".
        const condition = ability.condition as Record<string, unknown> | undefined;
        if (opts?.onlyMightDependent && (!conditionReadsMight(condition) || pass1Applied.has(abilityKey))) {
          continue;
        }
        // rule 718 — while an Equipment is attached, "I"/"me" in its effect text
        // means the equipped unit, so an `effectText` static evaluates its
        // condition with the holder as self. The grant target is remapped
        // separately (`resolveStaticTargets` / `applyStaticEffect`).
        // rule 434.1.d — a clause about "THIS" (the Equipment) rather than "me"
        // (the holder) keeps the Equipment as its subject through that remap.
        const conditionSource = SELF_IS_ATTACHMENT_CONDITIONS.has(condition?.type as string)
          ? card
          : effectTextSelf(card, ability as unknown as { effectText?: boolean }, boardCards, ctx);
        if (condition && !evaluateCondition(condition, conditionSource, ctx)) {
          continue;
        }
        if (allowedEffects === PASS_1_EFFECTS) {
          pass1Applied.add(abilityKey);
        }

        // Resolve targets
        const { affects } = ability as unknown as { affects?: string };
        const defaultTargetIds = resolveStaticTargets(affects, card, boardCards, ctx);

        for (const passEffect of passEffects) {
          // rule-id: unl-058-219 — with no `affects`, honour the effect's own
          // group target descriptor (e.g. "Your token units") over self.
          const targetIds =
            affects === undefined
              ? (resolveStaticTargetsFromDescriptor(passEffect.target, card, grantableCards, ctx) ??
                defaultTargetIds)
              : defaultTargetIds;
          // rule 364.3 (unl-210-219) — a `while-unit-state` condition names the
          // subject, so only units in that state take the effect (the attacker
          // standing on the same battlefield is not defending alone).
          const scopedTargetIds =
            condition?.type === "while-unit-state"
              ? targetIds.filter((id) => {
                  const targetCard = boardCards.find((c) => c.id === id);
                  return (
                    targetCard !== undefined &&
                    unitMatchesUnitState(targetCard, condition.state as string | undefined, ctx)
                  );
                })
              : targetIds;
          applyStaticEffect(passEffect, scopedTargetIds, ctx, card);
        }
        anyApplied = true;
      }
    }
  };

  // Pass 1 — type/ability-setting
  applyPass(PASS_1_EFFECTS);
  // Pass 2 — arithmetic
  applyPass(PASS_2_EFFECTS);
  // rule 476.3 — re-check Might-dependent ability grants against post-arithmetic Might
  applyPass(PASS_1_EFFECTS, { onlyMightDependent: true });

  // rule 364.3 (ogn-053-298): turn-scoped continuous effects created by a
  // spell/ability ("Buffs give an additional +1 [Might] to friendly units this
  // turn") apply like statics from a virtual source controlled by the caster.
  for (const ts of ctx.draft.turnStatics ?? []) {
    const effect = ts.effect as Record<string, unknown> | undefined;
    if (!effect || typeof effect.type !== "string") {
      continue;
    }
    const source: BoardCard = { id: ts.sourceCardId, owner: ts.controllerId, zone: "" };
    const targetIds = resolveStaticTargetsFromDescriptor(effect.target, source, boardCards, ctx) ?? [];
    applyStaticEffect(effect, targetIds, ctx, source);
    anyApplied = true;
  }

  return anyApplied;
}

/**
 * rule 718.3 / 819.3 — a keyword granted to an ATTACHED Equipment functions on
 * its bearer only when a unit can use it (combat / trigger / state keywords).
 * Play-speed keywords describe how the Equipment card is played and stay on the
 * gear ([Quick-Draw] is not in KEYWORD_DEFINITIONS, so it is named explicitly).
 */
function keywordFunctionsOnBearer(keyword: string): boolean {
  if (keyword === "Quick-Draw") {
    return false;
  }
  return KEYWORD_DEFINITIONS[keyword]?.category !== "play";
}
