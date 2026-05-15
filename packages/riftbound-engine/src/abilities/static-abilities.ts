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
import { computeEffectiveMight, getGlobalCardRegistry } from "../operations/card-lookup";
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
    updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
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
      // Rule 708 — "A Unit 'is Mighty' as long as its Might is 5 or greater."
      // Rule 710 — "Units on the board are evaluated according to their
      // Current Might." Current Might includes EVERY contribution: base,
      // [+1] buff, runtime mightModifier, in-combat combatMightModifier,
      // Static aura bonuses, AND attached-equipment Might Bonus. Previously
      // This short-form only summed base + buffed + mightModifier, which
      // Wrongly evaluated `while-mighty` as false for units that were Mighty
      // Only via a static aura, in-combat Shield/Assault, or equipped gear.
      // Route through the single source of truth (`computeEffectiveMight`)
      // So this matches the rule-520 death check and effect-executor's
      // `getEffectiveMight`.
      const eff = computeEffectiveMight(source.id, (id) =>
        ctx.cards.getCardMeta(id as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined,
      );
      return eff >= MIGHTY_THRESHOLD;
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
      // Rule 741.1: "A unit is alone when there are no other friendly units
      // At the same location." Rule 740.1: friendly = SHARES A CONTROLLER
      // (not the same owner). After Hostile Takeover, a controlled unit is
      // Friendly to its new controller for purposes of "alone" — so the
      // Sole friendly unit at the battlefield, even if half of them are
      // Stolen, is one alone-side. Previously this read owner only, which
      // Gave the wrong answer immediately after a take-control.
      if (!source.zone.startsWith("battlefield")) {
        return false;
      }
      const cardsAtZone = ctx.zones.getCardsInZone(source.zone as CoreZoneId);
      const cardsBag = ctx.cards as {
        getCardController?: (id: CoreCardId) => string | undefined;
        getCardOwner: (id: CoreCardId) => string | undefined;
      };
      const controllerOf = (id: CoreCardId): string =>
        (cardsBag.getCardController?.(id) ?? cardsBag.getCardOwner(id) ?? "") as string;
      // Use the SOURCE's current controller. `source.owner` is filled in by
      // `getAllBoardCards` from `getCardOwner` — for the source unit itself,
      // We want its CONTROLLER for the friendly check (the unit's controller
      // Is the "you" in "I am alone").
      const sourceController = controllerOf(source.id as CoreCardId);
      const friendlyCount = cardsAtZone.filter(
        (id) => controllerOf(id) === sourceController,
      ).length;
      return friendlyCount === 1;
    }

    case "while-equipped": {
      const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      return (meta?.equippedWith?.length ?? 0) > 0;
    }

    case "control-battlefield": {
      const comparison = condition.count as { gte?: number; lte?: number; eq?: number } | undefined;
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
      return ctx.draft.additionalCostsPaid?.[source.id] === true;
    }

    case "while-level": {
      const threshold = (condition.threshold as number) ?? 0;
      const player = ctx.draft.players[source.owner];
      return (player?.xp ?? 0) >= threshold;
    }

    case "xp-gained-this-turn": {
      const gained = ctx.draft.xpGainedThisTurn?.[source.owner] ?? 0;
      return gained > 0;
    }

    case "event-this-turn": {
      const eventType = condition.event as string;
      const events = ctx.draft.turnEvents?.[source.owner] ?? [];
      return events.includes(eventType);
    }

    case "turn-count-at-least": {
      // True when the source card's controlling player has taken at least
      // `threshold` turns. Used by Forgotten Monument to gate scoring on
      // A player's third turn.
      const threshold = (condition.threshold as number) ?? 0;
      const player = ctx.draft.players[source.owner];
      return (player?.turnsTaken ?? 0) >= threshold;
    }

    case "custom": {
      // Best-effort interpretation of a free-text condition the parser
      // Couldn't fully structure. Currently recognizes "moved twice this
      // Turn" (Kayn, Unleashed). Unrecognized text → false (we never apply a
      // Restriction without a positive match).
      const text = String(condition.text ?? "").toLowerCase();
      if (/moved\s+twice\s+this\s+turn/.test(text)) {
        const meta = ctx.cards.getCardMeta(source.id as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        return (meta?.movedThisTurnCount ?? 0) >= 2;
      }
      return false;
    }

    default: {
      // Unknown condition — default to true (apply the effect)
      return true;
    }
  }
}

/**
 * Resolve which cards a static ability's effect applies to.
 */
function resolveStaticTargets(
  affects: string | undefined,
  source: BoardCard,
  boardCards: BoardCard[],
): string[] {
  switch (affects) {
    case "self":
    case undefined: {
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
 * Apply a static effect (might modification or keyword grant) to target cards.
 *
 * Accumulates into `staticMightBonus` and adds keywords with `duration: "static"`.
 */
function applyStaticEffect(
  effect: Record<string, unknown>,
  targetIds: string[],
  ctx: StaticAbilityContext,
): void {
  const effectType = effect.type as string;

  if (effectType === "modify-might") {
    const rawAmount = (effect.amount as number) ?? 0;
    // Rule 472.3.b (snapshotting) — a static modify-might aura with a
    // "to a minimum of N" rider must clamp its contribution so the target's
    // Post-application Might floor equals the snapshotted minimum. For static
    // Auras the snapshot recurs every recalc pass (the bonus is stripped and
    // Rebuilt), which is the rule-correct behavior — the floor is recomputed
    // When the aura would apply (e.g. Leona Zealot's "Stunned enemy units
    // Here have -8 [Might], to a minimum of 1 [Might]" on a 3-Might unit
    // Contributes -2, not -8).
    const minimumBound =
      typeof (effect as { minimum?: number }).minimum === "number"
        ? ((effect as { minimum: number }).minimum)
        : undefined;
    const registry = getGlobalCardRegistry();
    for (const targetId of targetIds) {
      const meta = ctx.cards.getCardMeta(targetId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const current = meta?.staticMightBonus ?? 0;
      let amount = rawAmount;
      if (minimumBound !== undefined && rawAmount < 0) {
        // Compute target's current effective Might (everything except *this*
        // Aura's pending contribution — `current` already holds prior auras
        // Applied this pass and any non-static modifiers).
        const def = registry.get(targetId);
        const baseMight = def?.might ?? 0;
        if (baseMight > 0) {
          const buffBonus = meta?.buffed ? 1 : 0;
          const mightMod = meta?.mightModifier ?? 0;
          const combatMightMod = meta?.combatMightModifier ?? 0;
          let equipBonus = 0;
          for (const equipId of meta?.equippedWith ?? []) {
            equipBonus += registry.getMightBonus(equipId);
          }
          const effective = baseMight + buffBonus + mightMod + combatMightMod + current + equipBonus;
          if (effective + rawAmount < minimumBound) {
            amount = minimumBound - effective;
            if (amount > 0) {
              amount = 0;
            }
          }
        }
      }
      ctx.cards.updateCardMeta(
        targetId as CoreCardId,
        {
          staticMightBonus: current + amount,
        } as Partial<RiftboundCardMeta>,
      );
    }
  } else if (effectType === "grant-keyword") {
    const keyword = effect.keyword as string;
    if (!keyword) {
      return;
    }
    const value = effect.value as number | undefined;
    for (const targetId of targetIds) {
      const meta = ctx.cards.getCardMeta(targetId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const existing = meta?.grantedKeywords ?? [];
      // Only add if not already granted statically with same keyword
      const alreadyGranted = existing.some(
        (gk) => gk.keyword === keyword && gk.duration === "static",
      );
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
        .filter((kw) => !existing.some((gk) => gk.keyword === kw && gk.duration === "static"))
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
  } else if (effectType === "restriction") {
    // A static restriction effect, e.g. Kayn, Unleashed:
    //   { restriction: "no-damage", type: "restriction" }  → rule 460.2.c.9
    const restriction = effect.restriction as string | undefined;
    if (restriction === "no-damage") {
      for (const targetId of targetIds) {
        ctx.cards.updateCardMeta(
          targetId as CoreCardId,
          { cannotTakeDamage: true } as Partial<RiftboundCardMeta>,
        );
      }
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
  const registry = getGlobalCardRegistry();
  let anyApplied = false;

  // Step 1: Strip all static modifications
  for (const card of boardCards) {
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

    // Clear `cannotTakeDamage` ONLY for cards that own a static "no-damage"
    // Restriction ability — it'll be re-set below if the condition still
    // Holds. Cards flagged via other means (a one-shot effect, combat) keep
    // Their flag; this recalc only governs *static* sources of it.
    if (meta.cannotTakeDamage === true) {
      const hasStaticNoDamage = (registry.getAbilities(card.id) ?? []).some((ab) => {
        if (ab.type !== "static") {
          return false;
        }
        const eff = ab.effect as Record<string, unknown> | undefined;
        return eff?.type === "restriction" && eff?.restriction === "no-damage";
      });
      if (hasStaticNoDamage) {
        ctx.cards.updateCardMeta(
          card.id as CoreCardId,
          { cannotTakeDamage: false } as Partial<RiftboundCardMeta>,
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

  const PASS_1_EFFECTS = new Set(["grant-keyword", "grant-keywords", "restriction"]);
  const PASS_2_EFFECTS = new Set(["modify-might"]);

  const applyPass = (allowedEffects: Set<string>): void => {
    for (const card of boardCards) {
      // Rule 718.2 / 721.2 / 723 — "While [Attached], the card's printed
      // Rules Text is Inactive" and "Inactive Abilities do not trigger, do
      // Not apply, and cannot be activated." An attached card (e.g.
      // Equipment that's been Equipped to a unit) is still physically on
      // The board, but its OWN printed static abilities must not fire from
      // The card's location — its Effect Text is appended to the Top-Most
      // Card (rule 718.3) via a separate Might-Bonus / appended-ability
      // Path. Filter here so a static like "Your units have +1 [M]" on an
      // Unequipped Trinket only applies once attached behaviour is wired
      // Through the Top-Most card.
      const cardMeta = ctx.cards.getCardMeta(card.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      if (cardMeta?.attachedTo) {
        continue;
      }

      const abilities = registry.getAbilities(card.id) ?? [];

      for (const ability of abilities) {
        if (ability.type !== "static") {
          continue;
        }

        const effect = ability.effect as Record<string, unknown> | undefined;
        if (!effect) {
          continue;
        }
        const effectType = effect.type as string | undefined;
        if (!effectType || !allowedEffects.has(effectType)) {
          continue;
        }

        // Evaluate condition (if any). Pass 2 sees the effects of pass 1
        // Already applied (granted keywords), which is what enables
        // Dependency cases like "while-has-keyword-tank: +1 might".
        const condition = ability.condition as Record<string, unknown> | undefined;
        if (condition && !evaluateCondition(condition, card, ctx)) {
          continue;
        }

        // Resolve targets
        const { affects } = ability as unknown as { affects?: string };
        const targetIds = resolveStaticTargets(affects, card, boardCards);

        applyStaticEffect(effect, targetIds, ctx);
        anyApplied = true;
      }
    }
  };

  // Pass 1 — type/ability-setting
  applyPass(PASS_1_EFFECTS);
  // Pass 2 — arithmetic
  applyPass(PASS_2_EFFECTS);

  return anyApplied;
}
