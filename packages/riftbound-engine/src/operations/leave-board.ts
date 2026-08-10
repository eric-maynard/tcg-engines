/**
 * Leave-board choke point + last-known information (LKI).
 *
 * Every path that takes a permanent off the board (kill instruction, lethal
 * damage found by a cleanup pass, the Beginning-Phase [Temporary] kill, kill /
 * discard costs, banish, recycle, bounce) runs through {@link leaveBoard}:
 *
 *   1. snapshot LKI into `draft.lki[cardId]` (rule 428.1.a.1.b / 740.2.a) —
 *      zone, controller, Might, buffs, attachments, the other units there;
 *   2. kill-family causes consult the die replacements (rules 370–373) through
 *      the existing replacement machinery — a replaced death never happens;
 *   3. attachments detach (rule 457.1 / 719.5);
 *   4. the card moves and becomes a NEW object: {@link resetObjectState}
 *      clears every temporary modification (rule 124.1);
 *   5. tokens cease to exist once their events fired (rule 186.1);
 *   6. {@link emitLeaveEvents} publishes ONE `die` (unit / gear killed),
 *      `discard`, or `leave-board` event per card, carrying the LKI payload,
 *      with the whole batch visible to the trigger runner so a doubler dying
 *      alongside another still doubles (rule 383.3.d) and "died alone/here"
 *      read the pre-event board.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { isDieReplacementRunning, runDieBatch } from "../abilities/die-replacement-batch";
import type { EffectContext } from "../abilities/effect-executor";
import type { GameEvent } from "../abilities/game-events";
import { type ChainItem, collapseTriggerBatch } from "../chain";
import * as replacementEffects from "../abilities/replacement-effects";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";
import type { DelayedTrigger } from "../types/game-state";
import { getGlobalCardRegistry } from "./card-lookup";
import { clearDamage, getDamage } from "./damage-store";
import { recordPublicReveal } from "./public-reveal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeaveDestination = "trash" | "banishment" | "hand" | "deck-top" | "deck-bottom";

export type LeaveCauseKind =
  | "kill"
  | "sba"
  | "temporary"
  | "cost"
  | "discard"
  | "banish"
  | "recycle"
  | "bounce"
  | "replaced";

export interface LeaveCause {
  readonly kind: LeaveCauseKind;
  /** rule 428.5: the player responsible (kill instruction's controller / lethal damage dealer / discarder). */
  readonly by?: string;
  /** Card whose text caused it. */
  readonly source?: string;
  readonly sourceKind?: "spell" | "ability" | "combat";
}

/** rule 428.1.a.1.b — what the object looked like immediately before it left. */
export interface LKISnapshot {
  readonly cardId: string;
  readonly zone: string | undefined;
  readonly owner: string;
  readonly controller: string;
  readonly cardType: string | undefined;
  readonly isToken: boolean;
  readonly might: number;
  readonly damage: number;
  readonly buffed: boolean;
  readonly stunned: boolean;
  readonly exhausted: boolean;
  /** rule 827 — Empowered as it left; `resetObjectState` wipes the flag. */
  readonly empowered: boolean;
  /** Equipment attached to it (rule 457.1). */
  readonly attachments: readonly string[];
  /** The unit it was attached to, when the leaving card is itself an Equipment. */
  readonly attachedTo?: string;
  /** Other units at the same location, with their controllers (rule 740.2.a). */
  readonly unitsHere: readonly { readonly id: string; readonly controller: string }[];
  /** rule 740.2.a: no other friendly unit shared its location. */
  readonly wasAlone: boolean;
  /**
   * rule 708/710 + 807.1.d.1 — effective Might ≥ 5 as it left, including the
   * combat-only bonus (Assault while attacking / Shield while defending),
   * which is still in place when a combat death happens.
   */
  readonly wasMighty: boolean;
  readonly lastDamagedBy?: string;
  readonly lastDamageSource?: "spell" | "ability" | "combat";
  /** rule 383.3.d: this card carried a "your [X] effects trigger an additional time" static. */
  readonly triggerDoubler: boolean;
  /**
   * rule 390.2 — delayed abilities installed on it ("When it dies this turn,
   * …"). `resetObjectState` clears them from meta, so they only survive here.
   */
  readonly delayedTriggers?: readonly DelayedTrigger[];
  /**
   * rule 477.1.b / 428.1.a.1.b — the instance this card was copying as it left
   * the board (Shady Spectacles). Detaching wipes the copy from the registry
   * before the `die` event is published, so the borrowed rules text (e.g. a
   * copied [Deathknell]) only survives here.
   */
  readonly copyOfCardId?: string;
}

export interface LeaveResult {
  readonly cardId: string;
  /** False when a replacement kept the card on the board (or it was not there). */
  readonly left: boolean;
  readonly to?: LeaveDestination;
  readonly cause: LeaveCause;
  readonly lki: LKISnapshot;
  /** Source of the replacement that applied instead, if any. */
  readonly replacedBy?: string;
  /**
   * rule 427.2.a / 808.1.d.1 — a blanket "goes to your trash → banish it
   * instead" (ven-022-166) rerouted this departure, so the card was never
   * "killed and sent to the trash": no `die` event is published for it.
   */
  readonly trashReplaced?: boolean;
  /** rule 186.1: a token whose removal waits for its events to fire. */
  tokenPending?: boolean;
}

/**
 * Structural slice of the engine operation bags. Cleanup, effect, move and
 * flow contexts are all supersets (methods so optional/param variance is lax).
 */
export interface LeaveBoardContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    moveCard(params: { cardId: CoreCardId; targetZoneId: CoreZoneId; position?: "top" | "bottom" | number }): void;
    getCardsInZone?(zoneId: CoreZoneId, playerId?: CorePlayerId): CoreCardId[];
    getCardZone?(cardId: CoreCardId): string | undefined;
    removeCardFromGame?(params: { cardId: CoreCardId }): void;
    drawCards?(params: unknown): unknown;
  };
  readonly cards: {
    getCardMeta?(cardId: CoreCardId): object | undefined;
    getCardOwner?(cardId: CoreCardId): string | undefined;
    getCardController?(cardId: CoreCardId): string | undefined;
    setCardController?(cardId: CoreCardId, controllerId: CorePlayerId): void;
    updateCardMeta?(cardId: CoreCardId, meta: Record<string, unknown>): void;
  };
  readonly counters?: {
    setFlag?(cardId: CoreCardId, flag: string, value: boolean): void;
    addCounter?(cardId: CoreCardId, counter: string, amount: number): void;
    removeCounter?(cardId: CoreCardId, counter: string, amount: number): void;
    clearCounter?(cardId: CoreCardId, counter: string): void;
    clearAllCounters?(cardId: CoreCardId): void;
  };
}

export interface LeaveOptions {
  /**
   * Kill-family causes consult board `die` replacements unless the caller has
   * already done so (the SBA pass matches/prompts them itself — rule 372).
   */
  readonly replacements?: "apply" | "skip";
  /**
   * rule 370.1.a.2 — a snapshot taken before ANY card of a simultaneous batch
   * moved (see {@link snapshotBatch}); defaults to snapshotting now.
   */
  readonly lki?: LKISnapshot;
}

interface LkiDraft {
  /** rule 428.1.a.1.b — last-known information for cards leaving the board in the current batch. */
  lki?: Record<string, LKISnapshot>;
  /** Cards whose leave events are being published right now (rule 370.1.a.2 simultaneity). */
  leavingBatch?: string[];
  /** rule 183 — owners of cards that have ceased to exist (tokens) or left the game. */
  departedOwners?: Record<string, string>;
  /**
   * rule 359.3.e.2 / 359.3.e.4 — per chain item id, the targets it chose that
   * have since left the board and are therefore NEW objects (even if they came
   * back to the very spot they were chosen at).
   */
  newObjectTargets?: Record<string, string[]>;
}

/**
 * rule 124.1 / 359.3.e.2 / 359.3.e.4 — a card leaving the board for a non-board
 * zone becomes a NEW object, so it is no longer the object any chain item
 * already chose. Record it against every item currently holding it as a target;
 * returning to the board (even to the same battlefield) does not restore that
 * identity, unlike a mere on-board move-and-return (359.3.e.3).
 */
function markNewObjectForChainTargets(draft: RiftboundGameState, cardId: string): void {
  const items = draft.interaction?.chain?.items ?? [];
  if (items.length === 0) {
    return;
  }
  const d = draft as RiftboundGameState & LkiDraft;
  const store = (d.newObjectTargets ??= {});
  for (const item of items) {
    if (item.targets?.includes(cardId) !== true) {
      continue;
    }
    const list = (store[item.id] ??= []);
    if (!list.includes(cardId)) {
      list.push(cardId);
    }
  }
}

/**
 * rule 355.9.a.1 (rule-id: ogn-248-298) — a parked `choose-target` prompt lists
 * the candidates that were legal when it was raised. A unit that leaves the
 * board before the prompt is answered is no longer a legal choice, so drop it
 * from the parked options instead of offering (and accepting) a trashed unit —
 * Icathian Rain's later "Deal 2 to a unit" must not aim at what its first
 * instance already killed. Prompts that deliberately look off-board (a
 * descriptor naming a `location`) keep their own candidates.
 */
function dropFromPendingUnitChoice(draft: RiftboundGameState, cardId: string): void {
  const pc = draft.pendingChoice as
    | { type?: string; options?: unknown; effect?: { target?: unknown } }
    | undefined;
  if (pc?.type !== "choose-target" || !Array.isArray(pc.options)) {
    return;
  }
  const target = pc.effect?.target as { type?: unknown; location?: unknown } | undefined;
  if (
    typeof target !== "object" ||
    target === null ||
    target.type !== "unit" ||
    typeof target.location === "string"
  ) {
    return;
  }
  const options = pc.options as string[];
  const kept = options.filter((id) => id !== cardId);
  // Never strand the prompt with nothing to pick.
  if (kept.length > 0 && kept.length !== options.length) {
    (pc as { options: string[] }).options = kept;
  }
}

/** rule 359.3.e.2 — targets of `chainItemId` that became new objects since it was placed. */
export function newObjectTargetsFor(draft: RiftboundGameState, chainItemId: string): string[] {
  return (draft as RiftboundGameState & LkiDraft).newObjectTargets?.[chainItemId] ?? [];
}

const KILL_FAMILY: ReadonlySet<LeaveCauseKind> = new Set(["kill", "sba", "temporary", "cost"]);

export function isKillCause(cause: LeaveCause): boolean {
  return KILL_FAMILY.has(cause.kind);
}

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

function isBoardZone(zone: string | undefined): boolean {
  return zone === "base" || (zone !== undefined && zone.startsWith("battlefield-"));
}

function boardZoneIds(draft: RiftboundGameState): string[] {
  return ["base", ...Object.keys(draft.battlefields ?? {}).map((bf) => `battlefield-${bf}`)];
}

/** Zone of a card, tolerating contexts without `getCardZone` (cleanup stubs). */
export function zoneOfCard(ctx: LeaveBoardContext, cardId: string): string | undefined {
  const direct = ctx.zones.getCardZone?.(cardId as CoreCardId);
  if (direct !== undefined) {
    return direct as string;
  }
  const list = ctx.zones.getCardsInZone;
  if (!list) {
    return undefined;
  }
  for (const zoneId of [...boardZoneIds(ctx.draft), "hand", "trash", "banishment", "mainDeck", "legendZone", "championZone"]) {
    if (list(zoneId as CoreZoneId).some((id) => (id as string) === cardId)) {
      return zoneId;
    }
  }
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    const z = `facedown-${bfId}`;
    if (list(z as CoreZoneId).some((id) => (id as string) === cardId)) {
      return z;
    }
  }
  return undefined;
}

function metaOf(ctx: LeaveBoardContext, cardId: string): Partial<RiftboundCardMeta> & {
  __flags?: Record<string, boolean>;
} {
  return (ctx.cards?.getCardMeta?.(cardId as CoreCardId) ?? {}) as Partial<RiftboundCardMeta> & {
    __flags?: Record<string, boolean>;
  };
}

function ownerOf(ctx: LeaveBoardContext, cardId: string): string | undefined {
  return ctx.cards?.getCardOwner?.(cardId as CoreCardId);
}

function controllerOf(ctx: LeaveBoardContext, cardId: string): string {
  return ctx.cards?.getCardController?.(cardId as CoreCardId) ?? ownerOf(ctx, cardId) ?? "";
}

/**
 * rule 807.1.d.1 / 466.7.a — a combat-only Might bonus (Assault while
 * attacking, Shield while defending) is still part of current Might when a
 * combat death happens: designations are removed only at the very end of
 * combat. Callers that read "the Might it had as it left" must include it.
 */
export function combatMightBonus(
  cardId: string,
  meta: Partial<RiftboundCardMeta> | undefined,
): number {
  const def = getGlobalCardRegistry().get(cardId) as
    | { keywords?: readonly string[]; abilities?: readonly unknown[] }
    | undefined;
  let bonus = meta?.combatMightModifier ?? 0;
  const role = meta?.combatRole;
  if (role !== "attacker" && role !== "defender") {
    return bonus;
  }
  const roleKeyword = role === "attacker" ? "Assault" : "Shield";
  for (const kw of def?.keywords ?? []) {
    if (kw === roleKeyword) {
      bonus += 1;
    }
  }
  for (const raw of def?.abilities ?? []) {
    const ability = raw as { type?: string; keyword?: string; value?: number };
    if (ability.type === "keyword" && ability.keyword === roleKeyword) {
      bonus += ability.value ?? 1;
    }
  }
  for (const gk of meta?.grantedKeywords ?? []) {
    if (gk.keyword === roleKeyword) {
      bonus += gk.value ?? 1;
    }
  }
  return bonus;
}

function hasTriggerDouble(cardId: string): boolean {
  return ((getGlobalCardRegistry().getAbilities(cardId) ?? []) as readonly {
    type?: string;
    effect?: { type?: string };
  }[]).some((a) => a.type === "static" && a.effect?.type === "trigger-double");
}

// ---------------------------------------------------------------------------
// LKI
// ---------------------------------------------------------------------------

/**
 * rule 428.1.a.1.b / 740.2.a — note the card's location, attributes and
 * neighbours before it leaves, and publish it on `draft.lki`.
 */
export function snapshotLKI(ctx: LeaveBoardContext, cardId: string): LKISnapshot {
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId);
  const meta = metaOf(ctx, cardId);
  const flags = meta.__flags ?? {};
  const zone = zoneOfCard(ctx, cardId);
  const owner = ownerOf(ctx, cardId) ?? "";
  const controller = controllerOf(ctx, cardId) || owner;
  const buffed = meta.buffed === true || flags.buffed === true;
  let equipBonus = 0;
  for (const equipId of meta.equippedWith ?? []) {
    equipBonus += registry.getMightBonus(equipId as string);
  }
  const baseMight = def?.might ?? 0;
  const might =
    baseMight > 0
      ? Math.max(
          0,
          baseMight +
            (buffed ? 1 : 0) +
            (meta.extraBuffs ?? 0) +
            (meta.mightModifier ?? 0) +
            (meta.staticMightBonus ?? 0) +
            equipBonus,
        )
      : 0;
  const unitsHere: { id: string; controller: string }[] = [];
  if (isBoardZone(zone) && ctx.zones.getCardsInZone) {
    const ids =
      zone === "base"
        ? ctx.zones.getCardsInZone("base" as CoreZoneId, controller as CorePlayerId)
        : ctx.zones.getCardsInZone(zone as CoreZoneId);
    for (const raw of ids) {
      const id = raw as string;
      if (id === cardId) {
        continue;
      }
      const t = registry.getCardType(id);
      if (t !== undefined && t !== "unit") {
        continue;
      }
      unitsHere.push({ controller: controllerOf(ctx, id), id });
    }
  }
  const snap: LKISnapshot = {
    attachedTo: meta.attachedTo as string | undefined,
    attachments: [...((meta.equippedWith ?? []) as string[])],
    buffed,
    cardId,
    cardType: def?.cardType,
    controller,
    ...(registry.copySourceOf(cardId) !== undefined
      ? { copyOfCardId: registry.copySourceOf(cardId) }
      : {}),
    damage: getDamage(ctx, cardId),
    empowered: meta.empowered === true || flags.empowered === true,
    exhausted: meta.exhausted === true || flags.exhausted === true,
    isToken: registry.isToken(cardId),
    // rule 383.2.c.1 — damage the unit already survived a cleanup pass with is
    // stale: it credits nobody with the kill when something else finishes the
    // unit off later (ruling 46208875b334d665).
    lastDamageSource: meta.killCreditStale === true ? undefined : meta.lastDamageSource,
    lastDamagedBy: meta.killCreditStale === true ? undefined : meta.lastDamagedBy,
    might,
    owner,
    stunned: meta.stunned === true || flags.stunned === true,
    ...(meta.delayedTriggers && meta.delayedTriggers.length > 0
      ? { delayedTriggers: [...meta.delayedTriggers] }
      : {}),
    triggerDoubler: hasTriggerDouble(cardId),
    unitsHere,
    wasAlone: !unitsHere.some((u) => u.controller === controller),
    // rule 708/710 — Mighty reads effective Might; rule 807.1.d.1 keeps the
    // attacker/defender bonus alive through a combat death.
    wasMighty: baseMight > 0 && might + combatMightBonus(cardId, meta) >= 5,
    zone,
  };
  const draft = ctx.draft as LkiDraft;
  draft.lki ??= {};
  draft.lki[cardId] = snap;
  return snap;
}

/**
 * rule 370.1.a.2 — snapshot every card of a simultaneous batch before the
 * first one moves, so batch-mates still count as "here" for each other.
 */
export function snapshotBatch(ctx: LeaveBoardContext, cardIds: readonly string[]): Map<string, LKISnapshot> {
  const out = new Map<string, LKISnapshot>();
  for (const id of cardIds) {
    out.set(id, snapshotLKI(ctx, id));
  }
  return out;
}

/** Read a card's LKI if it left the board in the batch being processed. */
export function getLKI(draft: RiftboundGameState, cardId: string): LKISnapshot | undefined {
  return (draft as LkiDraft).lki?.[cardId];
}

/** Cards leaving in the batch whose events are being published (rule 370.1.a.2). */
export function getLeavingBatch(draft: RiftboundGameState): readonly LKISnapshot[] {
  const d = draft as LkiDraft;
  return (d.leavingBatch ?? []).map((id) => d.lki?.[id]).filter((s): s is LKISnapshot => s !== undefined);
}

/**
 * rule 183 / 186.1 — ownership is inherent and survives the object: a token
 * that ceased to exist still has an owner for a later clause of the same
 * effect ("Return a friendly unit to its owner's hand. Its owner channels 1
 * rune exhausted."). LKI is batch-scoped and gone by then, so the owner of
 * every card removed from the game is kept here.
 */
export function recordDepartedOwner(draft: RiftboundGameState, cardId: string, owner: string | undefined): void {
  if (!owner) {
    return;
  }
  const d = draft as LkiDraft;
  d.departedOwners = { ...(d.departedOwners ?? {}), [cardId]: owner };
}

/** rule 183 — owner of a card that is no longer a game object (see `recordDepartedOwner`). */
export function getDepartedOwner(draft: RiftboundGameState, cardId: string): string | undefined {
  return (draft as LkiDraft).departedOwners?.[cardId];
}

/** Drop LKI entries — end of a cleanup pass / end of turn housekeeping. */
export function clearLKI(draft: RiftboundGameState, cardIds?: readonly string[]): void {
  const d = draft as LkiDraft;
  if (!d.lki) {
    return;
  }
  if (cardIds === undefined) {
    d.lki = undefined;
    return;
  }
  for (const id of cardIds) {
    delete d.lki[id];
  }
}

// ---------------------------------------------------------------------------
// Reset (rule 124.1) and detach (rule 457.1 / 719.5)
// ---------------------------------------------------------------------------

/**
 * rule 124.1 — a Game Object changing zones to/from a non-board zone stops
 * tracking every temporary modification: damage, buffs, stun, exhaustion,
 * granted keywords/abilities, Might modifiers, control changes, attachment
 * links, hidden status. Also reverts control to the owner (rule 191.1).
 */
export function resetObjectState(ctx: LeaveBoardContext, cardId: string): void {
  const id = cardId as CoreCardId;
  const counters = ctx.counters;
  counters?.setFlag?.(id, "exhausted", false);
  counters?.setFlag?.(id, "stunned", false);
  counters?.setFlag?.(id, "buffed", false);
  clearDamage(ctx, cardId);
  ctx.cards?.updateCardMeta?.(id, {
    __flags: undefined,
    attachedTo: undefined,
    buffed: false,
    combatMightModifier: 0,
    combatRole: null,
    controlEffects: undefined,
    copiedFromCardId: undefined,
    damagePreventionShield: undefined,
    delayedTriggers: undefined,
    empowered: undefined,
    equippedWith: undefined,
    exhausted: false,
    extraBuffs: undefined,
    grantedAbilities: undefined,
    grantedKeywords: undefined,
    hidden: false,
    hiddenAt: undefined,
    killCreditStale: undefined,
    lastDamageSource: undefined,
    lastDamagedBy: undefined,
    mightModifier: 0,
    modesChosenThisTurn: undefined,
    staticMightBonus: undefined,
    stunned: false,
  });
  const owner = ownerOf(ctx, cardId);
  if (owner !== undefined && ctx.cards?.setCardController && controllerOf(ctx, cardId) !== owner) {
    ctx.cards.setCardController(id, owner as CorePlayerId);
  }
}

/**
 * rule 457.1 / 719.5 — sever both sides of every attachment link the leaving
 * card is part of. Equipment worn by a leaving unit stays on the board and is
 * recalled to base; a leaving Equipment drops off its holder.
 */
export function detachOnLeave(ctx: LeaveBoardContext, cardId: string): void {
  const update = ctx.cards?.updateCardMeta;
  if (!update) {
    return;
  }
  const meta = metaOf(ctx, cardId);
  const holder = meta.attachedTo as string | undefined;
  if (typeof holder === "string") {
    const held = (metaOf(ctx, holder).equippedWith ?? []) as string[];
    update(holder as CoreCardId, { equippedWith: held.filter((e) => e !== cardId) });
    update(cardId as CoreCardId, { attachedTo: undefined, copiedFromCardId: undefined });
    // rule 477.1.b: a "becomes a copy … for as long as this is attached" copy
    // ends the moment the link is severed (Shady Spectacles) — only that
    // Equipment's own copy layer (435.1.d).
    getGlobalCardRegistry().revertCopy(holder, cardId);
  }
  const worn = [...((meta.equippedWith ?? []) as string[])];
  for (const equipId of worn) {
    update(equipId as CoreCardId, { attachedTo: undefined, copiedFromCardId: undefined });
    ctx.zones.moveCard({ cardId: equipId as CoreCardId, targetZoneId: "base" as CoreZoneId });
  }
  if (worn.length > 0) {
    // rule 477.1.b: the holder leaving the board detaches everything, so any
    // copy granted by one of those attachments ends too.
    getGlobalCardRegistry().revertCopy(cardId);
  }
  if (worn.length > 0) {
    update(cardId as CoreCardId, { equippedWith: undefined });
  }
}

// ---------------------------------------------------------------------------
// Die replacements (rules 370–373) — board abilities, via the shared matcher
// ---------------------------------------------------------------------------

/**
 * Adapt a leave/cleanup context into an EffectContext for running a
 * replacement's own effect, with the would-be-dying card exposed as
 * `trigger-source` ("it").
 */
export function buildReplacementEffectContext(
  ctx: LeaveBoardContext,
  match: { sourceCardId: string; sourceOwner: string },
  dyingCardId: string,
): EffectContext {
  const zonesAny = ctx.zones as unknown as Partial<EffectContext["zones"]>;
  const countersAny = (ctx.counters ?? {}) as Partial<EffectContext["counters"]>;
  const noop = () => {};
  return {
    cards: ctx.cards as unknown as EffectContext["cards"],
    counters: {
      addCounter: countersAny.addCounter ?? noop,
      clearCounter: countersAny.clearCounter ?? noop,
      removeCounter: countersAny.removeCounter ?? noop,
      setFlag: countersAny.setFlag ?? noop,
    },
    draft: ctx.draft,
    playerId: match.sourceOwner,
    sourceCardId: match.sourceCardId,
    triggerSourceId: dyingCardId,
    zones: {
      drawCards: (zonesAny.drawCards ?? noop) as EffectContext["zones"]["drawCards"],
      getCardZone: (id: CoreCardId) => zoneOfCard(ctx, id as string),
      getCardsInZone: ctx.zones.getCardsInZone ?? (() => []),
      moveCard: ctx.zones.moveCard,
      removeCardFromGame: ctx.zones.removeCardFromGame,
    },
  };
}

/**
 * Apply the `die` replacements (Zhonya's Hourglass ogn-077-298, Soraka,
 * Guardian Angel, runtime "next time it would die" shields …) to ONE card about
 * to be killed by an instruction, a cost or [Temporary]. Returns true when the
 * death does not happen now — it was replaced, or a rule 371.2 / 372 question
 * is open and `continueKillBatch` finishes the kill on the answer. The caller
 * must then leave the card where it is and fire no `die` (370.1.a.1 / 808.1.d.1).
 * Simultaneous kills should go through `runDieBatch` with the whole batch
 * instead (rule 373 — `effects/kill.ts killUnits` does).
 */
export function applyDieReplacement(
  ctx: LeaveBoardContext,
  cardId: string,
  cause?: LeaveCause,
  to: LeaveDestination = "trash",
): boolean {
  if (isDieReplacementRunning(cardId)) {
    return false;
  }
  const getCardsInZone = ctx.zones.getCardsInZone ?? (() => []);
  const batchCtx = { ...ctx, zones: { ...ctx.zones, getCardsInZone, moveCard: ctx.zones.moveCard } };
  const result = runDieBatch(batchCtx, [cardId], {
    canPrompt: true,
    kill: {
      cause: cause ?? { kind: "kill" },
      playerId: cause?.by ?? controllerOf(ctx, cardId),
      sourceCardId: cause?.source ?? cardId,
      to,
    },
  });
  return result.suspended || result.replaced.includes(cardId);
}

// ---------------------------------------------------------------------------
// leaveBoard
// ---------------------------------------------------------------------------

function destinationZone(to: LeaveDestination): { zoneId: string; position?: "top" | "bottom" } {
  switch (to) {
    case "trash":
      return { zoneId: "trash" };
    case "banishment":
      return { zoneId: "banishment" };
    case "hand":
      return { zoneId: "hand" };
    case "deck-top":
      return { position: "top", zoneId: "mainDeck" };
    case "deck-bottom":
      return { position: "bottom", zoneId: "mainDeck" };
    default:
      return { zoneId: "trash" };
  }
}

/**
 * Take one card off the board (or discard it from hand) — see the module doc
 * for the step order. Fires NO events: collect the results of a simultaneous
 * batch and hand them to {@link emitLeaveEvents} (or use {@link removeFromBoard}).
 */
export function leaveBoard(
  ctx: LeaveBoardContext,
  cardId: string,
  to: LeaveDestination,
  cause: LeaveCause,
  opts: LeaveOptions = {},
): LeaveResult {
  const lki = opts.lki ?? snapshotLKI(ctx, cardId);
  (ctx.draft as LkiDraft).lki ??= {};
  ((ctx.draft as LkiDraft).lki as Record<string, LKISnapshot>)[cardId] = lki;
  const killing = isKillCause(cause);

  // rule 428.1 — killing is a permanent going to the trash FROM THE BOARD; a
  // card that already left (bounced / banished in response) can't be killed.
  if (killing && lki.zone !== undefined && !isBoardZone(lki.zone)) {
    clearLKI(ctx.draft, [cardId]);
    return { cardId, cause, left: false, lki };
  }

  if (killing && opts.replacements !== "skip" && isBoardZone(lki.zone)) {
    // rule 370.1.a.1 — the death never happens; the card stays (wherever the
    // replacement put it) and keeps no pending Deathknell.
    if (applyDieReplacement(ctx, cardId, cause, to)) {
      clearLKI(ctx.draft, [cardId]);
      return { cardId, cause, left: false, lki, replacedBy: "replacement" };
    }
  }

  // rule 457.1 / 719.5 — attachments detach as the top-most card leaves.
  detachOnLeave(ctx, cardId);

  // rule 571 / rule-id: ven-022-166 — "if a card would go to your trash from
  // anywhere other than your Main Deck, banish it instead". Every departure
  // routed through leaveBoard comes from the board, the hand or the chain —
  // never from the Main Deck — so a trash destination is always replaceable.
  let finalTo = to;
  if (to === "trash" && ctx.zones.getCardsInZone !== undefined) {
    const getCardsInZone = ctx.zones.getCardsInZone.bind(ctx.zones);
    const getCardOwner = ctx.cards?.getCardOwner?.bind(ctx.cards);
    if (replacementEffects.hasTrashToBanishReplacement(ctx.draft, { getCardOwner, getCardsInZone }, lki.owner)) {
      finalTo = "banishment";
    }
  }

  const dest = destinationZone(finalTo);
  // rule 421.4 — a facedown card that changes zones is revealed to all players
  // by its owner as it leaves the Facedown Zone (bounce, trash, banish alike).
  if (lki.zone !== undefined && lki.zone.startsWith("facedown-")) {
    recordPublicReveal(ctx, lki.owner ?? ownerOf(ctx, cardId) ?? "", [cardId]);
  }
  ctx.zones.moveCard({
    cardId: cardId as CoreCardId,
    targetZoneId: dest.zoneId as CoreZoneId,
    ...(dest.position ? { position: dest.position } : {}),
  });

  // rule 124.1 — the card in its new zone is a new object.
  resetObjectState(ctx, cardId);
  if (isBoardZone(lki.zone)) {
    markNewObjectForChainTargets(ctx.draft, cardId);
    dropFromPendingUnitChoice(ctx.draft, cardId);
  }

  const result: LeaveResult = {
    cardId,
    cause,
    left: true,
    lki,
    to: finalTo,
    ...(finalTo !== to ? { trashReplaced: true } : {}),
  };

  // rule 186.1 — a token in a non-board zone ceases to exist. Kill-family
  // deaths keep it until their `die` event has been published (428.1.a.1.b:
  // the Deathknell is noted first); every other departure removes it now so a
  // follow-up step of the same effect finds nothing to replay.
  if (lki.isToken) {
    if (killing || cause.kind === "discard") {
      result.tokenPending = true;
    } else {
      recordDepartedOwner(ctx.draft, cardId, lki.owner);
      ctx.zones.removeCardFromGame?.({ cardId: cardId as CoreCardId });
      clearLKI(ctx.draft, [cardId]);
    }
  } else if (!killing && cause.kind !== "discard") {
    // Non-death departures publish nothing later, so their LKI is done with.
    clearLKI(ctx.draft, [cardId]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Build the unified event for one leave result (payload keeps kill.ts's field names). */
export function buildLeaveEvent(result: LeaveResult, batchIndex?: number): GameEvent | undefined {
  const { cause, lki } = result;
  if (!result.left) {
    return undefined;
  }
  // rule 428.1 / 427.2.a / 808.1.d.1 — a kill is board → TRASH. When a blanket
  // destination replacement sent the card to banishment instead it was not
  // killed: Deathknell and other `die` listeners see nothing.
  if (isKillCause(cause) && result.trashReplaced === true) {
    return {
      cardId: result.cardId,
      cause: "banish",
      controller: lki.controller,
      from: lki.zone,
      owner: lki.owner,
      to: result.to,
      type: "leave-board",
    } as GameEvent;
  }
  if (isKillCause(cause)) {
    return {
      attachments: [...lki.attachments],
      cardId: result.cardId,
      cause: cause.kind,
      controller: lki.controller,
      diedAt: lki.zone,
      killSource: cause.sourceKind ?? lki.lastDamageSource,
      killedBy: cause.by ?? lki.lastDamagedBy,
      owner: lki.owner,
      type: "die",
      wasAlone: lki.wasAlone,
      wasBuffed: lki.buffed,
      wasMighty: lki.wasMighty,
      wasStunned: lki.stunned,
      ...(batchIndex !== undefined ? { batchIndex } : {}),
    } as GameEvent;
  }
  if (cause.kind === "discard") {
    return {
      cardId: result.cardId,
      playerId: cause.by ?? lki.owner,
      type: "discard",
      ...(batchIndex !== undefined ? { batchIndex } : {}),
    };
  }
  return {
    cardId: result.cardId,
    cause: cause.kind,
    controller: lki.controller,
    from: lki.zone,
    owner: lki.owner,
    to: result.to,
    type: "leave-board",
  } as GameEvent;
}

/**
 * Publish the events for a batch of simultaneous departures (rule 370.1.a.2 /
 * 808.1.d.2): the whole batch is exposed on `draft.leavingBatch` + `draft.lki`
 * before the first event fires, so the trigger runner can still see a doubler
 * or a neighbour that is dying at the same moment. Afterwards pending tokens
 * cease to exist (rule 186.1) and the batch's LKI is dropped.
 *
 * @param fire - the caller's trigger sink (`ctx.fireTriggers`, `fireTriggers`
 *   bound to a runner context, or the dispatcher).
 * @returns total listeners fired (when the sink reports it).
 */
/**
 * rule 383.3.d.1 — every card of a simultaneous batch leaves at once, so the
 * triggers they cause are simultaneous even though the events are published one
 * card at a time. The turn player appends theirs to the Chain first, then each
 * other player in turn order; within one player the scan order stands (585.1).
 * Only the items this batch added are reordered.
 */
export function orderBatchTriggersByTurnOrder(
  draft: RiftboundGameState,
  chainLenBefore: number,
): void {
  const chain = draft.interaction?.chain;
  const items = chain?.items;
  if (!chain || !items || items.length - chainLenBefore < 2) {
    return;
  }
  const turnOrder = Object.keys(draft.players ?? {});
  const turnPlayer = draft.turn?.activePlayer ?? turnOrder[0] ?? "";
  const startIdx = Math.max(0, turnOrder.indexOf(turnPlayer));
  const rankOf = (pid: string): number => {
    const i = turnOrder.indexOf(pid);
    return i < 0
      ? Number.MAX_SAFE_INTEGER
      : (i - startIdx + turnOrder.length) % turnOrder.length;
  };
  const head = items.slice(0, chainLenBefore);
  const tail = items
    .slice(chainLenBefore)
    .map((item, i) => ({ i, item }))
    .toSorted((a, b) => {
      const d = rankOf(a.item.controller) - rankOf(b.item.controller);
      return d !== 0 ? d : a.i - b.i;
    })
    .map((e) => e.item);
  (chain as { items: ChainItem[] }).items = [...head, ...tail];
  // rule 383.3.d — the whole batch triggered simultaneously even though its
  // events were published one card at a time, so the per-event batch stamps the
  // trigger runner wrote become one: their controller may still order them.
  collapseTriggerBatch(draft.interaction, chainLenBefore);
}

export function emitLeaveEvents(
  ctx: LeaveBoardContext,
  results: readonly LeaveResult[],
  fire: ((event: GameEvent) => number | void) | undefined,
): number {
  const draft = ctx.draft as LkiDraft;
  const gone = results.filter((r) => r.left);
  if (gone.length === 0) {
    return 0;
  }
  const outerBatch = draft.leavingBatch;
  draft.leavingBatch = gone.map((r) => r.cardId);
  let total = 0;
  const chainLenBefore = ctx.draft.interaction?.chain?.items.length ?? 0;
  try {
    let discardIndex = 0;
    // rule 423.1 — several units dying at once is ONE game action, so a
    // "when one or more <friendly|enemy> units die" trigger fires once. The
    // index is per CONTROLLER (740.1.a): a trade kills one unit on each side,
    // and each side's first death is index 0.
    const dieIndexByController = new Map<string, number>();
    for (const r of gone) {
      let batchIndex: number | undefined;
      if (r.cause.kind === "discard") {
        batchIndex = discardIndex++;
      } else if (isKillCause(r.cause)) {
        const side = r.lki.controller;
        batchIndex = dieIndexByController.get(side) ?? 0;
        dieIndexByController.set(side, batchIndex + 1);
      }
      const event = buildLeaveEvent(r, batchIndex);
      if (event && fire) {
        const n = fire(event);
        total += typeof n === "number" ? n : 0;
      }
    }
    orderBatchTriggersByTurnOrder(ctx.draft, chainLenBefore);
  } finally {
    draft.leavingBatch = outerBatch;
    for (const r of gone) {
      if (r.tokenPending) {
        recordDepartedOwner(ctx.draft, r.cardId, r.lki.owner);
        ctx.zones.removeCardFromGame?.({ cardId: r.cardId as CoreCardId });
        r.tokenPending = false;
      }
    }
    clearLKI(
      ctx.draft,
      gone.map((r) => r.cardId),
    );
  }
  return total;
}

/**
 * Convenience: take every card in `ids` off the board as ONE simultaneous
 * action, then publish their events.
 */
export function removeFromBoard(
  ctx: LeaveBoardContext,
  ids: readonly string[],
  to: LeaveDestination,
  cause: LeaveCause,
  fire: ((event: GameEvent) => number | void) | undefined,
  opts: LeaveOptions = {},
): LeaveResult[] {
  const snaps = snapshotBatch(ctx, ids);
  // rules 370–373 — several cards KILLED together (a multi-kill cost, a wipe)
  // are simultaneous deaths: plan their die replacements as one batch (one
  // Zhonya's saves one of them — 373; several shields on one are ordered —
  // 372) instead of card by card. A question parks the whole batch;
  // `continueKillBatch` finishes it on the answer.
  const onBoard = ids.filter((id) => isBoardZone(snaps.get(id)?.zone));
  if (isKillCause(cause) && opts.replacements !== "skip" && onBoard.length > 1) {
    const getCardsInZone = ctx.zones.getCardsInZone ?? (() => []);
    const batchCtx = { ...ctx, zones: { ...ctx.zones, getCardsInZone, moveCard: ctx.zones.moveCard } };
    const plan = runDieBatch(batchCtx, onBoard, {
      canPrompt: true,
      kill: { cause, playerId: cause.by ?? "", sourceCardId: cause.source ?? "", to },
    });
    const results = ids.map((id) =>
      plan.suspended || plan.replaced.includes(id) || (onBoard.includes(id) && !plan.dying.includes(id))
        ? ({ cardId: id, cause, left: false, lki: snaps.get(id) as LKISnapshot, replacedBy: "replacement" } as LeaveResult)
        : leaveBoard(ctx, id, to, cause, { ...opts, lki: snaps.get(id), replacements: "skip" }),
    );
    emitLeaveEvents(ctx, results, fire);
    return results;
  }
  const results = ids.map((id) => leaveBoard(ctx, id, to, cause, { ...opts, lki: snaps.get(id) }));
  emitLeaveEvents(ctx, results, fire);
  return results;
}
