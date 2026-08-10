/**
 * Battlefield CONTROL — the one model for WHEN control of a battlefield is lost
 * or gained (rules 190.4, 323.6, 348.2.a, 466.5, 469) and the readers that hang
 * off it (facedown legality 107.3 / 811, "you" on a battlefield's abilities
 * 190.6.d).
 *
 * The model (see `.claude/fix-queue/FIXER-PRIMER.md` § Battlefield control timing):
 *
 *  LOSING control — `loseControlIfUnoccupied` / `applyControlCleanupStep`, run by
 *  the Cleanup (`state-based-checks.ts performCleanup`, 323.6 = step 4):
 *   - a controller with NO unit of theirs at the battlefield loses it in a
 *     Cleanup whose state is OPEN (no chain item exists: no active chain, no
 *     Pending item, no unanswered prompt of a resolving item — 309/310/401.1) and
 *     where no Showdown or Combat is ONGOING AT THAT battlefield (190.4.b/.c).
 *     "Showdown Open" (a showdown elsewhere) is an Open State (310.3).
 *   - Closed State (a Deathknell / dies-trigger / pending replay / any chain
 *     item) ⇒ control is kept and re-checked at the first Open Cleanup
 *     (808.1.d.2, official clarification 9a32c2cc829f221a: Cruel Patron,
 *     Baited Hook, Arcane Shift, Glasc Mixologist keep the battlefield).
 *   - a Showdown / Combat ongoing HERE freezes control until its own step
 *     (348.2.a / 466.5); one that is merely STAGED in this Cleanup does not
 *     (323.6 is step 4, the showdown begins at step 9).
 *   - the cause is irrelevant: move, recall, bounce, banish, death, control
 *     steal — only "does the controller have a Unit here now" is read. Seeded /
 *     left-over control with no unit lapses exactly the same way.
 *  GAINING control — `establishControl`: 348.2.a (non-combat showdown close,
 *  sole remaining player), 466.5 (combat Resolution Step, remaining player),
 *  the directed/sandbox conquer move, and the Neutral-Open presence shortcut
 *  (DESIGN, `applyControlCleanupStep`). Establishing control you did not have is
 *  a Conquer (469.1) — a Score unless already scored there this turn (470 /
 *  471.2.c); keeping control you never lost is nothing (no "re-conquer").
 *  466.5.b: nobody remaining after a combat ⇒ `makeUncontrolled`.
 *  READERS — `battlefieldYou` ("you" = current controller, nobody when
 *  Uncontrolled), `controlsBattlefield` (hide / play-from-facedown / "a
 *  battlefield you control" destinations all read the recorded controller and
 *  nothing else).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { GameEvent } from "../abilities/game-events";
import { fireTriggers, type TriggerRunnerContext } from "../abilities/trigger-runner";
import { isResolvingChainItem } from "../chain/resolution-guard";
import type { PlayerId, RiftboundGameState } from "../types";
import { isPresenceUnit, stageContested } from "./arrive-at-battlefield";
import { orderBatchTriggersByTurnOrder } from "./leave-board";
import { type PointsIO, scoreBattlefield, scoreEvents } from "./points";

/** Minimal operation bag: every cleanup / move / flow / effect context is a superset. */
export interface ControlIO {
  readonly draft: RiftboundGameState;
  readonly zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => readonly CoreCardId[];
    moveCard?: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => unknown;
    drawCards?: unknown;
    getCardZone?: unknown;
  };
  readonly cards: {
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
    getCardMeta?: (cardId: CoreCardId) => unknown;
    updateCardMeta?: (cardId: CoreCardId, meta: never) => void;
  };
  readonly counters?: unknown;
}

/** rule 310 — the state a Cleanup runs in, as far as 323.6 is concerned. */
export type CleanupStateKind = "neutral-open" | "showdown-open" | "closed";

function toBattlefieldId(idOrZone: string): string {
  return idOrZone.startsWith("battlefield-") ? idOrZone.slice("battlefield-".length) : idOrZone;
}

function controllerOfCard(io: ControlIO, cardId: CoreCardId): string | undefined {
  return io.cards.getCardController?.(cardId) ?? io.cards.getCardOwner(cardId);
}

/** Controllers of the UNITS present at a battlefield (gear / equipment is no presence — 190.3). */
export function unitControllersAt(io: ControlIO, battlefieldId: string): Set<string> {
  const out = new Set<string>();
  const zone = `battlefield-${toBattlefieldId(battlefieldId)}` as CoreZoneId;
  for (const id of io.zones.getCardsInZone(zone)) {
    if (!isPresenceUnit(id as string)) {
      continue;
    }
    const c = controllerOfCard(io, id);
    if (c) {
      out.add(c);
    }
  }
  return out;
}

/** rule 190.4.a — does `playerId` have a Unit it controls at the battlefield right now? */
export function controllerHasUnitAt(io: ControlIO, battlefieldId: string, playerId: string): boolean {
  return unitControllersAt(io, battlefieldId).has(playerId);
}

/**
 * rule 309 / 310 / 401.1 / 808.1.d.2 — OPEN means no chain item exists at all:
 * no active chain, no Pending item, no prompt still owed by a resolving item,
 * and no unit reaped in THIS cleanup pass whose `die` trigger has not been
 * queued yet (the maintenance runner queues it right after the pass, so the
 * check simply waits for the next pass). Neutral vs Showdown is the stack.
 */
export function cleanupStateKind(
  draft: RiftboundGameState,
  opts: { readonly killedThisPass?: number } = {},
): CleanupStateKind {
  const interaction = draft.interaction;
  // rule 321 — a Chain Item mid-resolution has left the items list already, but
  // the turn is Closed until it finishes (its own instructions may empty a
  // battlefield and then play a unit back onto it).
  const chainExists =
    isResolvingChainItem() ||
    interaction?.chain?.active === true ||
    (interaction?.chain?.items?.length ?? 0) > 0 ||
    (draft.pendingChoice !== undefined && draft.pendingChoice !== null) ||
    draft.suspendedPlay !== undefined ||
    (opts.killedThisPass ?? 0) > 0;
  if (chainExists) {
    return "closed";
  }
  const showdownRunning = (interaction?.showdownStack ?? []).some((sd) => sd.active);
  return showdownRunning ? "showdown-open" : "neutral-open";
}

/**
 * rule 190.4.b — is a Showdown or Combat ONGOING at this battlefield? A showdown
 * on the stack for it (combat or not), or a Combat whose showdown has closed but
 * whose Damage / Resolution Step has not finished (`contested && showdownComplete`,
 * the parked `combatDamageDone`, a suspended combat cleanup). A merely STAGED
 * showdown (contested, nothing begun) is NOT ongoing.
 */
export function isShowdownOrCombatOngoingAt(draft: RiftboundGameState, battlefieldId: string): boolean {
  const bfId = toBattlefieldId(battlefieldId);
  if ((draft.interaction?.showdownStack ?? []).some((sd) => sd.battlefieldId === bfId)) {
    return true;
  }
  const bf = draft.battlefields?.[bfId];
  if (!bf) {
    return false;
  }
  if (bf.contested === true && bf.showdownComplete === true) {
    return true; // combat showdown closed, damage / resolution outstanding (460)
  }
  return bf.combatDamageDone === true || bf.combatCleanupSuspended === true;
}

/** rule 190.6.d — "you" on a battlefield's abilities: its controller, or nobody. */
export function battlefieldYou(draft: RiftboundGameState, battlefieldId: string): string | null {
  return (draft.battlefields?.[toBattlefieldId(battlefieldId)]?.controller as string | null | undefined) ?? null;
}

/**
 * rule 107.3.c / 811.1.b / 355.2.a — "a battlefield you control" is the RECORDED
 * controller and nothing else (units standing there are not control, 190.4;
 * control kept through a Closed State or an ongoing showdown is real control).
 */
export function controlsBattlefield(draft: RiftboundGameState, battlefieldId: string, playerId: string): boolean {
  return battlefieldYou(draft, battlefieldId) === playerId;
}

/** rule 466.5.b / 190.2.b — the battlefield becomes Uncontrolled. */
export function makeUncontrolled(draft: RiftboundGameState, battlefieldId: string): boolean {
  const bf = draft.battlefields?.[toBattlefieldId(battlefieldId)];
  if (!bf || bf.controller === null || bf.controller === undefined) {
    return false;
  }
  bf.controller = null;
  return true;
}

/**
 * rule 323.6 / 190.4.c — the Cleanup's control-loss step for ONE battlefield.
 * Returns true when control was removed. `kind` is the state of the Cleanup
 * (`cleanupStateKind`); a caller outside a Cleanup that knows the turn is Open
 * (the Expiration Step, the Beginning Phase after a Temporary kill) passes it.
 */
export function loseControlIfUnoccupied(
  io: ControlIO,
  battlefieldId: string,
  kind: CleanupStateKind,
): boolean {
  const bfId = toBattlefieldId(battlefieldId);
  const bf = io.draft.battlefields?.[bfId];
  if (!bf?.controller) {
    return false;
  }
  if (kind === "closed") {
    return false; // rule 309.1 / 401.1 — a chain item exists: control cannot lapse
  }
  if (isShowdownOrCombatOngoingAt(io.draft, bfId)) {
    return false; // rule 190.4.b — frozen until 348.2.a / 466.5
  }
  if (controllerHasUnitAt(io, bfId, bf.controller as string)) {
    return false; // rule 190.4.a
  }
  bf.controller = null;
  return true;
}

export interface EstablishControlOptions {
  /** rule 626.1.d.2 — the conquer followed an attack; carried on the `conquer` event. */
  readonly afterAttack?: boolean;
  readonly excessDamage?: number;
  /**
   * rule 188 / sfd-116-221 — the controller to report as "previous" when it
   * differs from the one recorded now (a combat reads it before its damage step).
   */
  readonly previousController?: string | null;
  /** Clear Contested as part of establishing control (348.2 / 466.5.a). Default true. */
  readonly clearContested?: boolean;
  /**
   * Fire the `conquer` + `score` events through this trigger context. When
   * omitted the events are RETURNED for the caller to fire at the right moment
   * (e.g. after the showdown has been popped off the stack).
   */
  readonly fire?: TriggerRunnerContext | false;
}

export interface EstablishControlResult {
  /** Control actually changed hands (false ⇒ the player already controlled it: nothing happens). */
  readonly changed: boolean;
  /** rule 471.2.c — the Conquer was a Score (not already scored here this turn, not denied as a Score). */
  readonly isScore: boolean;
  readonly previousController: string | null;
  /** `conquer` + `score` events still to fire (empty when `fire` was given or nothing scored). */
  readonly events: GameEvent[];
}

/**
 * rule 190.4 / 348.2.a / 466.5 / 469.1 — `playerId` establishes control of the
 * battlefield. If they did not already control it this is a Conquer: the point
 * (and Final-Point / denial / replacement handling) goes through
 * `points.ts scoreBattlefield`, and the Conquer / Score triggers fire only when
 * it was a Score (471.2.c). A player who already controls it establishes
 * nothing — successfully defending, or coming back during the same showdown,
 * is not a Conquer.
 */
export function establishControl(
  io: ControlIO,
  battlefieldId: string,
  playerId: string,
  opts: EstablishControlOptions = {},
): EstablishControlResult {
  const bfId = toBattlefieldId(battlefieldId);
  const draft = io.draft;
  const bf = draft.battlefields?.[bfId];
  if (!bf) {
    return { changed: false, events: [], isScore: false, previousController: null };
  }
  const recorded = (bf.controller as string | null | undefined) ?? null;
  const previousController = opts.previousController !== undefined ? opts.previousController : recorded;
  if (opts.clearContested !== false) {
    bf.contested = false;
    bf.contestedBy = undefined;
  }
  if (recorded === playerId) {
    return { changed: false, events: [], isScore: false, previousController };
  }
  bf.controller = playerId as PlayerId;
  // rule 471.1.b.1 — the Final Point may turn into a draw; stripped cleanup
  // stubs carry no `drawCards`, so fall back to a no-op there.
  const zonesAny = io.zones as unknown as Partial<PointsIO["zones"]>;
  const pointsIO: PointsIO = {
    cards: io.cards,
    zones: { ...zonesAny, drawCards: zonesAny.drawCards ?? (() => undefined), getCardsInZone: io.zones.getCardsInZone as PointsIO["zones"]["getCardsInZone"] },
  };
  const { isScore } = scoreBattlefield(draft, playerId as PlayerId, bfId, "conquer", pointsIO, {
    previousController,
  });
  const events = isScore
    ? scoreEvents(playerId as PlayerId, bfId, "conquer", {
        previousController,
        ...(opts.afterAttack ? { afterAttack: true, excessDamage: opts.excessDamage ?? 0 } : {}),
      })
    : [];
  if (opts.fire && events.length > 0) {
    // rule 383.3.d.1 — `conquer` and `score` are two publications of ONE Score,
    // so the triggers they raise are simultaneous: the turn player appends to
    // the Chain first and everyone else in turn order, regardless of which
    // publication raised them or who did the scoring.
    const chainLenBefore = draft.interaction?.chain?.items.length ?? 0;
    for (const event of events) {
      fireTriggers(event, opts.fire);
    }
    orderBatchTriggersByTurnOrder(draft, chainLenBefore);
    return { changed: true, events: [], isScore, previousController };
  }
  return { changed: true, events, isScore, previousController };
}

/**
 * rule 348.2.a / 466.5 — after a showdown or combat: the SOLE player with units
 * remaining establishes control (466.5.e: not necessarily the Contested
 * applier); nobody remaining ⇒ Uncontrolled after a combat (466.5.b), unchanged
 * after a non-combat showdown (the next Open Cleanup's 323.6 then applies);
 * units of two players ⇒ nothing (466.3.d.1 re-stages).
 */
export function settleControlByRemainingUnits(
  io: ControlIO,
  battlefieldId: string,
  how: "combat" | "showdown",
  opts: EstablishControlOptions = {},
): EstablishControlResult & { readonly holder: string | null } {
  const bfId = toBattlefieldId(battlefieldId);
  const holders = unitControllersAt(io, bfId);
  if (holders.size === 1) {
    const holder = [...holders][0] as string;
    return { ...establishControl(io, bfId, holder, opts), holder };
  }
  const bf = io.draft.battlefields?.[bfId];
  const previousController = (bf?.controller as string | null | undefined) ?? null;
  if (bf && opts.clearContested !== false && (how === "showdown" || holders.size === 0)) {
    bf.contested = false;
    bf.contestedBy = undefined;
  }
  if (holders.size === 0 && how === "combat") {
    makeUncontrolled(io.draft, bfId);
    return { changed: previousController !== null, events: [], holder: null, isScore: false, previousController };
  }
  return { changed: false, events: [], holder: null, isScore: false, previousController };
}

/** Trigger context from a cleanup-shaped bag (stripped test stubs fall back to no-ops). */
function triggerContextOf(io: ControlIO): TriggerRunnerContext {
  const zonesAny = io.zones as unknown as Partial<TriggerRunnerContext["zones"]>;
  const countersAny = (io.counters ?? {}) as Partial<TriggerRunnerContext["counters"]>;
  const noop = () => {};
  return {
    cards: io.cards,
    counters: {
      addCounter: countersAny.addCounter ?? noop,
      clearCounter: countersAny.clearCounter ?? noop,
      removeCounter: countersAny.removeCounter,
      setFlag: countersAny.setFlag ?? noop,
    },
    draft: io.draft,
    zones: {
      drawCards: zonesAny.drawCards ?? noop,
      getCardZone: zonesAny.getCardZone,
      getCardsInZone: io.zones.getCardsInZone,
      moveCard: zonesAny.moveCard ?? noop,
    },
  } as TriggerRunnerContext;
}

/**
 * Cleanup step 4 (rule 323.6) for every battlefield, plus the presence
 * shortcut. Returns whether anything changed.
 *
 * DESIGN (presence shortcut): in a NEUTRAL Open Cleanup a battlefield that is
 * not Contested, has nothing ongoing, whose recorded controller has no unit
 * there and where exactly ONE other player has units is taken by that player at
 * once (a Conquer). Real arrivals always apply Contested (`noteArrival`) and go
 * through a showdown; this state only comes from seeded boards / simultaneous
 * swaps. In a Showdown-Open Cleanup the controller still lapses (323.6) and the
 * sole occupant applies Contested instead (323.11.a), so the next Neutral Open
 * Cleanup begins its showdown.
 */
export function applyControlCleanupStep(
  io: ControlIO,
  opts: { readonly killedThisPass?: number } = {},
): boolean {
  const draft = io.draft;
  const kind = cleanupStateKind(draft, opts);
  if (kind === "closed") {
    return false;
  }
  let changed = false;
  for (const [bfId, bf] of Object.entries(draft.battlefields ?? {})) {
    if (!bf?.controller) {
      continue;
    }
    if (isShowdownOrCombatOngoingAt(draft, bfId)) {
      continue;
    }
    const controllers = unitControllersAt(io, bfId);
    if (controllers.has(bf.controller as string)) {
      continue;
    }
    const soleOther = controllers.size === 1 && !bf.contested ? ([...controllers][0] as string) : undefined;
    if (soleOther !== undefined && kind === "neutral-open") {
      establishControl(io, bfId, soleOther, { fire: triggerContextOf(io) });
      changed = true;
      continue;
    }
    // rule 323.6 / 190.4.c — no unit of the controller here in an Open State.
    bf.controller = null;
    changed = true;
    if (soleOther !== undefined) {
      // rule 323.11.a / 190.3.a — units standing where their controller does not
      // control apply Contested; the Neutral Open Cleanup begins the showdown.
      stageContested(draft, bfId, soleOther);
    }
  }
  return changed;
}
