/**
 * activateAbility move + activated-ability collection/cost helpers (split from chain-moves.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import {
  addToChain,
  createInteractionState,
  getTurnState,
  hasChainPriorityPermission,
  hasShowdownPermission,
  isLegalTiming,
} from "../../../chain";
import type { ExecutableEffect } from "../../../abilities/effect-executor";
import { executeEffect } from "../../../abilities/effect-executor";
import type { TargetDescriptor } from "../../../abilities/target-resolver";
import { resolveTarget } from "../../../abilities/target-resolver";
import { collectMultiPickSlots } from "../../../abilities/target-slots";
import { recalculateStaticEffects } from "../../../abilities/static-abilities";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { evaluateLegionCondition } from "../../../abilities/legion-conditions";
import { evaluateWhileLevel } from "../../../abilities/xp-conditions";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { removeFromBoard } from "../../../operations/leave-board";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import {
  consumeRestrictedEnergyForPurpose,
  getDeflectSurcharge,
  lockedEnergyForPurpose,
  spendablePowerPool,
} from "../play/cost";
import type { PlayCostSelection } from "@tcg/riftbound-types";
import type { SpellEffectTargetShape } from "../play/targeting";
import {
  findConditionalBranchTarget,
  findSequenceLeadTarget,
  offBoardPlayIsCasterChosen,
  offBoardPlayZone,
  spellEffectHasLegalTargets,
} from "../play/targeting";
import { buildEffectContext, canAffordPower } from "./effect-context";
import { raisePlayTimeModeChoice } from "../play/play-time-modes";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * rule 343.1.b / 308.1.a: card abilities by DEFAULT cannot be activated during
 * a Showdown State — only those printed [Action]/[Reaction] can (313.1.a). This
 * holds for every host type: units (145.2), gear (151.2) and legends
 * (174.8/381) alike, so an untagged ability is "standard" timing, which
 * `isLegalTiming` permits in neutral-open only.
 */
function abilityTimingClass(
  ability: { keyword?: string; timing?: string },
  _hostCardId: string,
): "standard" | "action" | "reaction" {
  if (ability.keyword === "Reaction" || ability.timing === "reaction") {
    return "reaction";
  }
  if (ability.keyword === "Action" || ability.timing === "action") {
    return "action";
  }
  return "standard";
}

/**
 * rule 403 / 379.5 — normalize an activated ability's `recycle` cost. The parser
 * emits a bare count for "Recycle N from your trash" and an object
 * `{amount, from, cardType?}` for "Recycle a <noun> from your trash"
 * (sfd-019-221 Assembly Rig). Hand/board recycle costs are paid elsewhere.
 */
/**
 * rule 377.2.b — "Use only once per turn" is a condition on ACTIVATING: the
 * per-turn tally lives in `turnEventCounts` (reset every turn by the flow) and
 * is keyed by the HOST card, so a copy of the ability on another card keeps its
 * own allowance.
 */
/**
 * rule-id: sfd-075-221 — the acting source type for `use-activated-ability`.
 * rule 151: Equipment is a kind of gear (and [Equip] is an activated ability),
 * so both report "gear" to "an activated ability of a gear" triggers.
 */
function activationSourceType(hostCardId: string): string | undefined {
  const cardType = getGlobalCardRegistry().getCardType(hostCardId);
  if (cardType === "equipment") {
    return "gear";
  }
  return cardType ?? undefined;
}

/**
 * rule 357.1.a — during Pay Costs the activating player may exhaust ready runes
 * for energy, and `deductAbilityCost` auto-exhausts them to cover a shortfall,
 * so activation affordability must credit those ready runes (ven-050-166: six
 * ready runes make the [Empower] [12 − runes] cost of 6 exactly payable with an
 * empty pool). Play moves deliberately do NOT credit them — see
 * `getPotentialRuneEnergy` — because their reducers do not auto-exhaust.
 */
function readyRuneEnergy(
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  counters: { getFlag: (cardId: CoreCardId, flag: string) => boolean | undefined },
  playerId: string,
): number {
  return zones
    .getCardsInZone("runePool" as CoreZoneId, playerId as CorePlayerId)
    .filter((runeId) => counters.getFlag(runeId, "exhausted") !== true).length;
}

export function abilityUseKey(hostCardId: string, abilityIndex: number): string {
  return `activate|${hostCardId}|${abilityIndex}`;
}

function oncePerTurnExhausted(
  state: { turnEventCounts?: Record<string, number> },
  restrictions: readonly { type: string }[] | undefined,
  hostCardId: string,
  abilityIndex: number,
): boolean {
  if (!restrictions?.some((r) => r.type === "once-per-turn")) {
    return false;
  }
  return (state.turnEventCounts?.[abilityUseKey(hostCardId, abilityIndex)] ?? 0) >= 1;
}

/**
 * rule 377.2.b (ven-125-166) — "Use only if you've chosen an enemy unit this
 * turn": a turn-scoped history flag logged by `fireTriggers` on every `choose`
 * of an enemy unit; it is cleared with `turnEvents` at the turn boundary.
 */
function chosenEnemyRestrictionUnmet(
  state: { turnEvents?: Record<string, readonly string[]> },
  restrictions: readonly { type: string }[] | undefined,
  playerId: string,
): boolean {
  if (!restrictions?.some((r) => r.type === "chosen-enemy-unit-this-turn")) {
    return false;
  }
  return !(state.turnEvents?.[playerId] ?? []).includes("chose-enemy-unit");
}

/**
 * rule 377.2.b (sfd-197-221 Emperor of the Sands) — "Use only if you've played
 * an Equipment this turn": read this turn's play log for the activating player
 * and look for a piece of Equipment. rule 208.3 / 476.1: a gear printing the
 * [Equip] ability IS Equipment even when its set data types it plainly as gear.
 */
function playedEquipmentRestrictionUnmet(
  state: { cardsPlayedIdsThisTurn?: Record<string, readonly string[]> },
  restrictions: readonly { type: string }[] | undefined,
  playerId: string,
): boolean {
  if (!restrictions?.some((r) => r.type === "played-equipment-this-turn")) {
    return false;
  }
  const registry = getGlobalCardRegistry();
  const played = state.cardsPlayedIdsThisTurn?.[playerId] ?? [];
  return !played.some((id) => {
    const def = registry.get(id);
    return (
      def?.cardType === "equipment" ||
      (def?.cardType === "gear" && registry.hasKeyword(id, "Equip"))
    );
  });
}

/**
 * rule 136.2.c/d (sfd-059-221 Svellsongur) — text copied onto an Equipment from
 * the unit it is attached to IS the WEARER's text: an `[Exhaust]` in that copy
 * is paid by exhausting the wearer, never the gear. Every other shape (own,
 * inherited, granted) is paid by the host card itself.
 */
export function exhaustPayerCardId(
  hostCardId: string,
  sourceCardId: string | undefined,
  getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): string {
  if (!sourceCardId || sourceCardId === hostCardId) {
    return hostCardId;
  }
  const meta = getCardMeta(hostCardId as CoreCardId) as
    | { copiedFromCardId?: string }
    | undefined;
  return meta?.copiedFromCardId === sourceCardId ? sourceCardId : hostCardId;
}

/**
 * rule 377.2.b (sfd-199-221 Prodigal Explorer) — "Use only if you've chosen
 * enemy units and/or gear twice this turn with spells or unit abilities": a
 * COUNTED history restriction. `fireTriggers` logs one `chose-enemy-object`
 * per qualifying choice (enemy unit or gear, chosen by a spell or a UNIT
 * ability); `turnEvents` is cleared at the turn boundary, so last turn's
 * choices never carry over.
 */
function chosenEnemyObjectsRestrictionUnmet(
  state: { turnEvents?: Record<string, readonly string[]> },
  restrictions: readonly { type: string }[] | undefined,
  playerId: string,
): boolean {
  const rule = restrictions?.find((r) => r.type === "chosen-enemy-objects-this-turn") as
    | { count?: number }
    | undefined;
  if (!rule) {
    return false;
  }
  const needed = rule.count ?? 1;
  const log = state.turnEvents?.[playerId] ?? [];
  return log.filter((e) => e === "chose-enemy-object").length < needed;
}

function normalizeRecycleCost(raw: unknown): { amount: number; cardType?: string } | undefined {
  if (typeof raw === "number") {
    return raw > 0 ? { amount: raw } : undefined;
  }
  if (raw && typeof raw === "object") {
    const spec = raw as { amount?: number; cardType?: string; from?: string };
    if (spec.from !== undefined && spec.from !== "trash") {
      return undefined;
    }
    const amount = spec.amount ?? 1;
    return amount > 0 ? { amount, cardType: spec.cardType } : undefined;
  }
  return undefined;
}

/**
 * rule 357.2 / 422.3 — a "Discard N" activation cost is either a bare number
 * or a descriptor ("Discard a gear" -> `{amount, cardType}`, ven-060-166).
 * Normalizing both shapes keeps condition / enumerator / reducer honest; an
 * object cost used to fail the `> 0` numeric test and silently eat the other
 * costs without ever creating the chain item.
 */
function normalizeDiscardCost(raw: unknown): { amount: number; cardType?: string } | undefined {
  if (typeof raw === "number") {
    return raw > 0 ? { amount: raw } : undefined;
  }
  if (raw && typeof raw === "object") {
    const spec = raw as { amount?: number; cardType?: string };
    const amount = spec.amount ?? 1;
    return amount > 0 ? { amount, cardType: spec.cardType } : undefined;
  }
  return undefined;
}

/** rule 357.2 — the hand cards that can actually pay a discard cost. */
function eligibleDiscardCards(hand: readonly unknown[], spec: { cardType?: string }): string[] {
  const ids = hand as readonly string[];
  if (!spec.cardType) {
    return [...ids];
  }
  const registry = getGlobalCardRegistry();
  return ids.filter((id) => registry.getCardType(id) === spec.cardType);
}

/**
 * rule 429.2 / 605.2 — an activated ability that only [Add]s resources resolves
 * as soon as it is finalized and never becomes a respondable chain item. A
 * conditional wrapper ("[Add] 1. If this is [Empowered], [Add] 2 instead.",
 * ven-075-166) is still only an Add, so unwrap it: every branch present must
 * itself be an immediate Add.
 */
/**
 * rule 429.3 / 429.3.a — is the open pending choice a PAYMENT `playerId` is
 * being asked to make? Both the [X] payment prompt and a resolving spell's
 * "unless its controller pays [N]" ransom (sfd-136-221 Hard Bargain) are such
 * a payment, so the payer may crack Reaction [Add] abilities during either.
 */
export function isPaymentPromptFor(pendingChoice: unknown, playerId: string): boolean {
  const pc = pendingChoice as
    | { type?: string; playerId?: string; counterRansom?: unknown }
    | undefined;
  if (!pc || pc.playerId !== playerId) {
    return false;
  }
  return pc.type === "pay-x" || (pc.type === "opt-in" && pc.counterRansom !== undefined);
}

export function isImmediateAddEffect(effect: unknown): boolean {
  const type = (effect as { type?: string } | undefined)?.type;
  if (type === "add-resource" || type === "add") {
    return true;
  }
  if (type === "conditional") {
    const branch = effect as { then?: unknown; else?: unknown };
    if (!branch.then || !isImmediateAddEffect(branch.then)) {
      return false;
    }
    return branch.else === undefined || isImmediateAddEffect(branch.else);
  }
  return false;
}

/**
 * rule 379.5 — the cards in `trash` that can actually pay a recycle cost.
 * "Recycle a unit from your trash" is only payable with units.
 */
function eligibleRecycleCards(
  trash: readonly unknown[],
  spec: { cardType?: string },
): string[] {
  const ids = trash as readonly string[];
  if (!spec.cardType) {
    return [...ids];
  }
  const registry = getGlobalCardRegistry();
  return ids.filter((id) => registry.getCardType(id) === spec.cardType);
}

/** Cap the recycle fan-out so a deep trash can't explode the move list. */
const MAX_RECYCLE_VARIANTS = 60;

/** Cap the "pay any amount of X" fan-out so a huge pool can't explode the move list. */
const MAX_X_VARIANTS = 20;

/**
 * rule 416.5 — every N-card selection the controller may make to pay a
 * "Recycle N from your trash" cost, oldest-first so the first variant matches
 * the reducer's default. Truncated at `MAX_RECYCLE_VARIANTS`.
 */
function recycleSubsets(eligible: readonly string[], amount: number): string[][] {
  const out: string[][] = [];
  const walk = (start: number, chosen: string[]): void => {
    if (out.length >= MAX_RECYCLE_VARIANTS) {
      return;
    }
    if (chosen.length === amount) {
      out.push(chosen);
      return;
    }
    for (let i = start; i <= eligible.length - (amount - chosen.length); i++) {
      walk(i + 1, [...chosen, eligible[i] as string]);
      if (out.length >= MAX_RECYCLE_VARIANTS) {
        return;
      }
    }
  };
  walk(0, []);
  return out;
}

/**
 * rule-id: sfd-052-221 (rule 355.10.f / 355.14.b) — an activated ability's
 * single caster-chosen card target ("Give a unit +3 Might") is chosen when
 * the ability is finalized on the chain, not when it resolves. Returns that
 * descriptor, or undefined when the effect has no such play-time choice
 * (self / player / battlefield / "all" / multi-pick targets stay as-is).
 */
/**
 * rule 809.1.c (rule-id: sfd-120-221) — [Deflect X] taxes an opponent's
 * targeted ACTIVATED ability exactly as it taxes a spell: choosing a Deflect
 * object costs X more Power of any Domain on top of the ability's own cost.
 * The host already sits on the board, so the whole pool (less the ability's own
 * Power pips) is the budget. Returns 0 for a chooser who controls the target.
 *
 * rule 766 / 767 (rule-id: ven-158-166) — the waiver a battlefield grants
 * ("Players ignore [Deflect] … choosing something here") is keyed off the
 * target's ZONE, so `zones` must reach `getDeflectSurcharge`; without it the
 * ability path taxes a unit the spell path lets through for free.
 */
function deflectSurchargeForActivation(
  state: RiftboundGameState,
  playerId: string,
  targets: readonly string[] | undefined,
  cards: unknown,
  zones?: unknown,
): number {
  if (!targets || targets.length === 0) {
    return 0;
  }
  return getDeflectSurcharge(
    state as never,
    playerId,
    targets as string[],
    cards as never,
    undefined,
    zones as never,
  );
}

/** Power left over for a Deflect surcharge after the ability's own Power pips. */
function deflectBudget(
  state: RiftboundGameState,
  playerId: string,
  cost: Record<string, unknown> | undefined,
): number {
  const pool = state.runePools[playerId];
  const total = Object.values(pool?.power ?? {}).reduce(
    (a: number, b) => a + ((b as number | undefined) ?? 0),
    0,
  );
  return total - ((cost?.power as string[] | undefined)?.length ?? 0);
}

/**
 * rule-id: unl-045-219 (Forgotten Signpost) — rule 402.3 / 204.1.b: an effect
 * that pays by exhausting one unit and moves "a DIFFERENT unit you control"
 * needs two distinct units, so the ids a `to: "exhausted-ally"` move may
 * legally carry are only those with some other ready unit left to pay.
 *
 * rule 355.4.a — a Move also needs a destination OTHER than the mover's
 * current location, and here the destination IS the payer's location: a payer
 * standing beside the mover is no legal line, so a mover whose every possible
 * payer shares its location is not offered at all (402.3).
 */
function exhaustedAllyPayerPool(
  effect: unknown,
  moverId: string,
  resolverCtx: Parameters<typeof resolveTarget>[1],
): string[] {
  const e = effect as { costExhaust?: unknown } | undefined;
  if (!e?.costExhaust) {
    return [];
  }
  const zoneOf = (id: string): string | undefined =>
    (resolverCtx as { zones?: { getCardZone: (id: CoreCardId) => string | undefined } }).zones?.getCardZone(
      id as CoreCardId,
    );
  const moverZone = zoneOf(moverId);
  return resolveTarget({ ...(e.costExhaust as TargetDescriptor), quantity: "all" }, resolverCtx).filter(
    (p) => p !== moverId && zoneOf(p) !== moverZone,
  );
}

function exhaustedAllyMoveTargets(
  effect: unknown,
  resolverCtx: Parameters<typeof resolveTarget>[1],
): string[] | undefined {
  const e = effect as { to?: unknown; target?: unknown; costExhaust?: unknown } | undefined;
  if (e?.to !== "exhausted-ally" || !e.target || !e.costExhaust) {
    return undefined;
  }
  const movers = resolveTarget({ ...(e.target as TargetDescriptor), quantity: "all" }, resolverCtx);
  return movers.filter((m) => exhaustedAllyPayerPool(effect, m, resolverCtx).length > 0);
}

/**
 * rule 404.1 / 414.4 / 406.4 (unl-045-219) — "Exhaust a unit you control" is a
 * COST, paid while the ability is finalized, so the payer is already exhausted
 * by the time an opponent holds priority. When exactly one candidate survives
 * the 355.4.a location filter the choice is forced, so it is settled (and paid)
 * at activation; a genuinely ambiguous pool is still chosen at resolution.
 */
function exhaustedAllyForcedPayer(
  effect: unknown,
  moverId: string | undefined,
  resolverCtx: Parameters<typeof resolveTarget>[1],
): string | undefined {
  const e = effect as { to?: unknown; costExhaust?: unknown } | undefined;
  if (e?.to !== "exhausted-ally" || !e.costExhaust || moverId === undefined) {
    return undefined;
  }
  const pool = exhaustedAllyPayerPool(effect, moverId, resolverCtx);
  return pool.length === 1 ? pool[0] : undefined;
}

function activationChosenTarget(effect: unknown): TargetDescriptor | undefined {
  let t = (effect as { target?: unknown } | undefined)?.target;
  // rule 355.7/355.8: a sequence ability ("Kill a friendly unit. Look at the
  // top 5 …") still declares its one caster-chosen target at finalization, so
  // opponents may react before it resolves — same lead-slot rule as spells.
  if (!t && (effect as { type?: string } | undefined)?.type === "sequence") {
    t = findSequenceLeadTarget(effect as SpellEffectTargetShape);
  }
  // rule 355.8 (rule-id: ven-077-166) — "Give a unit +2 [Might]. If this is
  // [Empowered], give that unit +4 instead": both branches name the same
  // caster-chosen unit, so the choice belongs to the activation and is locked
  // when the ability is finalized on the chain — same lead-slot rule as spells.
  if (!t && (effect as { type?: string } | undefined)?.type === "conditional") {
    t = findConditionalBranchTarget(effect as SpellEffectTargetShape);
  }
  if (!t || typeof t !== "object") {
    return undefined;
  }
  // rule 355.10.a (rule-id: unl-148-219 / ogn-198-298) — an off-board play
  // ("play a unit banished with this") names a card in that zone, not a board
  // object: the choice belongs to the ability's resolution, so it is not a
  // caster-chosen target to enumerate at finalization.
  const offBoard = effect as SpellEffectTargetShape | undefined;
  if (offBoardPlayZone(offBoard) !== undefined && !offBoardPlayIsCasterChosen(offBoard)) {
    return undefined;
  }
  const d = t as TargetDescriptor & { quantity?: unknown };
  if (
    d.type === "self" ||
    d.type === "trigger-source" ||
    d.type === "player" ||
    d.type === "battlefield" ||
    d.type === "pending-value"
  ) {
    return undefined;
  }
  // rule 355.5 (rule-id: ven-194-166) — an exact plural count ("Ready 2 gear")
  // is still a caster-chosen target, just N of them; only "all"/"up to" shapes
  // stay out of the activation-time choice.
  if (d.quantity !== undefined && d.quantity !== 1 && typeof d.quantity !== "number") {
    return undefined;
  }
  return d;
}

/**
 * rule 828.1.b.1 (rule-id: ven-194-166) — an ability granted by an
 * "[Empowered][>] …" line carries a `while-empowered` condition: the host only
 * has it while Empowered. Composed `and` conditions count too.
 */
function requiresEmpowered(condition: unknown): boolean {
  const c = condition as { type?: string; conditions?: unknown[] } | undefined;
  if (!c || typeof c !== "object") {
    return false;
  }
  if (c.type === "while-empowered") {
    return true;
  }
  return c.type === "and" && (c.conditions ?? []).some((sub) => requiresEmpowered(sub));
}

/** How many objects a caster-chosen activated target names (rule 355.5). */
function chosenTargetCount(descriptor: TargetDescriptor | undefined): number {
  const q = (descriptor as { quantity?: unknown } | undefined)?.quantity;
  return typeof q === "number" && q > 1 ? q : 1;
}

/**
 * A resolved entry returned by `collectActivatedAbilities`.
 *
 * - `hostCardId` is the card whose cost will be paid (e.g., Heimerdinger,
 *   Svellsongur). This is always the card the player selects.
 * - `sourceCardId` is the card whose ability text/effect is used. It equals
 *   `hostCardId` for a card's own abilities and differs for inherited /
 *   copied abilities.
 * - `abilityIndex` indexes into the source card's registry ability list.
 */
export interface ActivatedEntry {
  hostCardId: string;
  sourceCardId: string;
  abilityIndex: number;
  ability: NonNullable<
    ReturnType<ReturnType<typeof getGlobalCardRegistry>["getAbilities"]>
  >[number];
}

/**
 * Collect every activated ability available on `hostCardId`, including
 * abilities inherited via `inheritExhaustAbilities` (Heimerdinger) or
 * copied via `copiedFromCardId` meta (Svellsongur).
 *
 * Each returned entry is a distinct `(sourceCardId, abilityIndex)` pair that
 * will be paid on `hostCardId`. Own abilities come first so the existing
 * ability-index convention is preserved for cards without inheritance.
 */
export function collectActivatedAbilities(
  hostCardId: string,
  playerId: string,
  ctx: {
    zones: {
      getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    };
    cards: {
      getCardOwner: (cardId: CoreCardId) => string | undefined;
      getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    };
    battlefields: Record<string, unknown>;
  },
): ActivatedEntry[] {
  const registry = getGlobalCardRegistry();
  const entries: ActivatedEntry[] = [];

  // 1. Own abilities (always present — abilityIndex matches getAbilities)
  const ownAbilities = registry.getAbilities(hostCardId) ?? [];
  for (let i = 0; i < ownAbilities.length; i++) {
    const ability = ownAbilities[i];
    if (!ability || ability.type !== "activated") {
      continue;
    }
    entries.push({
      ability,
      abilityIndex: i,
      hostCardId,
      sourceCardId: hostCardId,
    });
  }

  // 2. Copied abilities (Svellsongur): when `copiedFromCardId` is set,
  // Expose the referenced card's activated abilities as if they were this
  // Card's own.
  const hostMeta = ctx.cards.getCardMeta(hostCardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  const copiedFrom = hostMeta?.copiedFromCardId;
  if (copiedFrom && copiedFrom !== hostCardId) {
    const copiedAbilities = registry.getAbilities(copiedFrom as string) ?? [];
    for (let i = 0; i < copiedAbilities.length; i++) {
      const ability = copiedAbilities[i];
      if (!ability || ability.type !== "activated") {
        continue;
      }
      entries.push({
        ability,
        abilityIndex: i,
        hostCardId,
        sourceCardId: copiedFrom as string,
      });
    }
  }

  // rule-id: ven-142-166 — abilities granted by another card's effect
  // ("give it '[rainbow][rainbow]: Ready me' this turn"). Host pays; the
  // ability text lives on the granting card at `abilityIndex`.
  for (const granted of hostMeta?.grantedAbilities ?? []) {
    const ability = (registry.getAbilities(granted.sourceCardId as string) ?? [])[
      granted.abilityIndex
    ];
    if (!ability || ability.type !== "activated") {
      continue;
    }
    entries.push({
      ability,
      abilityIndex: granted.abilityIndex,
      hostCardId,
      sourceCardId: granted.sourceCardId as string,
    });
  }

  // 3. Inherited exhaust abilities (Heimerdinger): scan every friendly
  // Legend, unit, and gear for activated abilities whose cost includes
  // `exhaust: true`, and expose each as if it were an ability of this card.
  const hostDef = registry.get(hostCardId);
  if (hostDef?.inheritExhaustAbilities) {
    const friendlyCardIds = collectFriendlyBoardCards(playerId, ctx);
    for (const otherCardId of friendlyCardIds) {
      if (otherCardId === hostCardId) {
        continue;
      }
      const otherDef = registry.get(otherCardId);
      if (!otherDef) {
        continue;
      }
      const { cardType } = otherDef;
      if (
        cardType !== "legend" &&
        cardType !== "unit" &&
        cardType !== "gear" &&
        cardType !== "equipment"
      ) {
        continue;
      }
      const otherAbilities = registry.getAbilities(otherCardId) ?? [];
      for (let i = 0; i < otherAbilities.length; i++) {
        const ability = otherAbilities[i];
        if (!ability || ability.type !== "activated") {
          continue;
        }
        const cost = ability.cost as Record<string, unknown> | undefined;
        if (!cost || cost.exhaust !== true) {
          continue;
        }
        entries.push({
          ability,
          abilityIndex: i,
          hostCardId,
          sourceCardId: otherCardId,
        });
      }
    }
  }

  return entries;
}

/**
 * Collect all friendly cards on the board for a player — used when scanning
 * for inheritable abilities (Heimerdinger).
 */
export function collectFriendlyBoardCards(
  playerId: string,
  ctx: {
    zones: {
      getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    };
    cards: {
      getCardOwner: (cardId: CoreCardId) => string | undefined;
      getCardController?: (cardId: CoreCardId) => string | undefined;
    };
    battlefields: Record<string, unknown>;
  },
): string[] {
  const collected: string[] = [];
  // rule 740.1.a — "friendly" is same CONTROLLER, not same owner. Zone queries
  // filter by owner, so scan each zone unfiltered and key on current control:
  // a stolen permanent is friendly to its new controller only.
  const push = (cards: CoreCardId[]) => {
    for (const cardId of cards) {
      const controller = ctx.cards.getCardController?.(cardId) ?? ctx.cards.getCardOwner(cardId);
      if (controller === playerId) {
        collected.push(cardId as string);
      }
    }
  };
  push(ctx.zones.getCardsInZone("base" as CoreZoneId));
  push(ctx.zones.getCardsInZone("legendZone" as CoreZoneId));
  // rule 108.3 — the champion zone is not the board: a champion waiting there
  // has not been played, so its abilities are not on any friendly permanent.
  for (const bfId of Object.keys(ctx.battlefields)) {
    push(ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId));
  }
  return collected;
}

/**
 * rule 135.2.e.5.a / 429.1 (sfd-083-221, sfd-117-221) — "Pay any amount of
 * [rainbow]/Energy to [Add] that much …": the chosen X rides on the move as
 * `xAmount` (absent ⇒ 0, which is always a legal "any amount") and the cost
 * spec names which pool pays it ([rainbow] ⇒ Power of any Domain).
 */
export function abilityXPayment(
  cost: Record<string, unknown> | undefined,
  params: Record<string, unknown>,
): { amount: number; resource: "energy" | "power" } | undefined {
  const spec = cost?.x as { resource?: string } | undefined;
  if (!spec) {
    return undefined;
  }
  const raw = params.xAmount;
  const amount = typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : 0;
  return { amount, resource: spec.resource === "energy" ? "energy" : "power" };
}

/**
 * rule 827.1.c.1 / 441.1.b — "Use only if not Empowered". The parser emits
 * this either as a bare `not-empowered` restriction or as the generic
 * `use-only-if` wrapper around `not(while-empowered)` (ven set JSON); both
 * mean the same gate.
 */
export function blockedWhileEmpowered(
  restrictions: readonly { type: string; condition?: unknown }[] | undefined,
): boolean {
  return (
    restrictions?.some((r) => {
      if (r.type === "not-empowered") {
        return true;
      }
      if (r.type !== "use-only-if") {
        return false;
      }
      const c = r.condition as { type?: string; condition?: { type?: string } } | undefined;
      return c?.type === "not" && c.condition?.type === "while-empowered";
    }) ?? false
  );
}

/**
 * rule 441.1.c.1 (rule-id: ven-134-166) — an effect may grant permission to be
 * Empowered several times ("I can be [Empowered] up to three times"), and it
 * then ignores 441.1.b/827.1.c.1 entirely. Such an ability carries an
 * `empower-limit` restriction: the activation is legal until the host has been
 * Empowered that many times.
 */
export function empowerActivationBlocked(
  restrictions: readonly { type: string; condition?: unknown }[] | undefined,
  meta: { empowered?: boolean; empowerCount?: number } | undefined,
): boolean {
  const limit = restrictions?.find((r) => r.type === "empower-limit") as
    | { max?: number }
    | undefined;
  if (limit) {
    const count = meta?.empowerCount ?? (meta?.empowered === true ? 1 : 0);
    return count >= (limit.max ?? 1);
  }
  return blockedWhileEmpowered(restrictions) && meta?.empowered === true;
}

/**
 * rule 356.6 (rule-id: ven-163-166) — "[Empower] costs of your units here cost
 * [1] or [rainbow] less": a board static discounting an [Empower] ACTIVATION
 * cost (never a play cost) by one resource. Returns how many such discounts
 * apply to this host's Empower ability.
 */
export function empowerCostDiscount(
  ability: { effect?: unknown },
  hostCardId: string,
  playerId: string,
  zones: {
    getCardsInZone: (zone: CoreZoneId, player?: CorePlayerId) => readonly CoreCardId[];
    getCardZone?: (card: CoreCardId) => string | undefined;
  },
  cards: {
    getCardOwner: (card: CoreCardId) => CorePlayerId | undefined;
    getCardController?: (card: CoreCardId) => CorePlayerId | undefined;
  },
  battlefields?: Record<string, { controller?: string | null } | undefined>,
): number {
  if ((ability.effect as { type?: string } | undefined)?.type !== "empower") {
    return 0;
  }
  const hostZone = zones.getCardZone?.(hostCardId as CoreCardId);
  const registry = getGlobalCardRegistry();
  let discount = 0;
  for (const bfCardId of zones.getCardsInZone("battlefieldRow" as CoreZoneId)) {
    // rule 190.6.d — "your" on a battlefield means whoever CONTROLS it right
    // now (conquest flips it), not whoever owns/brought the card.
    const bfEntry = battlefields?.[bfCardId as string];
    const controller = bfEntry
      ? bfEntry.controller
      : (cards.getCardController?.(bfCardId) ?? cards.getCardOwner(bfCardId as CoreCardId));
    if (controller !== playerId) {
      continue;
    }
    for (const bfAbility of registry.getAbilities(bfCardId as string) ?? []) {
      const a = bfAbility as { type?: string; effect?: Record<string, unknown> };
      if (a.type !== "static" || a.effect?.type !== "empower-cost-reduction") {
        continue;
      }
      const target = a.effect.target as { controller?: string; location?: string } | undefined;
      // "your units HERE" — only units standing at this battlefield qualify.
      if (target?.location === "here" && hostZone !== `battlefield-${bfCardId as string}`) {
        continue;
      }
      discount += 1;
    }
  }
  return discount;
}

/**
 * rule 356.4 / 356.6 (rule-id: ven-161-166) — the ENERGY a controlled
 * battlefield shaves off this activation ("While you control this battlefield,
 * the first friendly gear activated ability played each turn costs [1] less").
 * Only the host's card type in the static's `target` qualifies, "you" is the
 * battlefield's current CONTROLLER (rule 190.6.d), and a `first-each-turn`
 * restriction is spent by the player's first gear activation of the turn —
 * even a costless one.
 */
export function activationEnergyDiscount(
  hostCardId: string,
  playerId: string,
  state: {
    battlefields?: Record<string, { controller?: string | null } | undefined>;
    gearAbilityTurn?: Record<string, number>;
    turn: { number: number };
  },
  zones: {
    getCardsInZone: (zone: CoreZoneId, player?: CorePlayerId) => readonly CoreCardId[];
  },
  cards: {
    getCardOwner: (card: CoreCardId) => CorePlayerId | undefined;
    getCardController?: (card: CoreCardId) => CorePlayerId | undefined;
  },
): number {
  const registry = getGlobalCardRegistry();
  const hostType = registry.getCardType(hostCardId);
  let discount = 0;
  for (const bfCardId of zones.getCardsInZone("battlefieldRow" as CoreZoneId)) {
    const bfEntry = state.battlefields?.[bfCardId as string];
    const controller = bfEntry
      ? bfEntry.controller
      : (cards.getCardController?.(bfCardId) ?? cards.getCardOwner(bfCardId as CoreCardId));
    if (controller !== playerId) {
      continue;
    }
    for (const bfAbility of registry.getAbilities(bfCardId as string) ?? []) {
      const a = bfAbility as { type?: string; effect?: Record<string, unknown> };
      if (a.type !== "static" || a.effect?.type !== "activation-cost-reduction") {
        continue;
      }
      const target = a.effect.target as
        | { controller?: string; cardType?: string }
        | undefined;
      if (target?.controller === "enemy" || (target?.cardType && target.cardType !== hostType)) {
        continue;
      }
      const restrictions = (a.effect.restrictions ?? []) as { type?: string }[];
      if (
        restrictions.some((r) => r.type === "first-each-turn") &&
        state.gearAbilityTurn?.[playerId] === state.turn.number
      ) {
        continue;
      }
      discount += ((a.effect.amount as number) ?? 1);
    }
  }
  return discount;
}

/** rule 356.4 (rule-id: ven-161-166) — mark this turn's "first gear ability" spent. */
export function noteGearAbilityActivation(
  draft: {
    gearAbilityTurn?: Record<string, number>;
    turn: { number: number };
  },
  playerId: string,
  hostCardId: string,
): void {
  if (getGlobalCardRegistry().getCardType(hostCardId) !== "gear") {
    return;
  }
  draft.gearAbilityTurn ??= {};
  draft.gearAbilityTurn[playerId] = draft.turn.number;
}

/**
 * rule 356.4 (rule-id: ven-163-166) — "costs [1] or [rainbow] less" removes ONE
 * resource per discount and WHICH one is the payer's choice: an energy or a
 * single Power pip. Enumerated most-energy-shaved first (the default pick), so
 * a mixed [2][fury] cost offers [1][fury] and plain [2].
 */
function resourceDiscountVariants(
  cost: Record<string, unknown>,
  discount: number,
): Record<string, unknown>[] {
  const energy = (cost.energy as number) ?? 0;
  const power = (cost.power as string[] | undefined) ?? [];
  const variants: Record<string, unknown>[] = [];
  const maxFromEnergy = Math.min(discount, energy);
  for (let fromEnergy = maxFromEnergy; fromEnergy >= 0; fromEnergy--) {
    const fromPower = Math.min(discount - fromEnergy, power.length);
    const next = { ...cost, energy: energy - fromEnergy };
    if (power.length > 0) {
      next.power = power.slice(fromPower);
    }
    variants.push(next);
  }
  return variants;
}

/**
 * Apply a "[1] or [rainbow] less" discount. With a pool in hand the payer picks
 * the branch they can actually pay (356.4); without one the energy-first branch
 * is the deterministic default.
 */
function applyResourceDiscount(
  cost: Record<string, unknown> | undefined,
  discount: number,
  pool?: { energy: number; power: Record<string, number | undefined> },
  potentialEnergy = 0,
): Record<string, unknown> | undefined {
  if (!cost || discount <= 0) {
    return cost;
  }
  const variants = resourceDiscountVariants(cost, discount);
  if (pool) {
    const payable =
      variants.find((v) => costOptionAffordable(v, pool, 0)) ??
      variants.find((v) => costOptionAffordable(v, pool, potentialEnergy));
    if (payable) {
      return payable;
    }
  }
  return variants[0];
}

/** Can this pool pay one whole alternative cost right now? */
function costOptionAffordable(
  option: Record<string, unknown>,
  pool: { energy: number; power: Record<string, number | undefined> },
  potentialEnergy: number,
): boolean {
  if (pool.energy + potentialEnergy < ((option.energy as number) ?? 0)) {
    return false;
  }
  const power = option.power as string[] | undefined;
  if (power) {
    const needed: Record<string, number> = {};
    for (const domain of power) {
      needed[domain] = (needed[domain] ?? 0) + 1;
    }
    if (!canAffordPower(pool.power, needed)) {
      return false;
    }
  }
  return true;
}

/**
 * rule 827.1.c.2 (rule-id: ven-074-166) — an either/or activation cost
 * ("[Empower] — [1] or [body]") lists several COMPLETE costs and exactly one of
 * them is paid: never both, never neither. Which one is the CONTROLLER'S choice
 * (rule 357.2), so an explicit `costOptionIndex` param always wins; only when
 * the activation names none do we fall back to a deterministic pick — a cost
 * payable out of banked resources over one that would need runes exhausted, and
 * the first printed one among equals.
 */
function selectCostOption(
  ability: { costOptions?: unknown },
  pool: { energy: number; power: Record<string, number | undefined> } | undefined,
  potentialEnergy: number,
  discount = 0,
  chosenIndex?: number,
): Record<string, unknown> | undefined {
  const raw = ability.costOptions;
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const options = raw as Record<string, unknown>[];
  if (typeof chosenIndex === "number" && options[chosenIndex]) {
    return options[chosenIndex];
  }
  if (!pool) {
    return options[0];
  }
  const afford = (o: Record<string, unknown>, extra: number) =>
    costOptionAffordable(applyResourceDiscount(o, discount, pool, extra) ?? o, pool, extra);
  return (
    options.find((o) => afford(o, 0)) ?? options.find((o) => afford(o, potentialEnergy)) ?? options[0]
  );
}

/**
 * rule 357.2 (rule-id: ven-074-166) — indices of the either/or costs the player
 * can actually pay right now out of banked resources. Fewer than two → there is
 * no choice to offer and the activation carries no `costOptionIndex`.
 */
export function affordableCostOptionIndices(
  ability: { costOptions?: unknown },
  pool: { energy: number; power: Record<string, number | undefined> } | undefined,
  discount = 0,
): number[] | undefined {
  const raw = ability.costOptions;
  if (!Array.isArray(raw) || raw.length < 2 || !pool) {
    return undefined;
  }
  const options = raw as Record<string, unknown>[];
  // Two halves that a discount has collapsed onto the same payment (Risen Altar
  // makes both [1] and [body] free) are not a choice — offer each distinct one once.
  const seen = new Set<string>();
  const indices: number[] = [];
  for (let i = 0; i < options.length; i++) {
    const applied = applyResourceDiscount(options[i], discount, pool) ?? options[i];
    if (!costOptionAffordable(applied, pool, 0)) {
      continue;
    }
    const power = [...((applied.power as string[] | undefined) ?? [])].sort().join(",");
    const sig = `${String((applied.energy as number | undefined) ?? 0)}|${power}`;
    if (seen.has(sig)) {
      continue;
    }
    seen.add(sig);
    indices.push(i);
  }
  return indices.length > 1 ? indices : undefined;
}

/** Board access a scaling cost modifier needs on top of the player's rune pool. */
export type AbilityCostBoard = {
  battlefields?: Record<string, { controller?: string | null } | undefined>;
  cards?: {
    getCardController?: (card: CoreCardId) => CorePlayerId | undefined;
    getCardMeta?: (card: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner?: (card: CoreCardId) => CorePlayerId | undefined;
  };
};

/**
 * rule 356.4 (rule-id: unl-189-219) — count the UNITS this player controls that
 * have `keyword`, in base and at every battlefield. Printed and granted keywords
 * both count (rule 806.1); gear and enemy units never do.
 */
function friendlyKeywordUnitCount(
  keyword: string,
  playerId: string,
  zones: { getCardsInZone: (zone: CoreZoneId, player?: CorePlayerId) => readonly CoreCardId[] },
  board?: AbilityCostBoard,
): number {
  if (!keyword) {
    return 0;
  }
  const registry = getGlobalCardRegistry();
  const getMeta = board?.cards?.getCardMeta;
  const counts = (cardId: CoreCardId): boolean => {
    if (registry.getCardType(cardId as string) !== "unit") {
      return false;
    }
    if (registry.hasKeyword(cardId as string, keyword)) {
      return true;
    }
    const granted = getMeta?.(cardId)?.grantedKeywords as
      | readonly { keyword?: string }[]
      | undefined;
    return granted?.some((g) => g.keyword === keyword) === true;
  };
  let total = 0;
  for (const cardId of zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId)) {
    if (counts(cardId)) {
      total += 1;
    }
  }
  for (const bfId of zones.getCardsInZone("battlefieldRow" as CoreZoneId)) {
    for (const cardId of zones.getCardsInZone(`battlefield-${bfId as string}` as CoreZoneId)) {
      const controller =
        board?.cards?.getCardController?.(cardId) ?? board?.cards?.getCardOwner?.(cardId);
      if (controller !== playerId) {
        continue;
      }
      if (counts(cardId)) {
        total += 1;
      }
    }
  }
  return total;
}

/**
 * rule 827.1.c.3 (rule-id: ven-001-166) — "This ability costs [N] less if
 * COND" is part of the ability's cost, so both the affordability checks and
 * the payment must use the reduced cost when COND holds.
 */
export function effectiveAbilityCost(
  ability: { cost?: unknown; costModifier?: unknown; costOptions?: unknown },
  playerId: string,
  zones: { getCardsInZone: (zone: CoreZoneId, player?: CorePlayerId) => readonly CoreCardId[] },
  pool?: { energy: number; power: Record<string, number | undefined> },
  potentialEnergy = 0,
  discount = 0,
  costOptionIndex?: number,
  energyDiscount = 0,
  board?: AbilityCostBoard,
): Record<string, unknown> | undefined {
  const chosenOption = selectCostOption(ability, pool, potentialEnergy, discount, costOptionIndex);
  const baseCost = ability.cost as Record<string, unknown> | undefined;
  const merged = chosenOption ? { ...(baseCost ?? {}), ...chosenOption } : baseCost;
  let cost = applyResourceDiscount(merged, discount, pool, potentialEnergy);
  // rule 356.6 (rule-id: ven-161-166) — an Energy-only reduction shaves the
  // [N] part of the cost and never a Power pip, floored at zero.
  if (cost && energyDiscount > 0) {
    cost = { ...cost, energy: Math.max(0, ((cost.energy as number) ?? 0) - energyDiscount) };
  }
  const mod = ability.costModifier as
    | { condition?: { type?: string; amount?: number }; reduction?: number }
    | undefined;
  const reduction = mod?.reduction ?? 0;
  if (!cost || reduction <= 0) {
    return cost;
  }
  const cond = mod?.condition as
    | { amount?: number; keyword?: string; type?: string }
    | undefined;
  if (cond?.type === "per-friendly-unit-with-keyword") {
    // rule 356.4 / 356.6 (rule-id: unl-189-219) — "costs [1] less for each
    // friendly unit with [Keyword]": only UNITS I control count (my Temporary
    // gear and the opponent's Temporary units do not), and the Energy part of
    // the cost never drops below zero.
    const units = friendlyKeywordUnitCount(cond.keyword ?? "", playerId, zones, board);
    const baseEnergy = (cost.energy as number) ?? 0;
    return { ...cost, energy: Math.max(0, baseEnergy - reduction * units) };
  }
  if (cond?.type === "per-rune-controlled") {
    // rule 827.1.c.3 (rule-id: ven-032-166) — "costs [1] less for each rune you
    // control": every rune card in my pool counts, ready or exhausted, and the
    // cost never goes below zero.
    const runes = zones.getCardsInZone("runePool" as CoreZoneId, playerId as CorePlayerId).length;
    const baseEnergy = (cost.energy as number) ?? 0;
    return { ...cost, energy: Math.max(0, baseEnergy - reduction * runes) };
  }
  let applies = false;
  if (cond?.type === "runes-at-most" || cond?.type === "runes-at-least") {
    // rule 430.1: your rune pool, ready or exhausted.
    const runes = zones.getCardsInZone("runePool" as CoreZoneId, playerId as CorePlayerId).length;
    const amount = cond.amount ?? 0;
    applies = cond.type === "runes-at-most" ? runes <= amount : runes >= amount;
  }
  if (!applies) {
    return cost;
  }
  const energy = (cost.energy as number) ?? 0;
  return { ...cost, energy: Math.max(0, energy - reduction) };
}

/**
 * Deduct an activated ability's cost from the player's rune pool.
 */
/**
 * rule 429.4 (ven-141-166) — the earmark purpose of activating an ability:
 * `"ability:<the source card's type>"`, so "…or activated abilities of units"
 * funds a unit's ability but never a gear's.
 */
function abilityEarmarkPurpose(hostCardId: string): string {
  return `ability:${getGlobalCardRegistry().getCardType(hostCardId) ?? "unknown"}`;
}

/** rule 429.4 — Energy the earmark hides from activating `hostCardId`'s ability. */
function lockedAbilityEnergy(
  state: RiftboundGameState,
  playerId: string,
  hostCardId: string,
): number {
  return lockedEnergyForPurpose(state, playerId, abilityEarmarkPurpose(hostCardId));
}

/**
 * rule 429.4 / 444.1 (ogn-247-298 Daughter of the Void) — the Power half of the
 * same gate: pips earmarked "use only to play spells" cannot be REMOVED from
 * the pool to pay a gear ability's activation cost, so every affordability read
 * on this path sees the pool minus the pips this activation may not touch.
 */
function spendableAbilityPower(
  state: RiftboundGameState,
  playerId: string,
  hostCardId: string,
): Record<string, number | undefined> {
  return spendablePowerPool(state, playerId, abilityEarmarkPurpose(hostCardId));
}

export function deductAbilityCost(
  draft: RiftboundGameState,
  playerId: string,
  cost: Record<string, unknown>,
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  counters: {
    getFlag: (cardId: CoreCardId, flag: string) => boolean | undefined;
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
  },
  /** rule 429.4 — the ability's source, so an Energy earmark that funds "activated abilities of X" is consumed first. */
  hostCardId?: string,
): void {
  // rule 512.2 / rule-id: unl-135-219 — an XP portion of a cost is spent from
  // the player's XP pool (which lives outside the rune pool, so charge it
  // before the pool guard below).
  const xpCost = (cost.xp as number) ?? 0;
  if (xpCost > 0) {
    const player = draft.players[playerId];
    if (player) {
      player.xp = Math.max(0, player.xp - xpCost);
    }
  }

  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }

  const energyCost = (cost.energy as number) ?? 0;
  if (energyCost > 0) {
    // Rule 403.1.a + 404.1: the full [N] energy cost must be paid before an
    // ability is finalized to the chain. Rule 357.1.a lets a player exhaust
    // ready runes for energy during Pay Costs, and the condition/enumerator
    // credit those runes toward affordability — so when banked energy is
    // short, auto-exhaust ready runes here to actually cover the shortfall
    // instead of clamping the deduction to zero.
    let shortfall = energyCost - pool.energy;
    if (shortfall > 0) {
      const runes = zones.getCardsInZone("runePool" as CoreZoneId, playerId as CorePlayerId);
      for (const runeId of runes) {
        if (shortfall <= 0) {
          break;
        }
        if (counters.getFlag(runeId, "exhausted")) {
          continue;
        }
        counters.setFlag(runeId, "exhausted", true);
        pool.energy += 1;
        shortfall -= 1;
      }
    }
    pool.energy = Math.max(0, pool.energy - energyCost);
    // rule 429.4 — spending on something the earmark allows burns the
    // earmarked portion first, so it stops taxing later payments.
    if (hostCardId !== undefined) {
      consumeRestrictedEnergyForPurpose(
        draft,
        playerId,
        abilityEarmarkPurpose(hostCardId),
        energyCost,
      );
    }
  }

  const powerCost = cost.power as string[] | undefined;
  if (powerCost) {
    for (const domain of powerCost) {
      // rule 135.2.e.6.c: a hybrid pip ("fury|order") is one Power of either of
      // the printing card's own Domains — never a third Domain's Power.
      const hybrid = domain.includes("|") ? domain.split("|") : undefined;
      // Rule 135.2.e.5.a: [rainbow] costs are paid with any Domain's Power.
      const key =
        domain === "rainbow" || hybrid
          ? (Object.entries(pool.power)
              .filter(([d, v]) => (v ?? 0) > 0 && (!hybrid || d === "rainbow" || hybrid.includes(d)))
              .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0] as
              | keyof typeof pool.power
              | undefined)
          : (domain as keyof typeof pool.power);
      // rule 135.2.e.5.b: universal ([rainbow]) Power pays a pip of any Domain,
      // so a named-domain pip falls back to it when that Domain is empty.
      if (key !== undefined && (pool.power[key] ?? 0) === 0 && (pool.power.rainbow ?? 0) > 0) {
        pool.power.rainbow = (pool.power.rainbow ?? 0) - 1;
        continue;
      }
      if (key !== undefined) {
        pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - 1);
      }
    }
  }
}

/**
 * Activate an ability on a card (rules 564-585)
 *
 * Player chooses a card + ability index, pays the cost,
 * and the ability goes on the chain.
 */

/**
 * rule 357.2 — an activation's object costs in ONE `costs` param
 * (`paid.kill` / `paid.discard` / `paid.recycle` → objects), expanded onto the
 * legacy `sacrificeId` / `discardId` / `recycleIds` the body still reads.
 */
function expandAbilityCosts<P extends { costs?: PlayCostSelection; sacrificeId?: unknown; discardId?: unknown; recycleIds?: unknown }>(params: P): P {
  const sel = params.costs;
  if (!sel?.paid) {
    return params;
  }
  const objectsOf = (id: string): string[] | undefined => {
    const v = sel.paid?.[id];
    return v === undefined || v === true ? undefined : [...(v.objects ?? [])];
  };
  return {
    ...params,
    ...(params.sacrificeId === undefined && objectsOf("kill")?.[0] ? { sacrificeId: objectsOf("kill")?.[0] } : {}),
    ...(params.discardId === undefined && objectsOf("discard")?.[0] ? { discardId: objectsOf("discard")?.[0] } : {}),
    ...(params.recycleIds === undefined && objectsOf("recycle") ? { recycleIds: objectsOf("recycle") } : {}),
  };
}

/** Enumerator twin: attach the `costs` selection equivalent to a variant's object-cost params. */
function withAbilityCosts<P extends { costs?: PlayCostSelection; sacrificeId?: string; discardId?: string; recycleIds?: string[] }>(v: P): P {
  if (v.costs || (v.sacrificeId === undefined && v.discardId === undefined && v.recycleIds === undefined)) {
    return v;
  }
  const paid: Record<string, { objects: string[] }> = {};
  if (v.sacrificeId !== undefined) paid.kill = { objects: [v.sacrificeId] };
  if (v.discardId !== undefined) paid.discard = { objects: [v.discardId] };
  if (v.recycleIds !== undefined) paid.recycle = { objects: [...v.recycleIds] };
  return { ...v, costs: { paid } };
}

export const activateAbility: Defs["activateAbility"] = {
  condition: (state, rawContext) => {
    const context = rawContext.params.costs
      ? { ...rawContext, params: expandAbilityCosts(rawContext.params) }
      : rawContext;
    if (state.status !== "playing") {
      return false;
    }
    const { playerId, cardId, abilityIndex, sourceCardId } = context.params;

    // rule 429.3 / 429.3.a / 444.2.c: while a payment is being asked for, the
    // paying player may still activate Reaction [Add] abilities (they resolve
    // immediately and never use the chain). Every other pending choice, and
    // every other ability, stays locked out until the choice is answered.
    const payXPrompt = isPaymentPromptFor(state.pendingChoice, playerId);
    if (state.pendingChoice && !payXPrompt) {
      return false;
    }

    // Card must be on board (base, battlefield, legendZone, battlefieldRow).
    // Rule 580 / 101 (clarified): champions in championZone have NOT been
    // Played yet — they must be played from championZone into play before
    // Their activated abilities can be used. Legends in legendZone, by
    // Contrast, remain accessible from their zone. ChampionZone is therefore
    // Excluded from the set of zones that permit activation.
    const zone = context.zones.getCardZone(cardId as CoreCardId) as string | undefined;
    if (
      !zone ||
      (zone !== "base" &&
        !zone.startsWith("battlefield") &&
        zone !== "legendZone" &&
        zone !== "battlefieldRow")
    ) {
      return false;
    }

    // rule 477.1.a / 702.2.b.2: activation legality follows CURRENT CONTROL,
    // not ownership — a possessed unit is activated by its new controller and
    // no longer by its owner.
    const controller =
      context.cards.getCardController?.(cardId as CoreCardId) ??
      context.cards.getCardOwner(cardId as CoreCardId);
    if (controller !== playerId) {
      return false;
    }

    // Look up the ability from the source card (may equal cardId for own
    // Abilities or differ for inherited/copied abilities).
    const registry = getGlobalCardRegistry();
    const abilityLookupId = (sourceCardId as string | undefined) ?? cardId;
    const abilities = registry.getAbilities(abilityLookupId) ?? [];
    const ability = abilities[abilityIndex];
    if (!ability || ability.type !== "activated") {
      return false;
    }

    // rule 605.2 / 429.3.a: only resource-Adding abilities resolve immediately,
    // so only those may be used mid-payment.
    if (payXPrompt) {
      if (!isImmediateAddEffect(ability.effect)) {
        return false;
      }
    }

    // Rule 728 / [Level N]: an activated ability gated by a while-level
    // condition is unavailable until the controller has ≥ threshold XP.
    const abilityCondition = (ability as { condition?: { type?: string; threshold?: number } })
      .condition;
    if (abilityCondition?.type === "while-level") {
      if (!evaluateWhileLevel(state, playerId, abilityCondition.threshold ?? 0)) {
        return false;
      }
    }
    // rule 812.1.c (ogn-253-298): a [Legion] activated ability is only usable
    // once you have played a card this turn — the count resets every turn.
    if (abilityCondition?.type === "legion" && !evaluateLegionCondition(state, playerId)) {
      return false;
    }
    // rule 828.1.b.1 (rule-id: ven-194-166) — "[Empowered][>] <ability>" is an
    // ability the host HAS only while it is Empowered.
    if (
      requiresEmpowered(abilityCondition) &&
      (context.cards.getCardMeta(cardId as CoreCardId) as { empowered?: boolean } | undefined)
        ?.empowered !== true
    ) {
      return false;
    }

    // Rule 580.3 (unl-160-219): "Use this ability only while I'm at a
    // battlefield" attaches a self-at-battlefield restriction to the
    // activated ability; the host card must be at a battlefield zone.
    const abilityRestrictions = (ability as { restrictions?: readonly { type: string }[] })
      .restrictions;
    if (abilityRestrictions?.some((r) => r.type === "self-at-battlefield")) {
      if (!zone.startsWith("battlefield")) {
        return false;
      }
    }
    // rule 135.4.b (unl-213-219): text that exists only on the cards it is
    // granted to — the card printing it never activates it itself.
    if (
      abilityRestrictions?.some((r) => r.type === "granted-only") &&
      (!sourceCardId || sourceCardId === cardId)
    ) {
      return false;
    }
    // rule 377.2.b (sfd-090-221 The Zero Drive) — "(Use only if unattached.)":
    // while the Equipment is worn the ability is not available at all.
    if (abilityRestrictions?.some((r) => r.type === "unattached")) {
      const attached = (
        context.cards.getCardMeta(cardId as CoreCardId) as { attachedTo?: string } | undefined
      )?.attachedTo;
      if (typeof attached === "string" && attached !== "") {
        return false;
      }
    }
    // rule 377.2.b: "Use only once per turn" — already used this turn.
    if (oncePerTurnExhausted(state, abilityRestrictions, cardId as string, abilityIndex as number)) {
      return false;
    }
    // rule 377.2.b: "Use only if you've chosen an enemy unit this turn."
    if (chosenEnemyObjectsRestrictionUnmet(state, abilityRestrictions, playerId as string)) {
      return false;
    }
    if (chosenEnemyRestrictionUnmet(state, abilityRestrictions, playerId as string)) {
      return false;
    }
    // rule 377.2.b: "Use only if you've played an Equipment this turn."
    if (playedEquipmentRestrictionUnmet(state, abilityRestrictions, playerId as string)) {
      return false;
    }
    // Rule 827.1.c.1: [Empower] carries an implicit "Play only if not
    // Empowered" — reject activation when the host is already Empowered.
    {
      const hostMeta = context.cards.getCardMeta(cardId as CoreCardId) as
        | { empowered?: boolean; empowerCount?: number }
        | undefined;
      if (empowerActivationBlocked(abilityRestrictions, hostMeta)) {
        return false;
      }
    }

    // If an inherited ability was requested, verify that the host card
    // Legitimately exposes it (prevents arbitrary cross-card activation).
    if (sourceCardId && sourceCardId !== cardId) {
      const entries = collectActivatedAbilities(cardId, playerId, {
        battlefields: state.battlefields,
        cards: context.cards,
        zones: context.zones,
      });
      const match = entries.find(
        (e) => e.sourceCardId === sourceCardId && e.abilityIndex === abilityIndex,
      );
      if (!match) {
        return false;
      }
    }

    // Check timing legality
    const interaction = state.interaction ?? createInteractionState();
    const turnState = getTurnState(interaction);
    const timing = abilityTimingClass(ability as { keyword?: string; timing?: string }, cardId as string);
    if (!isLegalTiming(timing, turnState)) {
      return false;
    }
    // rule 429.3 / 429.3.a: a payment being asked for is its own window — the
    // paying player may crack Reaction [Add] abilities there regardless of who
    // holds Focus or the turn.
    if (!payXPrompt) {
      // rule 316.5.b: in a Neutral Open State only the Turn Player may
      // activate abilities ([Reaction] adds Closed States, not this one).
      if (turnState === "neutral-open" && state.turn.activePlayer !== playerId) {
        return false;
      }
      // rule 312.2.c-d / 338.1.b.1: Closed State → only the Priority holder
      // may add another item to the chain.
      if (!hasChainPriorityPermission(interaction, playerId)) {
        return false;
      }
      // rule 313.1 / 347: in a Showdown Open State only the Focus holder acts.
      if (turnState === "showdown-open" && !hasShowdownPermission(interaction, playerId)) {
        return false;
      }
    }

    // Check if player can afford the cost
    const effectiveCost = effectiveAbilityCost(
      ability as { cost?: unknown; costModifier?: unknown; costOptions?: unknown },
      playerId as string,
      context.zones,
      state.runePools[playerId],
      readyRuneEnergy(
        context.zones,
        context.counters as { getFlag: (c: CoreCardId, f: string) => boolean | undefined },
        playerId,
      ),
      empowerCostDiscount(
        ability as { effect?: unknown },
        cardId as string,
        playerId as string,
        context.zones,
        context.cards,
        state.battlefields,
      ),
      context.params.costOptionIndex as number | undefined,
      activationEnergyDiscount(
        cardId as string,
        playerId as string,
        state,
        context.zones,
        context.cards,
      ),
      { battlefields: state.battlefields, cards: context.cards },
    );
    if (effectiveCost) {
      const cost = effectiveCost;
      const pool = state.runePools[playerId];
      if (!pool) {
        return false;
      }

      const energyCost = (cost.energy as number) ?? 0;
      // Rule 357.1.a: ready runes may be exhausted for energy during Pay
      // Costs, so count them toward affordability (parity with play* moves).
      const potentialEnergy = readyRuneEnergy(
        context.zones,
        context.counters as { getFlag: (c: CoreCardId, f: string) => boolean | undefined },
        playerId,
      );
      // rule 429.4 — Energy earmarked for another purpose cannot pay here.
      if (
        pool.energy -
          lockedAbilityEnergy(state, playerId as string, cardId as string) +
          potentialEnergy <
        energyCost
      ) {
        return false;
      }

      // rule 429.4 — Power earmarked for another purpose cannot pay here.
      const spendablePower = spendableAbilityPower(state, playerId as string, cardId as string);
      const powerCost = cost.power as string[] | undefined;
      if (powerCost) {
        const needed: Record<string, number> = {};
        for (const d of powerCost) {
          needed[d] = (needed[d] ?? 0) + 1;
        }
        if (!canAffordPower(spendablePower, needed)) {
          return false;
        }
      }

      // rule 444.2 / 135.2.e.5.a: X may never exceed what the paying pool
      // holds; [rainbow] X is payable out of Power of ANY Domain.
      const xPay = abilityXPayment(cost, context.params as Record<string, unknown>);
      if (xPay) {
        const rawX = (context.params as { xAmount?: unknown }).xAmount;
        if (rawX !== undefined && (typeof rawX !== "number" || !Number.isInteger(rawX) || rawX < 0)) {
          return false;
        }
        if (xPay.resource === "energy") {
          if (pool.energy + potentialEnergy < energyCost + xPay.amount) {
            return false;
          }
        } else {
          const totalPower = Object.values(spendablePower).reduce<number>((a, b) => a + (b ?? 0), 0);
          if (totalPower < xPay.amount + (powerCost?.length ?? 0)) {
            return false;
          }
        }
      }

      // Rules 729-730: XP is a player resource; "Spend N XP" requires the
      // controller to have ≥N XP at activation time.
      const xpCost = cost.xp as number | undefined;
      if (xpCost && xpCost > 0) {
        const have = state.players[playerId]?.xp ?? 0;
        if (have < xpCost) {
          return false;
        }
      }

      // Rule 577.2: Cost must be payable at activation time. An [Exhaust]
      // Cost cannot be paid if the host card is already exhausted.
      // Exhaust always applies to the host card (`cardId`), even for
      // Inherited abilities where the source differs (e.g., Heimerdinger).
      if (cost.exhaust) {
        // rule 136.2.c/d: a copied (Svellsongur) ability exhausts the WEARER.
        const payer = exhaustPayerCardId(
          cardId as string,
          sourceCardId as string | undefined,
          (m) => context.cards.getCardMeta(m),
        ) as CoreCardId;
        const {getFlag} = (
          context.counters as { getFlag?: (c: CoreCardId, f: string) => boolean }
        );
        if (getFlag && getFlag(payer, "exhausted")) {
          return false;
        }
        const hostMeta = context.cards.getCardMeta(payer) as
          | { exhausted?: boolean }
          | undefined;
        if (hostMeta?.exhausted === true) {
          return false;
        }
      }

      // rule 702.2.b.1 (ogn-164-298 Sett): a "Spend my buff" cost removes the
      // host's buff — an unbuffed host cannot pay it.
      if (cost.spend === "buff") {
        const hostMeta = context.cards.getCardMeta(cardId as CoreCardId) as
          | { buffed?: boolean }
          | undefined;
        if (hostMeta?.buffed !== true) {
          return false;
        }
      }

      // rule 827.1.d (ven-087-166 Hextech Disc): "Disempower this" is payable
      // only while the host is [Empowered].
      if (cost.disempower === "self") {
        const hostMeta = context.cards.getCardMeta(cardId as CoreCardId) as
          | { empowered?: boolean }
          | undefined;
        if (hostMeta?.empowered !== true) {
          return false;
        }
      }

      // Rule 357.2 / 422.3: a "Discard N" cost requires ≥N cards in hand
      // at activation time; the caller names which card via `discardId`.
      const discardSpec = normalizeDiscardCost(cost.discard);
      if (discardSpec) {
        const hand = context.zones.getCardsInZone(
          "hand" as CoreZoneId,
          playerId as CorePlayerId,
        );
        // "Discard a gear" (ven-060-166) only counts cards of that type.
        const eligible = eligibleDiscardCards(hand, discardSpec);
        if (eligible.length < discardSpec.amount) {
          return false;
        }
        const discardId = context.params.discardId as string | undefined;
        if (discardId && !eligible.includes(discardId)) {
          return false;
        }
      }

      // rule-id: ogn-036-298 (rule 577.2 / 409) — a "Recycle N from your
      // trash" cost requires ≥N cards in the controller's trash; any named
      // `recycleIds` must all be in that trash.
      const recycleSpec = normalizeRecycleCost(cost.recycle);
      if (recycleSpec) {
        const trash = context.zones.getCardsInZone(
          "trash" as CoreZoneId,
          playerId as CorePlayerId,
        );
        const eligible = eligibleRecycleCards(trash, recycleSpec);
        if (eligible.length < recycleSpec.amount) {
          return false;
        }
        const recycleIds = context.params.recycleIds as string[] | undefined;
        if (
          recycleIds &&
          (recycleIds.length !== recycleSpec.amount ||
            !recycleIds.every((id) => eligible.includes(id)))
        ) {
          return false;
        }
      }

      // Rule 577.2: A [Kill] (sacrifice) cost requires a legal target on
      // the board matching the descriptor. Malzahar (ogn-113-298) is the
      // canonical case: exhaust + kill a friendly permanent → +2 rainbow.
      // rule 356: the host itself matches "a friendly permanent", so it is a
      // legal sacrifice for its OWN kill cost (ruling 0ac224d0569cbf56 —
      // Heimerdinger may kill himself to pay the ability he inherited). Only an
      // explicit `excludeSelf` ("another …") narrows it; a literal "Kill this"
      // (ogn-212-298 Forge of the Future) makes the host the only option.
      if (cost.kill) {
        const sacrificeId = context.params.sacrificeId as string | undefined;
        const options =
          cost.kill === "self"
            ? [cardId as string]
            : // rule 577.2: enumerate EVERY legal sacrifice (quantity "all"),
              // else the default single pick is silently the first candidate.
              resolveTarget({ ...(cost.kill as TargetDescriptor), quantity: "all" }, {
                cards: context.cards,
                choosing: true,
                draft: state,
                playerId,
                sourceCardId: cardId,
                sourceZone: zone,
                zones: context.zones,
              });
        if (options.length === 0) {
          return false;
        }
        if (sacrificeId && !options.includes(sacrificeId)) {
          return false;
        }
      }
    }

    // Rule 355.8 / 355.10.c: an activated ability whose effect names a
    // caster-chosen target cannot be put on the chain when no legal
    // choice exists (e.g. Unlicensed Armory with zero friendly units).
    if (
      !spellEffectHasLegalTargets(ability.effect as SpellEffectTargetShape | undefined, {
        cards: context.cards,
        draft: state,
        playerId,
        sourceCardId: cardId,
        sourceZone: zone,
        zones: context.zones,
      })
    ) {
      return false;
    }

    // rule 402.3 (unl-045-219) — "move a DIFFERENT unit you control": with a
    // single unit the mover and the exhaust-payer would have to be the same
    // card, so the ability has no legal activation at all.
    const differentUnitMovers = exhaustedAllyMoveTargets(ability.effect, {
      cards: context.cards,
      choosing: true,
      draft: state,
      playerId,
      sourceCardId: cardId,
      sourceZone: zone,
      zones: context.zones,
    });
    if (differentUnitMovers) {
      if (differentUnitMovers.length === 0) {
        return false;
      }
      const named = (context.params.targets as string[] | undefined)?.[0];
      if (named !== undefined && !differentUnitMovers.includes(named)) {
        return false;
      }
    }

    // rule-id: sfd-052-221 (rule 355.14.b) — a supplied play-time target
    // must be one of the legal candidates for the effect's chosen target.
    const boundTargets = context.params.targets as string[] | undefined;
    if (boundTargets && boundTargets.length > 0) {
      const chosen = activationChosenTarget(ability.effect);
      if (!chosen) {
        return false;
      }
      const options = resolveTarget(
        { ...chosen, quantity: "all" },
        {
          cards: context.cards,
          choosing: true,
          draft: state,
          playerId,
          sourceCardId: cardId,
          sourceZone: zone,
          zones: context.zones,
        },
      );
      // rule 355.5 (rule-id: ven-194-166) — "Ready 2 gear" names N distinct
      // objects (fewer only when the board holds fewer), each of them legal.
      const wanted = Math.min(chosenTargetCount(chosen), options.length);
      if (
        boundTargets.length !== wanted ||
        new Set(boundTargets).size !== boundTargets.length ||
        boundTargets.some((id) => !options.includes(id))
      ) {
        return false;
      }
      // rule 809.1.c (rule-id: sfd-120-221) — an opponent's Deflect object may
      // only be chosen when the extra Power is available on top of the cost.
      if (
        deflectSurchargeForActivation(state, playerId, boundTargets, context.cards, context.zones) >
        deflectBudget(state, playerId, ability.cost as Record<string, unknown> | undefined)
      ) {
        return false;
      }
    }

    return true;
  },
  enumerator: (state, context) => {
    if (state.status !== "playing") {
      return [];
    }
    const playerId = context.playerId as string;
    // rule 429.3 / 444.2.c: mid-payment, only the paying player's Reaction
    // [Add] abilities are offered (the per-entry filter below keeps them).
    const payXPrompt = isPaymentPromptFor(state.pendingChoice, playerId);
    if (state.pendingChoice && !payXPrompt) {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    const turnState = getTurnState(interaction);
    const results: {
      playerId: string;
      cardId: string;
      abilityIndex: number;
      sourceCardId?: string;
      sacrificeId?: string;
      discardId?: string;
      targets?: string[];
      xAmount?: number;
    }[] = [];

    // Collect cards on base, battlefields, legendZone, battlefieldRow, and championZone
    // rule 477.1.a: a unit under this player's control may sit in ANOTHER
    // player's base/battlefield zone bucket (control changed, ownership did
    // not), so scan every player's board zones and filter by controller below.
    const allPlayerIds = Object.keys(state.players ?? {});
    const baseCards: CoreCardId[] = [];
    for (const pid of allPlayerIds) {
      baseCards.push(...context.zones.getCardsInZone("base" as CoreZoneId, pid as CorePlayerId));
    }
    const bfCards: CoreCardId[] = [];
    for (const bfId of Object.keys(state.battlefields ?? {})) {
      const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
      for (const pid of allPlayerIds) {
        bfCards.push(...context.zones.getCardsInZone(bfZoneId, pid as CorePlayerId));
      }
    }
    const legendCards = context.zones.getCardsInZone(
      "legendZone" as CoreZoneId,
      playerId as CorePlayerId,
    );
    const battlefieldRowCards = context.zones.getCardsInZone(
      "battlefieldRow" as CoreZoneId,
      playerId as CorePlayerId,
    );
    const championZoneCards = context.zones.getCardsInZone(
      "championZone" as CoreZoneId,
      playerId as CorePlayerId,
    );

    // scanning every player's zone bucket can surface the same card twice
    // (zone stores that ignore the player argument), so dedupe.
    for (const cardId of [
      ...new Set([
        ...baseCards,
        ...bfCards,
        ...legendCards,
        ...battlefieldRowCards,
        ...championZoneCards,
      ]),
    ]) {
      const controller =
        (context.cards as { getCardController?: (id: CoreCardId) => string | undefined })
          .getCardController?.(cardId) ?? context.cards.getCardOwner(cardId);
      if (controller !== playerId) {
        continue;
      }

      const entries = collectActivatedAbilities(cardId as string, playerId, {
        battlefields: state.battlefields,
        cards: context.cards,
        zones: context.zones,
      });

      for (const entry of entries) {
        const { ability } = entry;

        // rule 605.2 / 429.3.a: mid-payment only resource-Adding abilities
        // (which resolve immediately, off the chain) may be used.
        if (payXPrompt) {
          if (!isImmediateAddEffect(ability.effect)) {
            continue;
          }
        }

        // Rule 728 / [Level N]: skip activated abilities whose while-level
        // condition is not yet met (e.g. Honeyfruit's Level-6 ability).
        const abilityCondition = (
          ability as { condition?: { type?: string; threshold?: number } }
        ).condition;
        if (abilityCondition?.type === "while-level") {
          if (!evaluateWhileLevel(state, playerId, abilityCondition.threshold ?? 0)) {
            continue;
          }
        }
        // rule 812.1.c (ogn-253-298): [Legion] gates the activation itself —
        // skip it until a card has been played this turn.
        if (abilityCondition?.type === "legion" && !evaluateLegionCondition(state, playerId)) {
          continue;
        }
        // rule 828.1.b.1 (rule-id: ven-194-166) — an "[Empowered][>] <ability>"
        // line is only on the card while the host is Empowered.
        if (
          requiresEmpowered(abilityCondition) &&
          (
            context.cards.getCardMeta(entry.hostCardId as CoreCardId) as
              | { empowered?: boolean }
              | undefined
          )?.empowered !== true
        ) {
          continue;
        }

        // Rule 580.3 (unl-160-219): "Use this ability only while I'm at a
        // battlefield" — skip when the host card is not at a battlefield.
        const abilityRestrictions = (ability as { restrictions?: readonly { type: string }[] })
          .restrictions;
        if (abilityRestrictions?.some((r) => r.type === "self-at-battlefield")) {
          const hostZone = context.zones.getCardZone(entry.hostCardId as CoreCardId) as
            | string
            | undefined;
          if (!hostZone?.startsWith("battlefield")) {
            continue;
          }
        }
        // rule 135.4.b (unl-213-219): text that exists only on the cards it is
        // granted to — the card printing it never activates it itself.
        if (
          abilityRestrictions?.some((r) => r.type === "granted-only") &&
          entry.sourceCardId === entry.hostCardId
        ) {
          continue;
        }
        // rule 377.2.b (sfd-090-221): "(Use only if unattached.)" — skip while
        // the Equipment is worn by a unit.
        if (
          abilityRestrictions?.some((r) => r.type === "unattached") &&
          (context.cards.getCardMeta?.(entry.hostCardId as CoreCardId) as
            | { attachedTo?: string }
            | undefined)?.attachedTo !== undefined
        ) {
          continue;
        }
        // rule 377.2.b: "Use only once per turn" — skip once used this turn.
        if (
          oncePerTurnExhausted(state, abilityRestrictions, entry.hostCardId as string, entry.abilityIndex)
        ) {
          continue;
        }
        // rule 377.2.b: "Use only if you've chosen an enemy unit this turn."
        if (chosenEnemyObjectsRestrictionUnmet(state, abilityRestrictions, playerId as string)) {
          continue;
        }
        if (chosenEnemyRestrictionUnmet(state, abilityRestrictions, playerId as string)) {
          continue;
        }
        // rule 377.2.b: "Use only if you've played an Equipment this turn."
        if (playedEquipmentRestrictionUnmet(state, abilityRestrictions, playerId as string)) {
          continue;
        }
        // Rule 827.1.c.1: [Empower] — skip when the host is already Empowered.
        {
          const hostMeta = context.cards.getCardMeta(entry.hostCardId as CoreCardId) as
            | { empowered?: boolean; empowerCount?: number }
            | undefined;
          if (empowerActivationBlocked(abilityRestrictions, hostMeta)) {
            continue;
          }
        }

        // Check timing
        const timing = abilityTimingClass(
          ability as { keyword?: string; timing?: string },
          entry.hostCardId as string,
        );
        if (!isLegalTiming(timing, turnState)) {
          continue;
        }
        // rule 429.3 / 429.3.a: mid-payment the paying player acts regardless
        // of Focus / turn ownership.
        if (!payXPrompt) {
          // rule 316.5.b: Neutral Open State → only the Turn Player activates.
          if (turnState === "neutral-open" && state.turn.activePlayer !== playerId) {
            continue;
          }
          // rule 312.2.c-d: Closed State → only the Priority holder may act.
          if (!hasChainPriorityPermission(interaction, playerId)) {
            continue;
          }
          // rule 313.1 / 347: Showdown Open State → only the Focus holder acts.
          if (turnState === "showdown-open" && !hasShowdownPermission(interaction, playerId)) {
            continue;
          }
        }

        // Check cost affordability
        const effectiveCost = effectiveAbilityCost(
          ability as { cost?: unknown; costModifier?: unknown; costOptions?: unknown },
          playerId as string,
          context.zones,
          state.runePools[playerId],
          readyRuneEnergy(
            context.zones,
            context.counters as { getFlag: (c: CoreCardId, f: string) => boolean | undefined },
            playerId,
          ),
          empowerCostDiscount(
            ability as { effect?: unknown },
            entry.hostCardId as string,
            playerId as string,
            context.zones,
            context.cards,
            state.battlefields,
          ),
          undefined,
          activationEnergyDiscount(
            entry.hostCardId as string,
            playerId as string,
            state,
            context.zones,
            context.cards,
          ),
          { battlefields: state.battlefields, cards: context.cards },
        );
        if (effectiveCost) {
          const cost = effectiveCost;
          const pool = state.runePools[playerId];
          if (!pool) {
            continue;
          }
          const energyCost = (cost.energy as number) ?? 0;
          // Rule 357.1.a: ready runes may be exhausted for energy during Pay
          // Costs, so count them toward affordability (parity with play* moves).
          const potentialEnergy = readyRuneEnergy(
            context.zones,
            context.counters as { getFlag: (c: CoreCardId, f: string) => boolean | undefined },
            playerId,
          );
          // rule 429.4 — Energy earmarked for another purpose cannot pay here.
          if (
            pool.energy -
              lockedAbilityEnergy(state, playerId as string, entry.hostCardId as string) +
              potentialEnergy <
            energyCost
          ) {
            continue;
          }
          const powerCost = cost.power as string[] | undefined;
          if (powerCost) {
            const needed: Record<string, number> = {};
            for (const d of powerCost) {
              needed[d] = (needed[d] ?? 0) + 1;
            }
            // rule 429.4 — Power earmarked for another purpose cannot pay here.
            if (
              !canAffordPower(
                spendableAbilityPower(state, playerId as string, entry.hostCardId as string),
                needed,
              )
            ) {
              continue;
            }
          }

          // Rules 729-730: XP is a player resource, not a per-card counter.
          const xpCost = cost.xp as number | undefined;
          if (xpCost && xpCost > 0) {
            const have = state.players[playerId]?.xp ?? 0;
            if (have < xpCost) {
              continue;
            }
          }

          // Rule 577.2: An [Exhaust] cost cannot be paid if the host card
          // Is already exhausted. `entry.hostCardId` is the card that
          // Would pay the exhaust (the unit holding the ability).
          if (cost.exhaust) {
            // rule 136.2.c/d: a copied (Svellsongur) ability exhausts the WEARER.
            const hostCardId = exhaustPayerCardId(
              entry.hostCardId as string,
              entry.sourceCardId,
              (m) => context.cards.getCardMeta(m),
            ) as CoreCardId;
            const {getFlag} = (
              context.counters as { getFlag?: (c: CoreCardId, f: string) => boolean }
            );
            if (getFlag && getFlag(hostCardId, "exhausted")) {
              continue;
            }
            const hostMeta = context.cards.getCardMeta(hostCardId) as
              | { exhausted?: boolean }
              | undefined;
            if (hostMeta?.exhausted === true) {
              continue;
            }
          }

          // rule 702.2.b.1 (ogn-164-298 Sett): "Spend my buff" needs a buff
          // on the host to pay with.
          if (cost.spend === "buff") {
            const hostMeta = context.cards.getCardMeta(entry.hostCardId as CoreCardId) as
              | { buffed?: boolean }
              | undefined;
            if (hostMeta?.buffed !== true) {
              continue;
            }
          }

          // rule 827.1.d (ven-087-166 Hextech Disc): a "Disempower this" cost
          // can only be paid by a host that is currently [Empowered].
          if (cost.disempower === "self") {
            const hostMeta = context.cards.getCardMeta(entry.hostCardId as CoreCardId) as
              | { empowered?: boolean }
              | undefined;
            if (hostMeta?.empowered !== true) {
              continue;
            }
          }
        }

        // Rule 357.2 / 422.3: a "Discard N" cost enumerates one activation
        // per hand card so the caller can pick which card to discard. Fewer
        // than N cards in hand → the ability is not activatable.
        let discardOptions: string[] | undefined;
        const discardSpec = normalizeDiscardCost(
          (ability.cost as Record<string, unknown> | undefined)?.discard,
        );
        if (discardSpec) {
          const hand = context.zones.getCardsInZone(
            "hand" as CoreZoneId,
            playerId as CorePlayerId,
          );
          const eligible = eligibleDiscardCards(hand, discardSpec);
          if (eligible.length < discardSpec.amount) {
            continue;
          }
          discardOptions = eligible;
        }

        // rule-id: ogn-036-298 (rule 577.2) — a "Recycle N from your trash"
        // cost is unpayable with fewer than N cards in trash.
        // rule 416.5 (ogn-099-298 Garbage Grabber) — when the trash holds more
        // than N eligible cards, ITS CONTROLLER chooses which N pay the cost,
        // so enumerate one activation per legal N-subset instead of silently
        // recycling the oldest N.
        let recycleOptions: string[][] | undefined;
        const recycleSpec = normalizeRecycleCost(
          (ability.cost as Record<string, unknown> | undefined)?.recycle,
        );
        if (recycleSpec) {
          const trash = context.zones.getCardsInZone(
            "trash" as CoreZoneId,
            playerId as CorePlayerId,
          );
          const eligible = eligibleRecycleCards(trash, recycleSpec);
          if (eligible.length < recycleSpec.amount) {
            continue;
          }
          if (eligible.length > recycleSpec.amount) {
            recycleOptions = recycleSubsets(eligible, recycleSpec.amount);
          }
        }

        // Rule 577.2: A [Kill] (sacrifice) cost enumerates one activation
        // per legal sacrifice target so the caller can pick which permanent
        // to trash. No legal target → the ability is not activatable.
        let sacrificeOptions: string[] | undefined;
        const killCost = (ability.cost as Record<string, unknown> | undefined)?.kill;
        if (killCost === "self") {
          // Rule 577.2 (ogn-212-298): "Kill this" — the host sacrifices itself.
          sacrificeOptions = [entry.hostCardId];
        } else if (killCost) {
          const hostZone = context.zones.getCardZone(entry.hostCardId as CoreCardId) as
            | string
            | undefined;
          // rule 577.2: list every legal sacrifice, not the default single pick.
          // rule 356 / ruling 0ac224d0569cbf56: the host matches its own
          // "friendly permanent" descriptor, so it stays in the list unless the
          // descriptor says "another" (`excludeSelf`, applied by resolveTarget).
          sacrificeOptions = resolveTarget({ ...(killCost as TargetDescriptor), quantity: "all" }, {
            cards: context.cards,
            choosing: true,
            draft: state,
            playerId,
            sourceCardId: entry.hostCardId,
            sourceZone: hostZone,
            zones: context.zones,
          });
          if (sacrificeOptions.length === 0) {
            continue;
          }
        }

        // Rule 355.8 / 355.10.c: skip abilities whose caster-chosen effect
        // target has no legal choices on the current board.
        const hostZone = context.zones.getCardZone(entry.hostCardId as CoreCardId) as
          | string
          | undefined;
        if (
          !spellEffectHasLegalTargets(ability.effect as SpellEffectTargetShape | undefined, {
            cards: context.cards,
            draft: state,
            playerId,
            sourceCardId: entry.hostCardId,
            sourceZone: hostZone,
            zones: context.zones,
          })
        ) {
          continue;
        }

        // rule 402.3 (unl-045-219) — only units that leave some OTHER ready
        // unit free to pay the exhaust cost are movable.
        const exhaustAllyMovers = exhaustedAllyMoveTargets(ability.effect, {
          cards: context.cards,
          choosing: true,
          draft: state,
          playerId,
          sourceCardId: entry.hostCardId,
          sourceZone: hostZone,
          zones: context.zones,
        });
        if (exhaustAllyMovers && exhaustAllyMovers.length === 0) {
          continue;
        }

        // rule-id: sfd-052-221 (rule 355.10.f / 355.14.b) — enumerate one
        // activation per legal caster-chosen target so the choice is locked
        // when the ability is finalized on the chain, not at resolution.
        let targetOptions: string[] | undefined;
        const chosen = activationChosenTarget(ability.effect);
        if (chosen) {
          targetOptions = resolveTarget(
            { ...chosen, quantity: "all" },
            {
              cards: context.cards,
              choosing: true,
              draft: state,
              playerId,
              sourceCardId: entry.hostCardId,
              sourceZone: hostZone,
              zones: context.zones,
            },
          );
          if (exhaustAllyMovers) {
            targetOptions = targetOptions.filter((id) => exhaustAllyMovers.includes(id));
          }
          // rule 809.1.c (rule-id: sfd-120-221) — a Deflect object the chooser
          // cannot pay the surcharge for is not a legal choice.
          const budget = deflectBudget(
            state,
            playerId,
            ability.cost as Record<string, unknown> | undefined,
          );
          targetOptions = targetOptions.filter(
            (id) =>
              deflectSurchargeForActivation(
                state,
                playerId,
                [id as string],
                context.cards,
                context.zones,
              ) <= budget,
          );
          if (targetOptions.length === 0) {
            continue;
          }
        }

        const result: {
          playerId: string;
          cardId: string;
          abilityIndex: number;
          sourceCardId?: string;
          sacrificeId?: string;
          discardId?: string;
          targets?: string[];
          recycleIds?: string[];
          costOptionIndex?: number;
          xAmount?: number;
        } = {
          abilityIndex: entry.abilityIndex,
          cardId: entry.hostCardId,
          playerId,
        };
        if (entry.sourceCardId !== entry.hostCardId) {
          result.sourceCardId = entry.sourceCardId;
        }
        let bases: (typeof result)[] = sacrificeOptions
          ? sacrificeOptions.map((sacrificeId) => ({ ...result, sacrificeId }))
          : [result];
        if (targetOptions) {
          const withTargets: (typeof result)[] = [];
          // rule 355.5 (rule-id: ven-194-166) — "Ready 2 gear" names N objects
          // in one activation: enumerate every N-sized selection (as many as
          // exist when the board holds fewer than N).
          const wanted = chosenTargetCount(chosen);
          for (const base of bases) {
            const eligible = targetOptions.filter((id) => id !== base.sacrificeId);
            const size = Math.min(wanted, eligible.length);
            if (size <= 0) {
              continue;
            }
            for (const combo of recycleSubsets(eligible, size)) {
              withTargets.push({ ...base, targets: combo });
            }
          }
          bases = withTargets;
        }
        // rule 416.5 — one variant per legal N-card recycle selection.
        if (recycleOptions) {
          bases = bases.flatMap((base) =>
            (recycleOptions as string[][]).map((recycleIds) => ({ ...base, recycleIds })),
          );
        }
        // rule 827.1.c.2 / 357.2 (rule-id: ven-074-166) — "Pay either cost":
        // when more than one of the printed complete costs is affordable the
        // controller picks, so enumerate one activation per affordable option.
        const costOptionIndices = affordableCostOptionIndices(
          ability as { costOptions?: unknown },
          state.runePools[playerId],
          empowerCostDiscount(
            ability as { effect?: unknown },
            entry.hostCardId as string,
            playerId as string,
            context.zones,
            context.cards,
            state.battlefields,
          ),
        );
        if (costOptionIndices) {
          bases = bases.flatMap((base) =>
            costOptionIndices.map((costOptionIndex) => ({ ...base, costOptionIndex })),
          );
        }
        // rule 444.2 / 135.2.e.5.a (rule-id: sfd-117-221) — "Pay any amount of
        // Energy/[rainbow] to [Add] that much": X is the controller's choice at
        // activation, so offer one activation per legal amount. Without these
        // variants the only reachable activation is the silent X = 0.
        const xSpec = (effectiveCost as { x?: { resource?: string } } | undefined)?.x;
        if (xSpec) {
          const pool = state.runePools[playerId];
          const alreadySpent =
            xSpec.resource === "energy"
              ? ((effectiveCost?.energy as number) ?? 0)
              : ((effectiveCost?.power as string[] | undefined)?.length ?? 0);
          const available =
            xSpec.resource === "energy"
              ? (pool?.energy ?? 0) +
                readyRuneEnergy(
                  context.zones,
                  context.counters as {
                    getFlag: (c: CoreCardId, f: string) => boolean | undefined;
                  },
                  playerId,
                )
              : // rule 429.4 — pips earmarked for another purpose fund no X here.
                Object.values(
                  spendableAbilityPower(state, playerId as string, entry.hostCardId as string),
                ).reduce<number>((a, b) => a + (b ?? 0), 0);
          const maxX = Math.max(0, Math.min(available - alreadySpent, MAX_X_VARIANTS));
          bases = bases.flatMap((base) =>
            Array.from({ length: maxX + 1 }, (_, xAmount) => ({ ...base, xAmount })),
          );
        }
        if (discardOptions) {
          for (const base of bases) {
            for (const discardId of discardOptions) {
              results.push({ ...base, discardId });
            }
          }
        } else {
          results.push(...bases);
        }
      }
    }
    return results.map((r) => withAbilityCosts(r));
  },
  reducer: (draft, rawContext) => {
    const context = rawContext.params.costs
      ? { ...rawContext, params: expandAbilityCosts(rawContext.params) }
      : rawContext;
    const { playerId, cardId, abilityIndex, sourceCardId, sacrificeId, discardId } =
      context.params;

    const registry = getGlobalCardRegistry();
    // For inherited/copied abilities, look up the ability text from the
    // Source card, but pay the cost on the host card (`cardId`).
    const abilityLookupId = (sourceCardId as string | undefined) ?? cardId;
    const abilities = registry.getAbilities(abilityLookupId) ?? [];
    const ability = abilities[abilityIndex];
    if (!ability) {
      return;
    }

    // rule 377.2.b: record the use of a once-per-turn ability against the HOST
    // card before anything else — the allowance is spent on activation.
    const useRestrictions = (ability as { restrictions?: readonly { type: string }[] }).restrictions;
    if (useRestrictions?.some((r) => r.type === "once-per-turn")) {
      const counts = (draft as { turnEventCounts?: Record<string, number> });
      counts.turnEventCounts ??= {};
      const key = abilityUseKey(cardId as string, abilityIndex as number);
      counts.turnEventCounts[key] = (counts.turnEventCounts[key] ?? 0) + 1;
    }

    const xPay = abilityXPayment(
      ability.cost as Record<string, unknown> | undefined,
      context.params as Record<string, unknown>,
    );

    // rule 809.1.c / 809.1.c.1 (rule-id: sfd-120-221) — the Deflect surcharge
    // for choosing an opponent's Deflect object is a mandatory additional cost,
    // payable with Power of any Domain, and is owed even by a free ability.
    const deflectOwed = deflectSurchargeForActivation(
      draft,
      playerId,
      context.params.targets as string[] | undefined,
      context.cards,
      context.zones,
    );
    // rule 403 / 404.1 — the surcharge belongs to the same one-shot payment as
    // the ability's own cost, but it is Power of ANY Domain while the printed
    // pips name one: settle the named pips FIRST so the flexible pip can never
    // consume the Power a named pip still needs (pool {fury:1, calm:1} paying
    // [fury] + Deflect must end at zero, not leave the calm behind).
    const payDeflectSurchargeNow = (): void => {
      if (deflectOwed <= 0) {
        return;
      }
      deductAbilityCost(
        draft,
        playerId,
        { power: Array.from({ length: deflectOwed }, () => "rainbow") },
        context.zones,
        context.counters,
      );
    };

    // Pay cost
    const costToPay = effectiveAbilityCost(
      ability as { cost?: unknown; costModifier?: unknown; costOptions?: unknown },
      playerId as string,
      context.zones,
      draft.runePools[playerId],
      readyRuneEnergy(
        context.zones,
        context.counters as { getFlag: (c: CoreCardId, f: string) => boolean | undefined },
        playerId,
      ),
      empowerCostDiscount(
        ability as { effect?: unknown },
        cardId as string,
        playerId as string,
        context.zones,
        context.cards,
        draft.battlefields,
      ),
      (context.params as Record<string, unknown>).costOptionIndex as number | undefined,
      activationEnergyDiscount(
        cardId as string,
        playerId as string,
        draft,
        context.zones,
        context.cards,
      ),
      { battlefields: draft.battlefields, cards: context.cards },
    );
    // rule 356.4 (rule-id: ven-161-166) — even a costless activation is "the
    // first friendly gear activated ability played this turn".
    noteGearAbilityActivation(draft, playerId as string, cardId as string);
    if (!costToPay) {
      payDeflectSurchargeNow();
    }
    if (costToPay) {
      const cost = costToPay;
      deductAbilityCost(
        draft,
        playerId,
        cost,
        context.zones,
        context.counters,
        cardId as string,
      );
      payDeflectSurchargeNow();

      // rule 135.2.e.5.a: the chosen X leaves the pool as part of paying the
      // cost — [rainbow] out of Power of any Domain, otherwise out of Energy.
      if (xPay && xPay.amount > 0) {
        deductAbilityCost(
          draft,
          playerId,
          xPay.resource === "energy"
            ? { energy: xPay.amount }
            : { power: Array.from({ length: xPay.amount }, () => "rainbow") },
          context.zones,
          context.counters,
        );
      }

      // Handle exhaust cost — always exhaust the host card, never the
      // Source (Heimerdinger exhausts himself for an inherited ability).
      if (cost.exhaust) {
        // rule 136.2.c/d: a copied (Svellsongur) ability exhausts the WEARER.
        context.counters.setFlag(
          exhaustPayerCardId(cardId as string, sourceCardId as string | undefined, (m) =>
            context.cards.getCardMeta(m),
          ) as CoreCardId,
          "exhausted",
          true,
        );
      }

      // rule 702.2.b (ogn-164-298 Sett): spending a buff removes it; Might
      // readers look at top-level meta.buffed, so mirror the flag there.
      if (cost.spend === "buff") {
        context.counters.setFlag(cardId as CoreCardId, "buffed", false);
        context.cards.updateCardMeta(
          cardId as CoreCardId,
          { buffed: false } as Partial<RiftboundCardMeta>,
        );
        // rule 702.2.b: paying a "Spend my buff:" cost is a spend like any
        // other — "When you spend a buff" fires here too, not only on the
        // play-time additional-cost paths.
        fireTriggers(
          {
            cardId: cardId as string,
            playerId: playerId as string,
            spentFrom: cardId as string,
            type: "spend-buff",
          },
          { cards: context.cards, counters: context.counters, draft, zones: context.zones },
        );
      }

      // rule 827.1.d (ven-087-166 Hextech Disc): paying "Disempower this"
      // removes the host's [Empowered] state, re-enabling its [Empower] cost.
      if (cost.disempower === "self") {
        context.cards.updateCardMeta(
          cardId as CoreCardId,
          { empowered: false } as unknown as Partial<RiftboundCardMeta>,
        );
      }

      // rule 730.2: "Spend N XP" reduces the controlling player's XP — already
      // charged by the `deductAbilityCost(cost)` call above; charging it again
      // here would spend the XP twice.

      // Rule 357.2 / 422.3: pay the "Discard N" cost — the chosen hand
      // card is trashed before the ability is placed on the chain.
      if (cost.discard) {
        if (!discardId) {
          return;
        }
        // rule 422 / ogn-006-298: a discard paid as a cost is still a discard —
        // one choke point moves it and emits the `discard` event.
        const costCtx = buildEffectContext(draft, playerId, cardId, context);
        removeFromBoard(
          costCtx,
          [discardId as string],
          "trash",
          { by: playerId, kind: "discard", source: cardId as string, sourceKind: "ability" },
          costCtx.fireTriggers,
        );
      }

      // rule-id: ogn-036-298 (rule 577.2 / 409) — pay the "Recycle N from
      // your trash" cost: move N trash cards (caller-named via `recycleIds`,
      // else the top N) to the bottom of the main deck before chaining.
      const recycleSpec = normalizeRecycleCost(cost.recycle);
      if (recycleSpec) {
        const trash = context.zones.getCardsInZone(
          "trash" as CoreZoneId,
          playerId as CorePlayerId,
        );
        const eligible = eligibleRecycleCards(trash, recycleSpec);
        if (eligible.length < recycleSpec.amount) {
          return;
        }
        const named = context.params.recycleIds as string[] | undefined;
        const toRecycle =
          named && named.length === recycleSpec.amount
            ? named
            : (eligible.slice(0, recycleSpec.amount) as readonly string[]);
        // rule 416.5: cards recycled simultaneously go to the bottom in a
        // RANDOM order — the payer must not be able to stack the deck bottom
        // by choosing (or by relying on) the trash order.
        const ordered = [...toRecycle];
        for (let i = ordered.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const a = ordered[i] as string;
          const b = ordered[j] as string;
          ordered[i] = b;
          ordered[j] = a;
        }
        for (const id of ordered) {
          context.zones.moveCard({
            cardId: id as CoreCardId,
            position: "bottom",
            targetZoneId: "mainDeck" as CoreZoneId,
          });
        }
        // rule-id: ogn-235-298 — recycling to your Main Deck as a cost still
        // triggers "When you recycle one or more cards to your Main Deck".
        if (toRecycle.length > 0) {
          fireTriggers(
            { cardIds: [...toRecycle] as string[], playerId: playerId as string, type: "recycle" },
            { cards: context.cards, counters: context.counters, draft, zones: context.zones },
          );
        }
      }

      // rule 202-203 / 356 (sfd-090-221 "Banish this") — a banish paid as a
      // COST leaves the board while the ability is being activated, before
      // anyone can respond, and it stays banished after resolution.
      if (cost.banish) {
        const banishId = cost.banish === "self" ? (cardId as string) : undefined;
        if (!banishId) {
          return;
        }
        const banishCtx = buildEffectContext(draft, playerId, cardId, context);
        removeFromBoard(
          banishCtx,
          [banishId],
          "banishment",
          { by: playerId, kind: "banish", source: cardId as string, sourceKind: "ability" },
          banishCtx.fireTriggers,
        );
      }

      // Handle kill (sacrifice) cost — the chosen permanent is trashed as
      // part of paying the cost, before the effect resolves.
      if (cost.kill) {
        // Rule 577.2 (ogn-212-298): "Kill this" defaults to the host card.
        const killId = (sacrificeId as string | undefined) ?? (cost.kill === "self" ? cardId : undefined);
        if (!killId) {
          return;
        }
        // rule 428.1.a.1 — a kill paid as a cost is an Active Kill like any
        // other: die replacements may apply (357.2.a: still paid), Equipment
        // detaches (457.1), the card resets (124.1), a token ceases to exist
        // (186.1) and `die` fires with last-known information (Deathknell).
        const costCtx = buildEffectContext(draft, playerId, cardId, context);
        removeFromBoard(
          costCtx,
          [killId as string],
          "trash",
          { by: playerId, kind: "cost", source: cardId as string, sourceKind: "ability" },
          costCtx.fireTriggers,
        );
      }
    }

    // Rule 605.2: activated abilities that Add resources resolve immediately
    // and cannot be reacted to — do not open a chain for them.
    if (isImmediateAddEffect(ability.effect)) {
      const base = buildEffectContext(draft, playerId, cardId, context);
      // rule 429.1: "[Add] that much" reads the X that was just paid.
      const effectCtx = xPay ? { ...base, variables: { ...base.variables, x: xPay.amount } } : base;
      executeEffect(ability.effect as ExecutableEffect, effectCtx);
      // rule-id: sfd-075-221 — rule 429.2: an [Add] ability resolving
      // immediately is still an activated ability being USED, so "when you use
      // an activated ability of a gear" still sees it.
      fireTriggers(
        {
          cardId: cardId as string,
          // rule 206.1 (rule-id: ven-192-166) — the ability's own printed cost.
          energyCost: Number((ability.cost as { energy?: unknown } | undefined)?.energy ?? 0),
          playerId: playerId as string,
          sourceType: activationSourceType(cardId as string),
          type: "use-activated-ability",
        },
        { cards: context.cards, counters: context.counters, draft, zones: context.zones },
      );
      return;
    }

    // Add ability to chain. The chain item's `cardId` is the host so that
    // Effect execution's `sourceCardId` (used for self-targeting and
    // Location-relative targets) resolves to the host.
    const interaction = draft.interaction ?? createInteractionState();
    const turnOrder = Object.keys(draft.players);
    // rule-id: sfd-052-221 (rule 355.10.f / 355.14.b) — lock the caster-chosen
    // target on the chain item at finalization so resolution uses it instead
    // of prompting.
    const targets = context.params.targets as string[] | undefined;
    // rule 404.1 / 414.4 (unl-045-219) — "Exhaust a unit you control" is a cost:
    // exhaust the payer NOW, before anyone gets priority (406.4), and pin it on
    // the chain item so resolution neither re-picks nor re-pays it.
    const costPayerId = exhaustedAllyForcedPayer(ability.effect, targets?.[0], {
      cards: context.cards,
      choosing: true,
      draft,
      playerId,
      sourceCardId: cardId,
      sourceZone: context.zones.getCardZone(cardId as CoreCardId),
      zones: context.zones,
    } as unknown as Parameters<typeof resolveTarget>[1]);
    if (costPayerId !== undefined) {
      context.counters.setFlag(costPayerId as CoreCardId, "exhausted", true);
    }
    draft.interaction = addToChain(
      interaction,
      {
        cardId,
        controller: playerId,
        // rule 429.1: carry the paid X to resolution for `{variable:"x"}`.
        effect:
          xPay || costPayerId !== undefined
            ? {
                ...(ability.effect as object),
                ...(xPay ? { _variables: { x: xPay.amount } } : {}),
                ...(costPayerId !== undefined ? { _payerId: costPayerId } : {}),
              }
            : ability.effect,
        ...(targets && targets.length > 0 ? { targets } : {}),
        // rule 402.2 / 355.13 / 355.14.b — an activation naming a VARIABLE-count
        // set ("up to two units", "split among any number of …") finishes its
        // choices in the finalization dialog (`trigger-finalization.ts` Step
        // 2b) before anyone receives Priority, exactly like a triggered ability.
        ...(collectMultiPickSlots(ability.effect).length > 0 ? { status: "pending" as const } : {}),
        type: "ability",
      },
      turnOrder,
    );
    // rule-id: sfd-075-221 — rule 206.1: "when you use an activated ability"
    // fires as the ability is activated. Firing it AFTER `addToChain` puts the
    // trigger above the ability on the chain, so it resolves first.
    fireTriggers(
      {
        cardId: cardId as string,
        // rule 206.1 (rule-id: ven-192-166) — the ability's own printed cost.
        energyCost: Number((ability.cost as { energy?: unknown } | undefined)?.energy ?? 0),
        playerId: playerId as string,
        sourceType: activationSourceType(cardId as string),
        type: "use-activated-ability",
      },
      { cards: context.cards, counters: context.counters, draft, zones: context.zones },
    );
    // Rule 359.2: "when you choose me" triggers fire when the target is
    // chosen — at finalization for play-time targets (parity with playSpell).
    if (targets && targets.length > 0) {
      const trigCtx = { cards: context.cards, counters: context.counters, draft, zones: context.zones };
      for (const targetId of targets) {
        fireTriggers(
          {
            cardId: targetId,
            chooserId: playerId,
            // rule-id: sfd-199-221 — the ability's host card.
            sourceCardId: cardId as string,
            sourceType: "ability",
            type: "choose",
          },
          trigCtx,
        );
      }
    }
    // rule 377 / 355.3 / 402.2 (ogn-157-298 Udyr) — an activated ability follows
    // the play process: its mode AND that mode's target are chosen during
    // finalization, before anyone gets priority, and ride on the chain item.
    if (!draft.pendingChoice) {
      const item = [...(draft.interaction?.chain?.items ?? [])]
        .reverse()
        .find((it) => it?.cardId === cardId && it?.type === "ability" && it?.triggered !== true);
      if (item?.id !== undefined) {
        raisePlayTimeModeChoice(
          draft,
          item.id as string,
          item.effect,
          playerId as string,
          cardId as string,
          buildEffectContext(draft, playerId, cardId, context) as unknown as Parameters<
            typeof raisePlayTimeModeChoice
          >[5],
        );
      }
    }

    // rule 824.1.d: a Dependent ability becomes inactive "as soon as" its
    // condition stops holding — paying an XP/buff/exhaust cost can flip one off
    // while the ability is still on the chain, so re-evaluate statics now
    // rather than waiting for resolution.
    recalculateStaticEffects({
      cards: context.cards,
      draft,
      zones: context.zones,
    } as unknown as Parameters<typeof recalculateStaticEffects>[0]);
  },
};
