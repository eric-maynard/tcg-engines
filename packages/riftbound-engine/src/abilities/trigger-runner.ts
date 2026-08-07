/**
 * Trigger Runner
 *
 * Executes matched triggers by running their effects.
 * Called from move reducers after game events occur.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { addToChain, createInteractionState } from "../chain/chain-state";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import { getLKI, getLeavingBatch } from "../operations/leave-board";
import { scoreWithinConditionMet } from "../operations/score-within";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";
import type { DelayedTrigger } from "../types/game-state";
import type { EffectContext, ExecutableEffect } from "./effect-executor";
import { executeEffect } from "./effect-executor";
import type { GameEvent } from "./game-events";
import { evaluateLegionCondition } from "./legion-conditions";
import { recalculateStaticEffects } from "./static-abilities";
import { lockTriggerTargets, triggerTargetsSatisfiable } from "./trigger-target-lock";
import type {
  CardWithAbilities,
  MatchedTrigger,
  TriggerableAbility,
} from "./trigger-matcher";
import { abilityFunctionsFromTrash, findMatchingTriggers, turnEventCountKeys } from "./trigger-matcher";

/**
 * rule-id: ogn-100-298 (Gemcraft Seer) — effect keywords granted by another
 * card's static ("Other friendly units have [Vision]") live only in
 * `meta.grantedKeywords`, so synthesize the triggered ability the keyword
 * stands for (mirrors the parser's KEYWORD_TRIGGER_EVENTS expansion).
 */
const GRANTED_KEYWORD_TRIGGERS: Readonly<Record<string, TriggerableAbility>> = {
  Vision: {
    // Rule 729: When you play me, look at the top card of your Main Deck. You may recycle it.
    effect: { amount: 1, from: "deck", then: { recycle: 1 }, type: "look" },
    // rule 817.1.b: a unit TOKEN is played too ("Play a 3 [Might] Mech unit
    // token"), so its Vision looks as well — `play-token-unit` is that play.
    trigger: { event: "play-self-or-play-token-unit", on: "self" },
    type: "triggered",
  },
};

/**
 * rule 808.1 (Deathknell) / rule 729 (Vision): keywords that are pure trigger
 * shorthand for "when <event> happens to me, get the attached effect".
 * Mirrors the parser's `KEYWORD_TRIGGER_EVENTS`.
 */
const KEYWORD_SELF_TRIGGER_EVENTS: Readonly<Record<string, string>> = {
  Deathknell: "die",
  Vision: "play-self-or-play-token-unit",
};

/**
 * Who controls the triggered ability once it goes on the Chain.
 *
 * Normally the controller of the card carrying the ability. But a text that
 * names the acting player — "When a player plays a spell, THEY may …"
 * (rule-id: unl-205-219 Abandoned Hall) — belongs to whoever caused the event,
 * so "a unit they control here" and the "you may" prompt both follow that
 * player. Opted into per-ability via `trigger.controllerFromEvent`.
 */
function triggerControllerFor(match: MatchedTrigger): string {
  const trigger = (
    match.ability as { trigger?: { controllerFromEvent?: boolean; controllerId?: string } }
  ).trigger;
  // rule 392 — a delayed ability installed by one player on another player's
  // permanent still belongs to its installer.
  if (typeof trigger?.controllerId === "string" && trigger.controllerId !== "") {
    return trigger.controllerId;
  }
  if (trigger?.controllerFromEvent !== true) {
    return match.cardOwner;
  }
  const evt = match.event as {
    playerId?: string;
    owner?: string;
    movedBy?: string;
    killedBy?: string;
    chooserId?: string;
  };
  return (
    evt.playerId ?? evt.owner ?? evt.movedBy ?? evt.killedBy ?? evt.chooserId ?? match.cardOwner
  );
}

/**
 * rule-id: unl-095-219 (rule 364.3) — triggered abilities an effect installed
 * on this card for a duration ("When it wins a combat this turn, gain 2 XP").
 */
function delayedTriggerAbilities(
  meta: Partial<RiftboundCardMeta> | undefined,
): TriggerableAbility[] {
  return delayedTriggerAbilitiesFrom(meta?.delayedTriggers);
}

function delayedTriggerAbilitiesFrom(
  entries: readonly DelayedTrigger[] | undefined,
): TriggerableAbility[] {
  const out: TriggerableAbility[] = [];
  for (const dt of entries ?? []) {
    out.push({
      effect: dt.effect as never,
      // rule 355.13 (sfd-184-221) — a granted "you may …" trigger still asks.
      ...(dt.optional === true ? { optional: true } : {}),
      trigger: {
        ...(dt.trigger.afterAttack === true ? { afterAttack: true } : {}),
        // rule 392 — resolves for whoever installed it, not the host's controller.
        ...(dt.controllerId !== undefined ? { controllerId: dt.controllerId } : {}),
        event: dt.trigger.event,
        on: dt.trigger.on ?? "self",
      },
      type: "triggered",
    });
  }
  return out;
}

function grantedKeywordAbilities(
  meta: Partial<RiftboundCardMeta> | undefined,
): TriggerableAbility[] {
  const out: TriggerableAbility[] = [];
  for (const gk of meta?.grantedKeywords ?? []) {
    // Rule 729.2: each instance of Vision triggers separately, so a granted
    // copy stacks with a printed one.
    const synth = GRANTED_KEYWORD_TRIGGERS[gk.keyword];
    if (synth) {
      out.push(synth);
    }
  }
  return out;
}

/**
 * Context passed from move reducers to the trigger runner.
 */
export interface TriggerRunnerContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void;
    drawCards: (params: {
      count: number;
      from: CoreZoneId;
      to: CoreZoneId;
      playerId: CorePlayerId;
    }) => void;
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    getCardZone?: (cardId: CoreCardId) => string | undefined;
  };
  readonly counters: {
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
    addCounter: (cardId: CoreCardId, counter: string, amount: number) => void;
    removeCounter?: (cardId: CoreCardId, counter: string, amount: number) => void;
    clearCounter?: (cardId: CoreCardId, counter: string) => void;
  };
  readonly cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
    updateCardMeta?: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
  /**
   * Create a new card instance directly in a zone.
   * Used for token creation (rule 170-178).
   */
  readonly createCardInZone?: (cardId: string, zoneId: string, ownerId: string) => void;
  /**
   * Escape hatch: when true, execute matched triggers immediately instead of
   * placing them on the chain. Rule 583.3 says triggers go on the chain, so
   * this should only be set by callers that run outside the priority loop
   * (flow-phase hooks). Default false.
   */
  readonly resolveInline?: boolean;
}

/**
 * Convert card definition abilities to TriggerableAbility format.
 */
export function toTriggerableAbilities(cardId: string): TriggerableAbility[] {
  const registry = getGlobalCardRegistry();
  const abilities = registry.getAbilities(cardId);
  if (!abilities) {
    return [];
  }

  const result: TriggerableAbility[] = [];
  for (const a of abilities) {
    if (a.type === "triggered" && a.trigger) {
      result.push({
        condition: (a as { condition?: unknown }).condition,
        effect: a.effect,
        optional: a.optional,
        trigger: {
          // rule-id: unl-205-219 — keep the "the acting player controls this
          // trigger" flag; dropping it here re-routes the ability to the card's
          // own controller.
          controllerFromEvent: (a.trigger as { controllerFromEvent?: boolean })
            .controllerFromEvent,
          event: a.trigger.event,
          on: a.trigger.on,
          restrictions: (a.trigger as { restrictions?: readonly { type: string; count?: number }[] })
            .restrictions,
          // rule-id: sfd-075-221 — "an activated ability of a GEAR" qualifies
          // the acting source; dropping it here would fire the trigger on
          // every activated ability, legend and unit ones included.
          sourceType: (a.trigger as { sourceType?: string }).sourceType,
          // rule-id: sfd-120-221 (rule 469.1) — keep the "after an attack"
          // qualifier; dropping it fires the trigger on a walk-in conquer.
          afterAttack: (a.trigger as { afterAttack?: boolean }).afterAttack,
        },
        type: "triggered",
      });
    }
    // rule-id: ogn-020-298 — rule 724: the parser keeps "[Legion] — When you
    // play me, …" as a bare `{type:"keyword", keyword:"Legion", effect}`
    // ability, which no event would ever match. Synthesise the play-self
    // trigger it stands for, gated by the Legion condition. Cost-shaped Legion
    // riders ("[Legion] — I cost [2] less.") are read by the cost path instead.
    if (a.type === "keyword" && (a as { keyword?: string }).keyword === "Legion") {
      const effect = (a as { effect?: unknown }).effect as
        | { type?: string }
        | undefined;
      const kind = effect?.type;
      if (effect && kind !== "cost-reduction" && kind !== "cost-increase") {
        result.push({
          condition: { type: "legion" },
          effect: effect as never,
          trigger: { event: "play-self", on: "self" },
          type: "triggered",
        });
      }
    }
    // rule-id: unl-067-219 — rule 808.1: "[Deathknell] — Deal 4 to an enemy
    // unit." is a trigger shorthand. Card definitions that spell their
    // abilities out by hand carry only `{type:"keyword", keyword, effect}`
    // (explicit `abilities` bypass the parser's KEYWORD_TRIGGER_EVENTS
    // expansion), so synthesise the self-trigger the keyword stands for.
    if (a.type === "keyword") {
      const kw = (a as { keyword?: string }).keyword;
      const event = kw ? KEYWORD_SELF_TRIGGER_EVENTS[kw] : undefined;
      const effect = (a as { effect?: unknown }).effect;
      // A card whose parsed abilities already carry the expanded trigger must
      // not fire twice, so only synthesise when no equivalent entry exists.
      if (
        event &&
        effect &&
        !abilities.some(
          (other) =>
            other.type === "triggered" &&
            // Compare per "-or-" alternative: the parser expands [Vision] to a
            // bare `play-self` trigger while the synthesised one also covers
            // `play-token-unit`, and they are still the same one ability.
            (other.trigger?.event ?? "")
              .split("-or-")
              .some((x) => event.split("-or-").includes(x)) &&
            JSON.stringify((other as { effect?: unknown }).effect) === JSON.stringify(effect),
        )
      ) {
        result.push({
          condition: (a as { condition?: unknown }).condition,
          effect: effect as never,
          trigger: { event, on: "self" },
          type: "triggered",
        });
      }
    }
  }
  return result;
}

/**
 * rule-id: sfd-119-221 — pull the `{ type: "pay-cost", cost }` clause out of a
 * triggered ability's condition (top-level or one level inside an `and`) so
 * the chain item can charge it on opt-in.
 */
export function extractPayCost(condition: unknown): Record<string, unknown> | undefined {
  if (!condition || typeof condition !== "object") {
    return undefined;
  }
  const c = condition as { type?: string; cost?: unknown; conditions?: unknown[] };
  if (c.type === "pay-cost" && c.cost && typeof c.cost === "object") {
    return c.cost as Record<string, unknown>;
  }
  if (c.type === "and" && Array.isArray(c.conditions)) {
    for (const sub of c.conditions) {
      const found = extractPayCost(sub);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * Evaluate whether a triggered ability's `condition` holds against the
 * current game state. Returns `true` if there is no condition or the
 * condition is satisfied.
 *
 * Currently supports:
 *   - `{ type: "legion" }` — Rule 724, "you played another card this turn"
 *
 * Unknown condition shapes are permissive (return `true`) so the engine
 * does not silently drop triggers with as-yet-unsupported condition
 * structures.
 */
export function evaluateTriggerCondition(
  condition: unknown,
  state: RiftboundGameState,
  controllerId: string,
  event: GameEvent,
  ctx?: TriggerRunnerContext,
  sourceCardId?: string,
): boolean {
  if (!condition || typeof condition !== "object") {
    return true;
  }
  const c = condition as { type?: string };
  if (c.type === "legion") {
    return evaluateLegionCondition(state, controllerId);
  }
  if (c.type === "while-level") {
    // rule 831.1 (rule-id: unl-040-219, Wuju Apprentice) — a `[Level N]` gate on
    // a TRIGGERED ability is checked when the trigger would go on the chain:
    // below N XP the ability simply does not trigger.
    const threshold = (c as { threshold?: number }).threshold ?? 0;
    return (state.players[controllerId]?.xp ?? 0) >= threshold;
  }
  if (c.type === "score-within") {
    // rule 383.2.a.1 (rule-id: unl-116-219, Poppy Paragon) — "if an opponent's
    // score is within N points of the Victory Score" sits in the trigger
    // Condition: out of range the ability is never put on the chain at all.
    return scoreWithinConditionMet(
      c as { points?: number; range?: number; whose?: string },
      state as never,
      controllerId,
    );
  }
  if (c.type === "paid-additional-cost") {
    // Zaun Punk (sfd-160-221) et al: the payoff fires only when the optional
    // additional cost was actually paid. The play event carries the flag; if
    // absent the enumeration hasn't run and the payoff must NOT fire for free.
    return (event as { paidAdditionalCost?: boolean }).paidAdditionalCost === true;
  }
  if (c.type === "spell-energy-spent") {
    // rule 135.2 (rule-id: unl-005-219) — "When you play a spell, if you spent
    // [N] or more": the Energy actually paid for THAT spell (a paid [Repeat]
    // counts, rule 820.1.d). Energy or power spent on anything else this turn
    // is irrelevant, so read the per-card ledger, never a turn tally.
    const needed = (c as { amount?: number }).amount ?? 1;
    const playedId = (event as { cardId?: string }).cardId;
    if (playedId === undefined) {
      return false;
    }
    const paid =
      (state as { spellEnergySpentByCard?: Record<string, number> }).spellEnergySpentByCard?.[
        playedId
      ] ?? 0;
    return paid >= needed;
  }
  if (c.type === "excess-damage-assigned") {
    // rule-id: ogn-034-298 (Tryndamere) / unl Trapping Grounds — rule 626.1.d.2:
    // "if you assigned N or more excess damage" reads the excess the attackers
    // assigned in the combat that produced this conquer. A conquer with no
    // combat (empty battlefield, rule 316.8.b.1) assigned none, so it fails.
    const needed = (c as { amount?: number }).amount ?? 1;
    return ((event as { excessDamage?: number }).excessDamage ?? 0) >= needed;
  }
  if (c.type === "played-power-cost") {
    // rule 206.1 (rule-id: sfd-100-221, Yordle Explorer) — "a card with Power
    // cost [rainbow][rainbow] or more" reads the PRINTED Power cost of the
    // played card. Additional costs and Accelerate pips are paid on top of it
    // (rule 206) and never raise it, so read the registry, not what was spent.
    const needed = (c as { amount?: number }).amount ?? 1;
    const playedId = (event as { cardId?: string }).cardId;
    if (playedId === undefined) {
      return false;
    }
    return getGlobalCardRegistry().getPowerCost(playedId).length >= needed;
  }
  if (c.type === "while-empowered") {
    // Rule 827 (rule-id: ven-136-166): `[Empowered][>]` triggers fire only
    // while the source is Empowered.
    if (!ctx || !sourceCardId) {
      return false;
    }
    return ctx.cards.getCardMeta(sourceCardId as CoreCardId)?.empowered === true;
  }
  if (c.type === "while-mighty" && (c as { target?: unknown }).target === undefined) {
    // rule 708/710 — "if I was [Mighty]" reads the source's own effective
    // Might. rule 808.1.d.3: for a Deathknell the attributes are noted as the
    // unit dies, so prefer the stamped LKI over the reset object in the trash.
    if (!sourceCardId) {
      return true;
    }
    if (event.type === "die" && (event as { cardId?: string }).cardId === sourceCardId) {
      const stamped = (event as { wasMighty?: boolean }).wasMighty;
      if (typeof stamped === "boolean") {
        return stamped;
      }
    }
    if (!ctx) {
      return true;
    }
    return currentMightForTriggers(sourceCardId, ctx) >= MIGHTY_MIGHT;
  }
  if (c.type === "while-at-battlefield") {
    // rule-id: ogn-067-298 (Blitzcrank, Impassive) — "When you play me to a
    // battlefield" must not fire when the unit is played to base.
    if (!ctx || !sourceCardId) {
      return true;
    }
    const zone = ctx.zones.getCardZone?.(sourceCardId as CoreCardId);
    if (zone !== undefined) {
      return zone.startsWith("battlefield-");
    }
    for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
      const ids = ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId);
      if (ids.some((id) => (id as string) === sourceCardId)) {
        return true;
      }
    }
    return false;
  }
  if (c.type === "fewer-runes-than-opponent" && ctx) {
    // rule-id: ven-005-166 (Forsaken Baccai) — compare rune pool sizes; the
    // trigger only goes on the chain if some opponent controls more runes.
    const runeCount = (pid: string): number =>
      ctx.zones.getCardsInZone("runePool" as CoreZoneId, pid as CorePlayerId).length;
    const mine = runeCount(controllerId);
    return Object.keys(ctx.draft.players ?? {}).some(
      (pid) => pid !== controllerId && runeCount(pid) > mine,
    );
  }
  if (c.type === "control" && ctx) {
    // rule-id: ven-058-166 (Patched Porobot) / rule 383.2.a.1 — an "if you
    // control N <thing>" clause is part of the trigger condition; with fewer
    // than N matching permanents the ability must not be put on the chain.
    return evaluateControlCondition(
      (c as { target?: unknown }).target,
      ctx,
      controllerId,
      sourceCardId,
    );
  }
  if (c.type === "alone-in-combat" && ctx) {
    // rule-id: sfd-110-221 (Fiora, Peerless) / rule 740.2.a-b — "one on one":
    // the source has no other friendly unit at its location AND exactly one
    // enemy unit is there. With a `target` (UNL "an enemy/friendly unit is
    // alone here") only that side is checked.
    let hereZone: string | undefined =
      typeof (event as { battlefieldId?: unknown }).battlefieldId === "string"
        ? `battlefield-${(event as { battlefieldId: string }).battlefieldId}`
        : sourceCardId
          ? (ctx.zones.getCardZone?.(sourceCardId as CoreCardId) as string | undefined)
          : undefined;
    if (hereZone === undefined && sourceCardId) {
      for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
        const ids = ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId);
        if (ids.some((id) => (id as string) === sourceCardId)) {
          hereZone = `battlefield-${bfId}`;
          break;
        }
      }
    }
    if (hereZone === undefined || !hereZone.startsWith("battlefield-")) {
      return true;
    }
    const registry = getGlobalCardRegistry();
    let friendly = 0;
    let enemy = 0;
    for (const id of ctx.zones.getCardsInZone(hereZone as CoreZoneId)) {
      const def = registry.get(id as string) as { cardType?: string } | undefined;
      if (def?.cardType !== undefined && def.cardType !== "unit") {
        continue;
      }
      const owner = ctx.cards.getCardOwner(id as CoreCardId) as string | undefined;
      if (owner === undefined) {
        continue;
      }
      if (owner === controllerId) {
        friendly++;
      } else {
        enemy++;
      }
    }
    const targetController = (c as { target?: { controller?: string } }).target?.controller;
    if (targetController === "enemy") {
      return enemy === 1;
    }
    if (targetController === "friendly") {
      return friendly === 1;
    }
    return friendly === 1 && enemy === 1;
  }
  if (c.type === "not-died-alone" && ctx) {
    // rule 740.2.a (unl-156-219 Loyal Poro, "[Deathknell] — If I didn't die
    // alone, draw 1") — exactly the negation of the alone test below, judged
    // at the location the unit died at.
    return !evaluateTriggerCondition(
      { type: "while-alone" },
      state,
      controllerId,
      event,
      ctx,
      sourceCardId,
    );
  }
  if (c.type === "while-alone" && ctx) {
    // rule 740.2.a — a unit is alone when NO OTHER FRIENDLY unit shares its
    // location (enemies don't matter). rule 428.1.a.1.b: a dying unit is
    // judged at the location it occupied as it died, not from the trash.
    let hereZone: string | undefined;
    if (event.type === "die" && (event as { cardId?: string }).cardId === sourceCardId) {
      // The leave-board choke point stamped the answer from the pre-event
      // board (its batch-mates were still there); prefer it over a re-count.
      const stamped = (event as { wasAlone?: boolean }).wasAlone;
      if (typeof stamped === "boolean") {
        return stamped;
      }
      if (typeof (event as { diedAt?: string }).diedAt === "string") {
        hereZone = (event as { diedAt: string }).diedAt;
      }
    }
    if (hereZone === undefined && sourceCardId) {
      hereZone = ctx.zones.getCardZone?.(sourceCardId as CoreCardId) as string | undefined;
    }
    if (hereZone === undefined) {
      return true;
    }
    const ids =
      hereZone === "base"
        ? ctx.zones.getCardsInZone("base" as CoreZoneId, controllerId as CorePlayerId)
        : ctx.zones.getCardsInZone(hereZone as CoreZoneId);
    const registry = getGlobalCardRegistry();
    for (const id of ids) {
      if ((id as string) === sourceCardId) {
        continue;
      }
      const def = registry.get(id as string) as { cardType?: string } | undefined;
      if (def?.cardType !== undefined && def.cardType !== "unit") {
        continue;
      }
      const owner =
        ctx.cards.getCardController?.(id as CoreCardId) ??
        (ctx.cards.getCardOwner(id as CoreCardId) as string | undefined);
      if (owner === controllerId) {
        return false;
      }
    }
    return true;
  }
  if (c.type === "exists-here" && ctx) {
    // rule-id: ven-138-166 (Shen, Leader of the Kinkou Order) — "if there is
    // exactly one other unit you control here" counts matching units at the
    // source's location, honouring exact quantity and excludeSelf.
    let hereZone: string | undefined = sourceCardId
      ? (ctx.zones.getCardZone?.(sourceCardId as CoreCardId) as string | undefined)
      : undefined;
    if (hereZone === undefined && sourceCardId) {
      for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
        const ids = ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId);
        if (ids.some((id) => (id as string) === sourceCardId)) {
          hereZone = `battlefield-${bfId}`;
          break;
        }
      }
    }
    if (hereZone === undefined) {
      return true;
    }
    return evaluateControlCondition(
      (c as { target?: unknown }).target,
      ctx,
      controllerId,
      sourceCardId,
      hereZone,
    );
  }
  // rule 383.2.a.1 — an `and` compound gates the trigger on every clause it
  // holds, but only the clauses understood here may veto it; the rest stay
  // permissive, exactly as they are on their own. (`pay-cost` is never a gate:
  // it is charged at opt-in time — see `extractPayCost`.)
  if (c.type === "and" && ctx && Array.isArray((c as { conditions?: unknown[] }).conditions)) {
    for (const sub of (c as { conditions: unknown[] }).conditions) {
      if (
        (sub as { type?: string } | undefined)?.type === "has-at-least" &&
        !evaluateHasAtLeastCondition(sub as { type?: string }, ctx, controllerId, event, sourceCardId)
      ) {
        return false;
      }
      if (
        (sub as { type?: string } | undefined)?.type === "has-exactly" &&
        !evaluateHasExactlyCondition(sub as { type?: string }, ctx, controllerId)
      ) {
        return false;
      }
    }
    return true;
  }
  if (c.type === "has-exactly" && ctx) {
    // rule 383.2.a.1 (rule-id: unl-088-219) — "if you have exactly N …" sits in
    // the trigger condition: with the wrong count nothing goes on the chain.
    return evaluateHasExactlyCondition(c, ctx, controllerId);
  }
  if (c.type === "has-at-least" && ctx) {
    // rule-id: sfd-218-221 (Sunken Temple) — "with one or more [Mighty] units"
    // is part of the trigger condition: with no Mighty unit here the ability
    // never goes on the chain (rule 466.5.d/466.6 evaluate it while the combat
    // designations — and their Might bonuses — are still in place).
    return evaluateHasAtLeastCondition(c, ctx, controllerId, event, sourceCardId);
  }
  return true;
}

/** rule 708/710 — Mighty is 5+ CURRENT Might. */
const MIGHTY_MIGHT = 5;

/**
 * rule 807.1.c/.d.1 — a combat-only bonus (Assault while attacking, Shield
 * while defending) is part of current Might for as long as the designation
 * lasts, so it counts toward Mighty while a combat trigger is evaluated.
 */
function currentMightForTriggers(cardId: string, ctx: TriggerRunnerContext): number {
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId) as
    | { might?: number; keywords?: readonly string[]; abilities?: readonly unknown[] }
    | undefined;
  const meta = ctx.cards.getCardMeta(cardId as CoreCardId) as Partial<RiftboundCardMeta> | undefined;
  let equipBonus = 0;
  for (const equipId of meta?.equippedWith ?? []) {
    equipBonus += registry.getMightBonus(equipId as string);
  }
  let might =
    (def?.might ?? 0) +
    (meta?.buffed ? 1 : 0) +
    (meta?.extraBuffs ?? 0) +
    (meta?.mightModifier ?? 0) +
    (meta?.staticMightBonus ?? 0) +
    (meta?.combatMightModifier ?? 0) +
    equipBonus;
  const role = meta?.combatRole;
  if (role === "attacker" || role === "defender") {
    const roleKeyword = role === "attacker" ? "Assault" : "Shield";
    for (const kw of def?.keywords ?? []) {
      if (kw === roleKeyword) {
        might += 1;
      }
    }
    for (const raw of def?.abilities ?? []) {
      const ability = raw as { type?: string; keyword?: string; value?: number };
      if (ability.type === "keyword" && ability.keyword === roleKeyword) {
        might += ability.value ?? 1;
      }
    }
    for (const gk of meta?.grantedKeywords ?? []) {
      if (gk.keyword === roleKeyword) {
        might += gk.value ?? 1;
      }
    }
  }
  return Math.max(0, might);
}

/**
 * `{ type: "has-at-least", count, target }` — count units matching `target`
 * (controller, `location: "here"`, the `mighty` filter) against `count`.
 * Filters this helper does not understand keep the clause permissive.
 */
function evaluateHasAtLeastCondition(
  condition: { type?: string },
  ctx: TriggerRunnerContext,
  controllerId: string,
  event: GameEvent,
  sourceCardId?: string,
): boolean {
  const c = condition as {
    count?: number;
    target?: { type?: string; controller?: string; location?: string; filter?: unknown };
  };
  const target = c.target;
  if (!target || typeof target !== "object") {
    return true;
  }
  const needed = c.count ?? 1;
  const filters =
    target.filter === undefined ? [] : Array.isArray(target.filter) ? target.filter : [target.filter];
  if (filters.some((f) => f !== "mighty")) {
    return true;
  }

  const zoneIds: string[] = [];
  if (target.location === "here") {
    const bfId = (event as { battlefieldId?: unknown }).battlefieldId;
    if (typeof bfId === "string") {
      zoneIds.push(`battlefield-${bfId}`);
    } else if (sourceCardId) {
      const zone = ctx.zones.getCardZone?.(sourceCardId as CoreCardId) as string | undefined;
      if (zone?.startsWith("battlefield-") === true) {
        zoneIds.push(zone);
      }
    }
    if (zoneIds.length === 0) {
      return true;
    }
  } else {
    for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
      zoneIds.push(`battlefield-${bfId}`);
    }
  }

  const registry = getGlobalCardRegistry();
  let count = 0;
  for (const zoneId of zoneIds) {
    for (const rawId of ctx.zones.getCardsInZone(zoneId as CoreZoneId)) {
      const id = rawId as string;
      const def = registry.get(id) as { cardType?: string; might?: number } | undefined;
      if (target.type === "unit" && def?.cardType !== "unit" && (def?.might ?? 0) <= 0) {
        continue;
      }
      const owner =
        ctx.cards.getCardController?.(id as CoreCardId) ??
        (ctx.cards.getCardOwner(id as CoreCardId) as string | undefined) ??
        "";
      if (target.controller === "enemy") {
        if (owner === controllerId || owner === "") {
          continue;
        }
      } else if (target.controller === "friendly" && owner !== controllerId) {
        continue;
      }
      if (filters.includes("mighty") && currentMightForTriggers(id, ctx) < MIGHTY_MIGHT) {
        continue;
      }
      count++;
      if (count >= needed) {
        return true;
      }
    }
  }
  return false;
}

/**
 * rule 383.2.a.1 — "if you have EXACTLY N <things>": count the matching cards
 * and require the count to hit `N` on the nose. Locations understood: `hand`
 * (and the other private zones), `battlefield` (units you control summed over
 * every battlefield — base never counts) and `base`. An unrecognised shape
 * stays permissive, like every other condition kind here.
 */
function evaluateHasExactlyCondition(
  condition: { type?: string },
  ctx: TriggerRunnerContext,
  controllerId: string,
): boolean {
  const c = condition as {
    count?: number;
    target?: { type?: string; controller?: string; location?: string };
  };
  const target = c.target;
  if (!target || typeof target !== "object" || typeof target.location !== "string") {
    return true;
  }
  const needed = c.count ?? 0;
  const players = Object.keys(ctx.draft.players ?? {});
  const subjects =
    target.controller === "enemy" ? players.filter((p) => p !== controllerId) : [controllerId];

  const privateZone =
    target.location === "hand"
      ? "hand"
      : target.location === "trash"
        ? "trash"
        : target.location === "deck"
          ? "mainDeck"
          : undefined;
  if (privateZone !== undefined) {
    let count = 0;
    for (const pid of subjects) {
      count += ctx.zones.getCardsInZone(privateZone as CoreZoneId, pid as CorePlayerId).length;
    }
    return count === needed;
  }

  if (target.location !== "battlefield" && target.location !== "base") {
    return true;
  }
  const registry = getGlobalCardRegistry();
  const controllerOf = (id: string): string =>
    (ctx.cards.getCardController?.(id as CoreCardId) ??
      (ctx.cards.getCardOwner(id as CoreCardId) as string | undefined)) ??
    "";
  let count = 0;
  const tally = (ids: readonly unknown[]): void => {
    for (const rawId of ids) {
      const id = rawId as string;
      const def = registry.get(id) as { cardType?: string } | undefined;
      if (target.type === "unit" && def?.cardType !== "unit") {
        continue;
      }
      if (!subjects.includes(controllerOf(id))) {
        continue;
      }
      count++;
    }
  };
  if (target.location === "base") {
    for (const pid of subjects) {
      tally(ctx.zones.getCardsInZone("base" as CoreZoneId, pid as CorePlayerId));
    }
  } else {
    for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
      tally(ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId));
    }
  }
  return count === needed;
}

/**
 * Count permanents on the board (base + battlefields) controlled by
 * `controllerId` that match a parsed `ControlCondition.target`, and compare
 * against `target.quantity.atLeast` (default 1).
 */
function evaluateControlCondition(
  target: unknown,
  ctx: TriggerRunnerContext,
  controllerId: string,
  sourceCardId?: string,
  onlyZone?: string,
): boolean {
  if (!target || typeof target !== "object") {
    return true;
  }
  const t = target as {
    type?: string;
    controller?: string;
    excludeSelf?: boolean;
    filter?: unknown;
    quantity?: { atLeast?: number; exactly?: number } | number;
  };
  // rule-id: ven-138-166 — `{ exactly: N }` must match the count precisely.
  const exact =
    typeof t.quantity === "object" && typeof t.quantity?.exactly === "number"
      ? t.quantity.exactly
      : undefined;
  const min =
    exact !== undefined
      ? exact
      : typeof t.quantity === "number"
        ? t.quantity
        : typeof t.quantity === "object" && typeof t.quantity?.atLeast === "number"
          ? t.quantity.atLeast
          : 1;

  const filters = t.filter === undefined ? [] : Array.isArray(t.filter) ? t.filter : [t.filter];
  // rule-id: ogn-101-298 — "a facedown card at a battlefield" lives in the
  // `facedown-<bf>` zones, which the board scan below never visits. Only pull
  // them in when the clause actually asks for facedown cards: a hidden card is
  // not a unit/gear in play and must not satisfy any other control clause.
  const wantsFacedown = filters.some((f) => f === "facedown");

  const ids: string[] = [];
  if (onlyZone?.startsWith("battlefield-")) {
    ids.push(...ctx.zones.getCardsInZone(onlyZone as CoreZoneId).map((x) => x as string));
  } else {
    for (const playerId of Object.keys(ctx.draft.players ?? {})) {
      ids.push(
        ...ctx.zones
          .getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId)
          .map((x) => x as string),
      );
    }
    if (onlyZone === undefined) {
      for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
        ids.push(
          ...ctx.zones
            .getCardsInZone(`battlefield-${bfId}` as CoreZoneId)
            .map((x) => x as string),
        );
      }
    }
  }
  if (wantsFacedown) {
    for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
      ids.push(
        ...ctx.zones.getCardsInZone(`facedown-${bfId}` as CoreZoneId).map((x) => x as string),
      );
    }
  }

  const registry = getGlobalCardRegistry();
  let count = 0;
  for (const id of ids) {
    if (t.excludeSelf && id === sourceCardId) {
      continue;
    }
    const owner = ctx.cards.getCardOwner(id as CoreCardId) ?? "";
    if (t.controller === "enemy") {
      if (owner === controllerId || owner === "") {
        continue;
      }
    } else if (owner !== controllerId) {
      continue;
    }
    const def = registry.get(id) as
      | { cardType?: string; tags?: readonly string[] }
      | undefined;
    const cardType = def?.cardType;
    if (t.type === "unit" && cardType !== "unit") {
      continue;
    }
    if (
      (t.type === "gear" || t.type === "equipment") &&
      cardType !== "gear" &&
      cardType !== "equipment"
    ) {
      continue;
    }
    let ok = true;
    for (const f of filters) {
      if (f && typeof f === "object" && typeof (f as { tag?: unknown }).tag === "string") {
        const tag = (f as { tag: string }).tag.toLowerCase();
        if (!(def?.tags ?? []).some((x) => x.toLowerCase() === tag)) {
          ok = false;
          break;
        }
      }
      // rule-id: ogn-101-298 — rule 811: only a card that is actually facedown
      // satisfies a "facedown card" clause.
      if (f === "facedown") {
        const meta = ctx.cards.getCardMeta(id as CoreCardId) as
          | { hidden?: boolean }
          | undefined;
        if (meta?.hidden !== true) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) {
      continue;
    }
    count++;
    if (exact === undefined && count >= min) {
      return true;
    }
  }
  return exact !== undefined ? count === exact : count >= min;
}

/**
 * Build the list of cards on the board with their abilities.
 * Scans base, battlefield, and legendZone zones, looks up abilities from the card definition registry.
 */
export function getBoardCards(ctx: TriggerRunnerContext): CardWithAbilities[] {
  const boardCards: CardWithAbilities[] = [];
  // rule-id: sfd-109-221 (Akshan / Dazzling Aurora) — "your" on a permanent's
  // trigger refers to its current CONTROLLER, not its owner, so a
  // control-changed permanent triggers for whoever controls it now.
  const controllerOf = (cardId: CoreCardId, fallback: string): string =>
    ctx.cards.getCardController?.(cardId) ?? ctx.cards.getCardOwner(cardId) ?? fallback;
  // rule-id: ogn-100-298 — include triggers implied by granted effect keywords.
  const abilitiesOf = (cardId: CoreCardId): TriggerableAbility[] => {
    const printed = toTriggerableAbilities(cardId as string);
    const meta = ctx.cards.getCardMeta(cardId);
    const granted = [...grantedKeywordAbilities(meta), ...delayedTriggerAbilities(meta)];
    return granted.length > 0 ? [...printed, ...granted] : printed;
  };

  // Get cards from all players' bases and legend zones
  for (const playerId of Object.keys(ctx.draft.players)) {
    const baseCards = ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId);
    for (const cardId of baseCards) {
      boardCards.push({
        abilities: abilitiesOf(cardId),
        id: cardId as string,
        owner: controllerOf(cardId, playerId),
        zone: "base",
      });
    }

    const legendCards = ctx.zones.getCardsInZone(
      "legendZone" as CoreZoneId,
      playerId as CorePlayerId,
    );
    for (const cardId of legendCards) {
      boardCards.push({
        abilities: toTriggerableAbilities(cardId as string),
        id: cardId as string,
        owner: playerId,
        zone: "legendZone",
      });
    }
  }

  // Get cards from battlefields
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const bfCards = ctx.zones.getCardsInZone(bfZoneId);
    for (const cardId of bfCards) {
      const owner = controllerOf(cardId, "");
      boardCards.push({
        abilities: abilitiesOf(cardId),
        id: cardId as string,
        owner,
        zone: bfZoneId as string,
      });
    }
  }

  // Get cards from battlefieldRow (battlefield cards themselves)
  const battlefieldRowCards = ctx.zones.getCardsInZone("battlefieldRow" as CoreZoneId);
  for (const cardId of battlefieldRowCards) {
    // rule 471.2.a: a battlefield card belongs to no deck — "When you conquer
    // here" is controlled by whoever controls the battlefield right now (the
    // conqueror, already stamped before the `conquer` event fires), so that
    // player is the trigger's controller and the one its effect acts for.
    const owner =
      ctx.draft.battlefields[cardId as string]?.controller ??
      ctx.cards.getCardOwner(cardId) ??
      "";
    boardCards.push({
      abilities: toTriggerableAbilities(cardId as string),
      id: cardId as string,
      owner,
      zone: "battlefieldRow",
    });
  }

  // Rule 585.1 / 585.2 (ambiguity): champions in championZone have NOT been
  // Played yet. Per the rules primer consensus, their triggers do NOT fire
  // While they sit in championZone — a champion's abilities only come online
  // Once the card has been played (moved out of championZone into play).
  // Legends in legendZone, by contrast, DO have their triggers active.
  // So we intentionally skip scanning championZone here.

  return boardCards;
}

/**
 * Fire triggers for a game event.
 *
 * Scans all cards on the board for matching triggered abilities
 * and executes their effects.
 *
 * @param event - The game event that occurred
 * @param ctx - The trigger runner context from the move reducer
 * @returns Number of triggers that fired
 */
/**
 * Order simultaneous triggers per rule 585.
 *
 * Rule 585.1: Multiple triggers controlled by the **same** player fire in
 * the order that player chooses. The engine defaults to the insertion order
 * that `findMatchingTriggers` produced, which is deterministic (scan order
 * of `getBoardCards`) — so auto/goldfish play does not stall on an ordering
 * prompt.
 *
 * Rule 585.2: When triggers belong to **different** controllers, the turn
 * player's triggers fire first, then each subsequent player in turn order.
 *
 * @param matches - Triggers in original scan order
 * @param turnPlayer - The active player (turn player)
 * @param turnOrder - Full turn order (players in seat order)
 * @returns Triggers in rule-585-compliant order
 */
export function orderTriggers(
  matches: MatchedTrigger[],
  turnPlayer: string,
  turnOrder: string[],
): MatchedTrigger[] {
  if (matches.length <= 1) {
    return matches;
  }

  // Build a ranking: turn player first (rank 0), next player clockwise (rank 1), ...
  const rank: Record<string, number> = {};
  if (turnOrder.length > 0) {
    const startIdx = Math.max(0, turnOrder.indexOf(turnPlayer));
    for (let i = 0; i < turnOrder.length; i++) {
      const pid = turnOrder[(startIdx + i) % turnOrder.length];
      if (pid !== undefined && rank[pid] === undefined) {
        rank[pid] = i;
      }
    }
  } else {
    rank[turnPlayer] = 0;
  }

  // Rule 585.2: stable sort by owner rank (turn player first).
  // Rule 585.1: within a single owner, preserve insertion order (stable sort).
  return matches
    .map((m, i) => ({ idx: i, match: m }))
    .toSorted((a, b) => {
      const ra = rank[a.match.cardOwner] ?? Number.MAX_SAFE_INTEGER;
      const rb = rank[b.match.cardOwner] ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) {
        return ra - rb;
      }
      return a.idx - b.idx;
    })
    .map((entry) => entry.match);
}

/**
 * Which printed keyword a matched trigger stands for, if any. Keyword-derived
 * triggers ([Deathknell] — …) are synthesised alongside the bare
 * `{type:"keyword", keyword, effect}` ability they came from, so the effect
 * identifies the pair.
 */
function keywordOfMatchedTrigger(
  cardId: string,
  ability: TriggerableAbility,
): string | undefined {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  const effectJson = JSON.stringify(ability.effect);
  for (const a of abilities as readonly { type?: string; keyword?: string; effect?: unknown }[]) {
    if (a.type !== "keyword" || !a.keyword || a.effect === undefined) {
      continue;
    }
    if (JSON.stringify(a.effect) === effectJson) {
      return a.keyword;
    }
  }
  return undefined;
}

/**
 * rule 383.3.d — "Your [X] effects trigger an additional time" is a
 * controller-scoped static: count the doublers the trigger's controller has on
 * the board (a card in the trash is not on the board and does not count).
 */
function extraTriggerCount(
  keyword: string,
  ownerId: string,
  boardCards: readonly CardWithAbilities[],
): number {
  const registry = getGlobalCardRegistry();
  let extra = 0;
  for (const card of boardCards) {
    if (card.owner !== ownerId || card.zone === "trash") {
      continue;
    }
    for (const a of (registry.getAbilities(card.id) ?? []) as readonly {
      type?: string;
      effect?: { type?: string; keyword?: string };
    }[]) {
      if (a.type === "static" && a.effect?.type === "trigger-double" && a.effect.keyword === keyword) {
        extra += 1;
      }
    }
  }
  return extra;
}

/**
 * rule 383.3.d / rule-id: unl-029-219 (Red Brambleback) — "Your conquer
 * effects for conquering here trigger an additional time" is an EVENT-scoped
 * doubler: it applies to every conquer effect of its controller (rule
 * 383.4.c.2.a units present at the conquer AND 383.4.c.2.b the battlefield's
 * own "when you conquer here"), but only when the event happened at the
 * doubler's own battlefield.
 */
function extraEventTriggerCount(
  match: MatchedTrigger,
  boardCards: readonly CardWithAbilities[],
): number {
  const evt = match.event as { type?: string; battlefieldId?: string };
  const registry = getGlobalCardRegistry();
  let extra = 0;
  for (const card of boardCards) {
    if (card.owner !== match.cardOwner || card.zone === "trash") {
      continue;
    }
    for (const a of (registry.getAbilities(card.id) ?? []) as readonly {
      type?: string;
      effect?: { type?: string; event?: string; location?: string };
    }[]) {
      const e = a.effect;
      if (a.type !== "static" || e?.type !== "trigger-double" || e.event === undefined) {
        continue;
      }
      if (e.event !== evt.type) {
        continue;
      }
      // "…for conquering HERE": the doubler must sit at the battlefield the
      // event names; from base or another battlefield nothing doubles.
      if (
        e.location === "here" &&
        (evt.battlefieldId === undefined || card.zone !== `battlefield-${evt.battlefieldId}`)
      ) {
        continue;
      }
      extra += 1;
    }
  }
  return extra;
}

/**
 * rule 808.2 — each instance of a keyword triggers separately, so a doubled
 * Deathknell becomes two independent items rather than one doubled effect.
 */
function expandKeywordDoubling(
  matches: readonly MatchedTrigger[],
  boardCards: readonly CardWithAbilities[],
): MatchedTrigger[] {
  const out: MatchedTrigger[] = [];
  for (const match of matches) {
    out.push(match);
    const eventExtra = extraEventTriggerCount(match, boardCards);
    for (let i = 0; i < eventExtra; i += 1) {
      out.push(match);
    }
    const keyword = keywordOfMatchedTrigger(match.cardId, match.ability);
    if (!keyword) {
      continue;
    }
    const extra = extraTriggerCount(keyword, match.cardOwner, boardCards);
    for (let i = 0; i < extra; i += 1) {
      out.push(match);
    }
  }
  return out;
}

/**
 * rule 383.3.a.2 / 402.1.a — ask the controller of the oldest still-optional
 * "you may" trigger on the Chain whether to perform it, while it is being
 * FINALIZED. Accepting clears the item's `optional` flag (it then resolves
 * without asking again); declining removes it, so no Priority round ever
 * happens over a trigger that will do nothing. Re-entrant: `pending-choice.ts`
 * calls it again after each answer until no optional item is left.
 *
 * Items carrying an `optInCost` ("you may pay [N] to …") are left alone — their
 * cost is charged at resolution by `executeResolvedItem`.
 */
export function promptFinalizationOptIn(draft: unknown): void {
  const state = draft as RiftboundGameState;
  if (state.pendingChoice) {
    return;
  }
  const item = state.interaction?.chain?.items.find(
    (it) =>
      (it as { optional?: boolean }).optional === true &&
      (it as { triggered?: boolean }).triggered === true &&
      (it as { optInCost?: unknown }).optInCost === undefined,
  );
  if (!item) {
    return;
  }
  (state as { pendingChoice?: unknown }).pendingChoice = {
    finalizationChainItemId: item.id,
    playerId: item.controller,
    resolved: { ...item, optional: false },
    sourceCardId: item.cardId,
    type: "opt-in",
  };
}

export function fireTriggers(rawEvent: GameEvent, ctx: TriggerRunnerContext): number {
  // rule 359.2 / rule-id: sfd-195-221 — a `choose` event names the chooser but
  // not the chosen card's side; stamp the subject's CURRENT controller here so
  // "when you choose a friendly unit" descriptors have an owner to judge.
  const event: GameEvent =
    rawEvent.type === "choose" && rawEvent.owner === undefined
      ? {
          ...rawEvent,
          owner:
            ctx.cards.getCardController?.(rawEvent.cardId as CoreCardId) ??
            (ctx.cards.getCardOwner(rawEvent.cardId as CoreCardId) as string | undefined),
        }
      : rawEvent;
  // rule-id: ogn-118-298 — tally every event (per type / player / card) before
  // matching so "the first time … each turn" restrictions can read the count.
  {
    const draft = ctx.draft as {
      turnEventCounts?: Record<string, number>;
      gameEventCounts?: Record<string, number>;
    };
    draft.turnEventCounts ??= {};
    // rule 315.2.a — the same keys tallied for the whole game, so
    // `once-per-game` restrictions ("each player's first Beginning Phase")
    // survive the per-turn reset.
    draft.gameEventCounts ??= {};
    for (const key of turnEventCountKeys(event)) {
      draft.turnEventCounts[key] = (draft.turnEventCounts[key] ?? 0) + 1;
      draft.gameEventCounts[key] = (draft.gameEventCounts[key] ?? 0) + 1;
    }
  }
  // rule-id: ogn-019-298 — "If you've discarded a card this turn" statics read a
  // per-player log of this turn's events; every discard flows through here.
  if (event.type === "discard" && event.playerId) {
    const draft = ctx.draft as { turnEvents?: Record<string, string[]> };
    draft.turnEvents ??= {};
    (draft.turnEvents[event.playerId] ??= []).push("discarded");
  }
  // rule-id: ogn-144-298 — "If an enemy unit has died this turn": log the
  // death against every OTHER player as `enemy-died` (and the owner as
  // `friendly-died`) so play-time cost conditions can read it.
  if (event.type === "die" && event.owner) {
    const draft = ctx.draft as { turnEvents?: Record<string, string[]>; players?: Record<string, unknown> };
    draft.turnEvents ??= {};
    for (const pid of Object.keys(draft.players ?? {})) {
      (draft.turnEvents[pid] ??= []).push(pid === event.owner ? "friendly-died" : "enemy-died");
    }
    // rule-id: unl-037-219 — "if a friendly unit died during YOUR Beginning
    // Phase this turn": only deaths in the owner's own Beginning Phase count,
    // so stamp a narrower key alongside the generic one.
    const turn = (ctx.draft as { turn?: { phase?: string; activePlayer?: string } }).turn;
    if (turn?.phase === "beginning" && turn.activePlayer === event.owner) {
      (draft.turnEvents[event.owner] ??= []).push("friendly-died-in-beginning");
    }
  }
  // rule-id: ogn-100-298 — static keyword grants are otherwise only refreshed
  // in post-move cleanup, so a unit entering play under "Other friendly units
  // have [Vision]" would not yet carry the grant when its play-self fires.
  // A unit token entering the board is played the same way (rule 817.1.b), so
  // it needs the same refresh before its own triggers are matched.
  if (
    (event.type === "play-self" || event.type === "play-token-unit") &&
    ctx.cards.updateCardMeta
  ) {
    recalculateStaticEffects({
      cards: {
        getCardMeta: ctx.cards.getCardMeta,
        getCardOwner: ctx.cards.getCardOwner,
        updateCardMeta: ctx.cards.updateCardMeta,
      },
      draft: ctx.draft,
      zones: ctx.zones,
    });
  }
  const boardCards = getBoardCards(ctx);
  // Rule ogn-006-298 (Flame Chompers): a card that reads "When you discard
  // me…" is in the trash by the time the discard event is processed. Include
  // the discarded card itself in the scan so its self-trigger can match.
  if (event.type === "discard" && !boardCards.some((c) => c.id === event.cardId)) {
    boardCards.push({
      abilities: toTriggerableAbilities(event.cardId),
      id: event.cardId,
      owner: event.playerId,
      zone: ctx.zones.getCardZone?.(event.cardId as CoreCardId) ?? "trash",
    });
  }
  // rule-id: sfd-167-221 (Unsung Hero) — Deathknell: kill moves the unit to
  // trash before `die` fires, so include the dying card so "When I die" matches.
  // rule 428.1.a.1.b: its abilities are controlled by whoever controlled it as
  // it died (last-known information from the leave-board choke point).
  if (event.type === "die" && !boardCards.some((c) => c.id === event.cardId)) {
    const lki = getLKI(ctx.draft, event.cardId);
    boardCards.push({
      // rule 390.2 — a delayed "when it dies this turn" ability installed on
      // the unit is wiped from its meta as it leaves the board, so read it
      // back from the last-known information snapshot.
      abilities: [
        ...toTriggerableAbilities(event.cardId),
        ...delayedTriggerAbilitiesFrom(lki?.delayedTriggers),
      ],
      id: event.cardId,
      owner: (event as { controller?: string }).controller ?? lki?.controller ?? event.owner,
      zone: ctx.zones.getCardZone?.(event.cardId as CoreCardId) ?? "trash",
    });
  }
  // rule-id: ogn-037-298 (rule 385.2 / 383.2.c.1) — "…play me from your trash"
  // triggers are active in the trash: scan each player's trash for cards
  // carrying such an ability (the matcher ignores their other abilities).
  for (const playerId of Object.keys(ctx.draft.players ?? {})) {
    const trashCards = ctx.zones.getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId);
    for (const cardId of trashCards) {
      if (boardCards.some((c) => c.id === (cardId as string))) {
        continue;
      }
      const abilities = toTriggerableAbilities(cardId as string);
      if (abilities.some(abilityFunctionsFromTrash)) {
        boardCards.push({ abilities, id: cardId as string, owner: playerId, zone: "trash" });
      }
    }
  }
  // rule 323.5 / 808.1.d.2 — units that die together leave the board only
  // AFTER their death triggers are queued, so a card dying in the same batch
  // is still present for statics that shape those triggers ("your [Deathknell]
  // effects trigger an additional time"). Read from the leave-board batch's
  // last-known information; listed with no abilities and a `dying` zone so it
  // can never match a trigger itself.
  if (event.type === "die") {
    for (const dead of getLeavingBatch(ctx.draft)) {
      if (!dead.triggerDoubler || boardCards.some((c) => c.id === dead.cardId)) {
        continue;
      }
      boardCards.push({ abilities: [], id: dead.cardId, owner: dead.controller, zone: "dying" });
    }
  }
  // rule 390.2 (rule-id: sfd-166-221) — player-scoped delayed triggers ("When
  // a friendly unit is played this turn, buff it") float: their source spell is
  // in the trash, so offer them as a separate entry owned by the installer.
  for (const pdt of (
    ctx.draft as unknown as {
      playerDelayedTriggers?: {
        playerId: string;
        sourceCardId: string;
        trigger: { event: string; on?: string };
        effect: unknown;
      }[];
    }
  ).playerDelayedTriggers ?? []) {
    boardCards.push({
      abilities: [
        {
          effect: pdt.effect as never,
          trigger: { event: pdt.trigger.event, on: pdt.trigger.on ?? "controller" },
          type: "triggered",
        },
      ],
      id: pdt.sourceCardId,
      owner: pdt.playerId,
      zone: "floating",
    });
  }
  const allMatches = findMatchingTriggers(event, boardCards, ctx.draft);

  // Rule 724 (Legion) and other conditional triggers: filter matches by
  // Their ability.condition before executing. Conditions are evaluated
  // Against the controller of the card (owner, since abilities cannot
  // Change controller separately today).
  const filtered = allMatches.filter((match) =>
    evaluateTriggerCondition(
      match.ability.condition,
      ctx.draft,
      match.cardOwner,
      match.event,
      ctx,
      match.cardId,
    ),
  );

  // rule 808.2 / rule-id: ogn-236-298 (Karthus, Eternal) — "Your [Deathknell]
  // effects trigger an additional time": each instance triggers separately, so
  // the extra copies are independent chain items placed next to the original.
  const expanded = expandKeywordDoubling(filtered, boardCards);

  // Rule 585: Order simultaneous triggers by (1) turn player first
  // (2) within the same owner, preserve scan order (controller-chosen
  // Order defaults to insertion order for goldfish compatibility).
  const turnPlayer = ctx.draft.turn?.activePlayer ?? "";
  const turnOrder = Object.keys(ctx.draft.players ?? {});
  const matches = orderTriggers(expanded, turnPlayer, turnOrder);

  // Rule 583.3: a Triggered Ability behaves like an Activated Ability and is
  // placed on the Chain — always, whether or not a chain already exists.
  // Rule 541.1: pushed in the computed order so the last-pushed is top-of-stack.
  // The effect executes only when the chain resolves via passChainPriority.
  //
  // The `ctx.resolveInline` escape hatch preserves the old behavior for
  // callers that cannot open a chain (e.g. flow-phase hooks that run outside
  // the priority loop). Default is false — triggers go on the chain.
  const resolveInline = ctx.resolveInline === true;

  if (matches.length === 0) {
    return 0;
  }

  // Rule 429.2 / 337.2 (unl-022-219): triggered abilities whose effect only
  // Adds resources resolve immediately and can't be reacted to — never put
  // them on the chain, mirroring the activated-ability carve-out.
  const isImmediateAdd = (match: (typeof matches)[number]): boolean => {
    const t = (match.ability.effect as { type?: string } | undefined)?.type;
    return (t === "add-resource" || t === "add") && match.ability.optional !== true;
  };
  const inlineMatches = resolveInline ? matches : matches.filter(isImmediateAdd);

  if (!resolveInline && inlineMatches.length < matches.length) {
    if (!ctx.draft.interaction) {
      (ctx.draft as RiftboundGameState & {
        interaction: NonNullable<RiftboundGameState["interaction"]>;
      }).interaction = createInteractionState();
    }
    for (const match of matches) {
      if (isImmediateAdd(match)) {
        continue;
      }
      const effect = match.ability.effect as unknown;
      // rule 402.4 — a multi-slot trigger whose choices cannot ALL be made
      // legally is removed instead of going on the Chain (no partial half).
      if (
        !triggerTargetsSatisfiable(effect, ctx.draft, { cards: ctx.cards, zones: ctx.zones }, match.cardId, triggerControllerFor(match))
      ) {
        continue;
      }
      const optInCost = extractPayCost(match.ability.condition);
      (ctx.draft as RiftboundGameState & {
        interaction: NonNullable<RiftboundGameState["interaction"]>;
      }).interaction = addToChain(
        ctx.draft.interaction!,
        {
          cardId: match.cardId,
          controller: triggerControllerFor(match),
          effect,
          // rule-id: sfd-119-221 — "you may pay [N] to …": carry the cost so
          // the opt-in prompt charges it instead of resolving for free.
          ...(optInCost ? { optInCost } : {}),
          // Rule 583 (unl-021-219): carry the "you may" flag onto the chain so
          // executeResolvedItem can prompt the controller to opt in or decline.
          optional: match.ability.optional === true || optInCost !== undefined,
          // rule-id: ven-021-166 — carry the firing event so "moved to or from"
          // target qualifiers can resolve against its from/to zones.
          triggerEvent: match.event,
          triggered: true,
          type: "ability",
        },
        turnOrder,
      );
    }
    // rule 355.5 / 808.1.d.2: each freshly finalized item chooses its own
    // Game Object now, before anyone receives priority.
    lockTriggerTargets(ctx.draft, { cards: ctx.cards, zones: ctx.zones });
  }

  for (const match of inlineMatches) {
    // Build a no-op for missing optional methods
    const noop = () => {};
    const effectCtx: EffectContext = {
      cards: {
        getCardMeta: ctx.cards.getCardMeta as EffectContext["cards"]["getCardMeta"],
        getCardOwner: ctx.cards.getCardOwner,
        getCardController: (ctx.cards as { getCardController?: unknown })
          .getCardController as EffectContext["cards"]["getCardController"],
        setCardController: (ctx.cards as { setCardController?: unknown })
          .setCardController as EffectContext["cards"]["setCardController"],
        updateCardMeta: (ctx.cards as { updateCardMeta?: unknown })
          .updateCardMeta as EffectContext["cards"]["updateCardMeta"],
      },
      counters: {
        addCounter: ctx.counters.addCounter,
        clearCounter: ctx.counters.clearCounter ?? noop,
        removeCounter: ctx.counters.removeCounter ?? noop,
        setFlag: ctx.counters.setFlag,
      },
      createCardInZone: ctx.createCardInZone,
      draft: ctx.draft,
      fireTriggers: (innerEvent) => fireTriggers(innerEvent, ctx),
      playerId: match.cardOwner,
      sourceCardId: match.cardId,
      zones: {
        drawCards: ctx.zones.drawCards,
        getCardZone: ctx.zones.getCardZone ?? (() => undefined),
        getCardsInZone: ctx.zones.getCardsInZone,
        moveCard: ctx.zones.moveCard,
      },
    };

    const effect = match.ability.effect as ExecutableEffect;
    if (effect) {
      executeEffect(effect, effectCtx);
    }
  }

  return matches.length;
}
