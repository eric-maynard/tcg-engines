/**
 * State-Based Checks & Cleanup
 *
 * Implements rules 518-526: automatic game state corrections that occur
 * after chain resolution, movement, showdowns, and combat.
 *
 * Cleanup steps (rule 519):
 * 1. Kill units with damage >= might (rule 520)
 * 2. Remove stale combat roles (rule 521)
 * 3. Execute state-based effects — "while"/"as long as" conditions (rule 522)
 * 4. Remove orphaned hidden cards (rule 523)
 * 5. Mark combat as pending where opposing units meet (rule 524)
 *
 * This function is designed to be called after any state mutation:
 * - After a chain item resolves
 * - After a move completes
 * - After a showdown completes
 * - After combat completes
 * - At end of turn (ending phase)
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { hasPayableOptionalShield, runDieBatch } from "../abilities/die-replacement-batch";
import { recalculateStaticEffects } from "../abilities/static-abilities";
import { fireTriggers, type TriggerRunnerContext } from "../abilities/trigger-runner";
import { isResolvingChainItem, noteOutstandingCleanup } from "../chain/resolution-guard";
import { isPresenceUnit } from "../operations/arrive-at-battlefield";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import { getDamage } from "../operations/damage-store";
import { collectAnyDamageLethalPlayers } from "../operations/lethal-damage";
import { combatRoleMightBonus } from "../operations/combat-role-might";
import { flushPendingCombatDesignations } from "../operations/combat-designations";
import { hiddenCapacityAt } from "../operations/hidden-capacity";
import {
  type LKISnapshot,
  type LeaveResult,
  clearLKI,
  getLKI,
  leaveBoard,
  recordDepartedOwner,
  snapshotBatch,
  snapshotLKI,
} from "../operations/leave-board";
import { applyControlCleanupStep } from "../operations/battlefield-control";
import { checkVictory } from "../operations/points";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

// The die choke point owns replacement application; kept importable from here.
export { applyDieReplacement } from "../operations/leave-board";

/**
 * Context needed for state-based checks.
 * Passed from move reducers or flow hooks.
 */
export interface CleanupContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void;
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    removeCardFromGame?: (params: { cardId: CoreCardId }) => void;
  };
  readonly cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
    setCardController?: (cardId: CoreCardId, controllerId: CorePlayerId) => void;
    updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
  readonly counters: {
    getCounter: (cardId: CoreCardId, counter: string) => number;
    clearCounter: (cardId: CoreCardId, counter: string) => void;
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
  };
}

/** Non-board zones a token can be sent to (kill, recall, banish, recycle). */
const TOKEN_SWEEP_ZONE_IDS: readonly string[] = ["trash", "banishment", "hand", "mainDeck"];

/**
 * rule-id: 186.1 — a token in a non-board zone ceases to exist. Runs at the
 * start of a cleanup pass so a token killed in the previous pass (or by a
 * kill effect) has already had its `die` event dispatched before removal.
 */
function sweepOffBoardTokens(ctx: CleanupContext): boolean {
  const remove = ctx.zones.removeCardFromGame;
  if (!remove) {
    return false;
  }
  let removed = false;
  const registry = getGlobalCardRegistry();
  // Trash/hand/deck are per-player zones: a zone read without an owner misses
  // their contents, so sweep each player's copy as well as the bare zone id.
  const owners: (CorePlayerId | undefined)[] = [
    undefined,
    ...Object.keys(ctx.draft.players ?? {}).map((p) => p as CorePlayerId),
  ];
  for (const zoneId of TOKEN_SWEEP_ZONE_IDS) {
    for (const owner of owners) {
      for (const cardId of ctx.zones.getCardsInZone(zoneId as CoreZoneId, owner)) {
        if (registry.isToken(cardId as string)) {
          recordDepartedOwner(ctx.draft, cardId as string, ctx.cards.getCardOwner?.(cardId) ?? owner);
          remove({ cardId });
          removed = true;
        }
      }
    }
  }
  return removed;
}

/**
 * rule 428.5.c: a lethal-damage kill — the `leaveBoard` result whose LKI
 * snapshot (taken before the meta wipe) feeds the `die` event.
 */
export type CleanupDeath = LeaveResult;

export interface CleanupResult {
  /** Card IDs of units killed by damage >= might */
  readonly killed: string[];
  /** Same kills as `killed`, as leave-board results carrying the LKI for the `die` event */
  readonly deaths?: CleanupDeath[];
  /** Card IDs of hidden cards removed */
  readonly hiddenRemoved: string[];
  /** Battlefield IDs where combat is now pending */
  readonly combatPending: string[];
  /** Whether any state changes occurred (may need to re-run) */
  readonly stateChanged: boolean;
}

/**
 * Trigger-runner context built from a cleanup context. Stripped test stubs may
 * omit the optional counter/zone ops, so they fall back to no-ops.
 */
function cleanupTriggerContext(ctx: CleanupContext): TriggerRunnerContext {
  const zonesAny = ctx.zones as unknown as Partial<TriggerRunnerContext["zones"]>;
  const countersAny = ctx.counters as unknown as Partial<TriggerRunnerContext["counters"]>;
  const noop = () => {};
  return {
    cards: ctx.cards,
    counters: {
      addCounter: countersAny.addCounter ?? noop,
      clearCounter: ctx.counters.clearCounter,
      removeCounter: countersAny.removeCounter,
      setFlag: ctx.counters.setFlag,
    },
    draft: ctx.draft,
    zones: {
      drawCards: zonesAny.drawCards ?? noop,
      getCardZone: zonesAny.getCardZone,
      getCardsInZone: ctx.zones.getCardsInZone,
      moveCard: ctx.zones.moveCard,
    },
  } as TriggerRunnerContext;
}

/**
 * Run all state-based checks and cleanup (rules 518-526).
 *
 * Returns what changed so callers can fire appropriate triggers.
 */
export interface CleanupOptions {
  /**
   * rule 321 / 323.5 — run only the DAMAGE-TIME pass: consult costed "you may
   * pay … instead" shields (ogn-269-298 The Boss) for units that damage has
   * just made lethal and stop there. NOTHING dies and no death-class
   * replacement ("if this would die": Zhonya's Hourglass, Guardian Angel,
   * Highlander) is consulted — those belong to the single Cleanup that follows
   * the resolving item, so no death check runs between two damage instances of
   * one item.
   */
  readonly shieldsOnly?: boolean;
  /**
   * rule 319.2 vs 323.6 — skip step 6's battlefield-control lapse. The Cleanup
   * a PHASE TRANSITION makes outstanding runs the death check (323.5) but must
   * not re-time control: control is modelled off the game actions that empty a
   * battlefield, and seeded/left-over control is only re-read by the Cleanups
   * those actions produce.
   */
  readonly skipControlStep?: boolean;
}

export function performCleanup(ctx: CleanupContext, opts: CleanupOptions = {}): CleanupResult {
  const killed: string[] = [];
  const deaths: CleanupDeath[] = [];
  const hiddenRemoved: string[] = [];
  const combatPending: string[] = [];
  let stateChanged = false;

  // Step 0 — rule-id: 186.1: tokens that left the board cease to exist.
  if (sweepOffBoardTokens(ctx)) {
    stateChanged = true;
  }

  // Step 0b — rule 466.7 / 807.1.d.1: a combat parks its Cleanup while the
  // triggers it produced are on the chain, so the Attacker/Defender designation
  // (and with it [Assault] / [Shield] Might and "this combat" effects) is still
  // real for anything played in response. Run it now that the chain has drained.
  if (flushPendingCombatDesignations(ctx.draft, ctx.cards as never)) {
    stateChanged = true;
  }

  // Step 0c — rule 522 / 142.4.b: continuous effects are always applied, so the
  // lethal check below must read a Might that already accounts for everything
  // the preceding game action changed (a resolving spell reaching the trash
  // raises Dr. Mundo's trash-count Might before its own damage is checked —
  // ruling d34bdb4129a3eb07). Step 3 re-runs this after the kills, for the
  // statics the deaths themselves invalidate.
  if (recalculateStaticEffects({ cards: ctx.cards, draft: ctx.draft, zones: ctx.zones })) {
    stateChanged = true;
  }

  // rule 321 / 321.1 — WHEN the numbered Cleanup Tasks of rule 323 may run. A
  // Cleanup cannot occur while a Chain Item is Resolving; one that qualifies
  // during a resolution becomes an Outstanding Task and is performed the moment
  // that resolution ends (`moves/chain/resolve.ts`). That is the ONE condition:
  // a Closed State does NOT defer a Cleanup — 309.1 makes it merely "a Chain
  // exists" and 320.1 describes a Cleanup running with items on the Chain — so a
  // queued trigger never holds a step off; only the steps 323 itself conditions
  // on an Open State (323.6, 323.12, 323.13) sit out, via `cleanupStateKind`. See
  // `chain/resolution-guard.ts` for the reading and the two tests that pin it.
  // Steps 0-0c above are not Cleanup Tasks: rule 522's continuous effects are
  // ALWAYS applied, and the token / designation bookkeeping that feeds them has
  // to stay in step with the board a resolving item is changing.
  // `shieldsOnly` is exempt by construction too — it is not a Cleanup but the
  // damage-time shield pass owed BETWEEN two damage instances of the one
  // resolving item (see CleanupOptions).
  if (opts.shieldsOnly !== true && isResolvingChainItem()) {
    noteOutstandingCleanup();
    return { combatPending, hiddenRemoved, killed, stateChanged };
  }

  // Step 1: Kill units with damage >= might (rule 520)
  const registry = getGlobalCardRegistry();
  const allBoardZones = getBoardZoneIds(ctx);

  // Snapshot all board cards first (so removals don't affect iteration)
  const boardCards: { cardId: CoreCardId; zoneId: string }[] = [];
  for (const zoneId of allBoardZones) {
    const cardsInZone = ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    for (const cardId of cardsInZone) {
      boardCards.push({ cardId, zoneId });
    }
  }

  // rule 142.4.c — a board static may lower the lethal-damage value of the
  // units it describes for damage dealt by its controller (Elder Dragon:
  // "Any amount of your damage is enough to kill enemy units"). Collect the
  // players whose damage is lethal at any amount; the source must still be on
  // the board (rule 364), which is why this is rebuilt every cleanup pass.
  const anyDamageLethalPlayers = collectAnyDamageLethalPlayers(ctx);

  // rule 370.1.a.2 / 370.4: deaths found in one cleanup pass are simultaneous —
  // collect every lethally damaged unit BEFORE any replacement or kill runs.
  const damagedIds: string[] = [];
  const lethalIds: string[] = [];
  for (const { cardId } of boardCards) {
    const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
    const damage = getDamage(ctx, cardId as string);

    if (damage <= 0) {
      continue;
    }
    damagedIds.push(cardId as string);

    // Look up base might from card definition
    const def = registry.get(cardId as string);
    const baseMight = def?.might ?? 0;

    // Only units have might — skip non-units. rule 142.4.b: a printed-0-Might
    // unit is still a unit (any non-zero damage is lethal to it), so printed
    // Might alone can't decide this.
    const cardType = registry.getCardType(cardId as string);
    if (cardType !== undefined ? cardType !== "unit" : baseMight <= 0) {
      continue;
    }

    // rule-id: ogs-002-024 — lethal check compares damage against the unit's
    // *effective* Might (base + buffs + modifiers + static + equipment), not
    // the printed value, so a +2 Mech with 3 base Might survives 3 damage.
    let equipBonus = 0;
    for (const equipId of meta?.equippedWith ?? []) {
      equipBonus += registry.getMightBonus(equipId as string);
    }
    // rule 814.1.c / 432.1.a — Shield (defender) and Assault (attacker) are real
    // Might while the role is stamped, so damage from ANY source — including a
    // spell resolving mid-combat — is measured against the raised value.
    const roleBonus = combatRoleMightBonus(cardId as string, meta);
    // rule 323.5 — lethal damage is re-evaluated against a set base Might.
    const effectiveMight = Math.max(
      0,
      ((meta as Partial<RiftboundCardMeta> | undefined)?.baseMightOverride ?? baseMight) +
        (meta?.buffed ? 1 : 0) +
        (meta?.extraBuffs ?? 0) +
        (meta?.mightModifier ?? 0) +
        (meta?.staticMightBonus ?? 0) +
        equipBonus +
        roleBonus,
    );

    // rule 142.4.c — the modifier only applies to damage its controller dealt,
    // and only to units that are enemies of that controller.
    const damager = meta?.lastDamagedBy as string | undefined;
    const victimController = (ctx.cards.getCardController?.(cardId) ??
      ctx.cards.getCardOwner(cardId)) as string | undefined;
    const anyDamageIsLethal =
      damager !== undefined &&
      damager !== victimController &&
      anyDamageLethalPlayers.has(damager);

    // rule 142.4.b: lethal damage is NON-ZERO damage at least equal to Might —
    // an undamaged 0-Might unit is alive.
    if ((damage > 0 && damage >= effectiveMight) || anyDamageIsLethal) {
      lethalIds.push(cardId as string);
    } else if (meta?.lastDamagedBy !== undefined && meta.killCreditStale !== true) {
      // rule 383.2.c.1 — the unit survived this pass, so its marked damage did
      // not kill it. If a later Might reduction finishes it off, that old spell
      // gets no "you kill a unit with a spell" credit (ruling 46208875b334d665).
      ctx.cards.updateCardMeta(cardId, { killCreditStale: true } as Partial<RiftboundCardMeta>);
    }
  }
  // rule 428.1.a.1.b / 740.2.a — last-known information for every candidate,
  // taken while the whole simultaneous batch is still on the board.
  // rule 323.4 / 808.1.d.3 — Deathknell information is noted at Cleanup step 3a,
  // BEFORE anything leaves in step 3b: when the batch was suspended on a costed
  // shield (371.2) and a batch-mate has since been saved and recalled, the
  // survivor still counts as "here" for "I didn't die alone" (383.2.a.1). Carry
  // the batch's original board picture over the re-snapshot.
  const noted = new Map<string, { unitsHere: LKISnapshot["unitsHere"]; wasAlone: boolean }>();
  for (const id of lethalIds) {
    const prev = getLKI(ctx.draft, id);
    if (prev !== undefined) {
      noted.set(id, { unitsHere: prev.unitsHere, wasAlone: prev.wasAlone });
    }
  }
  const preLKI = snapshotBatch(ctx, lethalIds);
  for (const [id, keep] of noted) {
    const fresh = preLKI.get(id);
    if (fresh === undefined) {
      continue;
    }
    const merged = { ...fresh, unitsHere: keep.unitsHere, wasAlone: keep.wasAlone };
    preLKI.set(id, merged);
    const lkiBag = (ctx.draft as { lki?: Record<string, LKISnapshot> }).lki;
    if (lkiBag !== undefined) {
      lkiBag[id] = merged;
    }
  }

  // rules 370–373 — die replacements for the whole batch: optional shields
  // asked (371.2), several replacements on one death ordered by its controller
  // (372), a self-spending replacement matching several deaths assigned by ITS
  // controller (373); replaced deaths never happen (370.1.a.1 / 808.1.d.1).
  // While one of those questions — or a suspended costed shield — is open the
  // batch waits: nothing dies yet (370.1.c / 373.1.a).
  const openPrompt = ctx.draft.pendingChoice as
    | { type?: string; suspendedDeathCardId?: string; resume?: { kind?: string } }
    | undefined;
  const batchWaiting =
    openPrompt !== undefined &&
    ((openPrompt.type === "opt-in" && openPrompt.suspendedDeathCardId !== undefined) ||
      openPrompt.resume?.kind === "die-order" ||
      openPrompt.resume?.kind === "die-batch-order" ||
      openPrompt.resume?.kind === "die-assign" ||
      // rule 371.2 — a payable OPTIONAL costed shield ("you may pay [fury] …
      // instead") has to be ASKED, and only one pendingChoice slot exists: with
      // an unrelated prompt open (Dancing Grenade's replay opt-in) the batch used
      // to spend the power silently. Wait instead — `postChoiceCleanup` re-runs
      // the checks once that prompt is answered. Deaths with no such shield still
      // happen now, so nothing else is deferred.
      hasPayableOptionalShield(ctx, lethalIds));
  if (opts.shieldsOnly === true) {
    // rule 321 / 323.5 — between two damage instances of one resolving item:
    // offer the damage-time shields and leave every lethal unit standing.
    if (lethalIds.length > 0 && !batchWaiting) {
      const outcome = runDieBatch(ctx, lethalIds, { canPrompt: true, shieldsOnly: true });
      if (outcome.suspended || outcome.replaced.length > 0) {
        stateChanged = true;
      }
    }
    return { combatPending, hiddenRemoved, killed, stateChanged };
  }
  if (lethalIds.length > 0 && !batchWaiting) {
    const outcome = runDieBatch(ctx, lethalIds, { canPrompt: true });
    if (outcome.suspended || outcome.replaced.length > 0) {
      stateChanged = true;
    }
    if (!outcome.suspended) {
      // rule 428.1.a.2 / 373.1.a — Passive Kill of every unreplaced unit, as ONE
      // simultaneous batch: the choke point detaches Equipment (457.1), trashes
      // the unit and resets it as a new object (124.1); the `die` events for
      // this pass's batch are published by the caller.
      for (const cardId of outcome.dying) {
        const death = leaveBoard(
          ctx,
          cardId,
          "trash",
          { kind: "sba" },
          { lki: preLKI.get(cardId) ?? snapshotLKI(ctx, cardId), replacements: "skip" },
        );
        if (!death.left) {
          continue;
        }
        deaths.push(death);
        killed.push(cardId);
        stateChanged = true;
      }
    }
  }
  // Survivors of this pass keep no LKI entry; the batch's own entries stay
  // until its `die` events have been published by the caller.
  // rule 323.4 — a batch still waiting on a shield answer has NOT reached step
  // 3b yet, so its members keep the information noted at 3a.
  const pendingBatch = ctx.draft.dieBatch;
  const stillWaiting = new Set<string>(
    pendingBatch === undefined
      ? []
      : [...pendingBatch.queue, ...pendingBatch.dying, ...pendingBatch.replaced],
  );
  clearLKI(
    ctx.draft,
    [...damagedIds, ...lethalIds].filter((id) => !killed.includes(id) && !stillWaiting.has(id)),
  );

  // Step 2: Remove stale combat roles (rule 521)
  // Units not at a battlefield where combat is occurring lose their combat role
  for (const zoneId of allBoardZones) {
    const cardsInZone = ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    const isBattlefield = (zoneId as string).startsWith("battlefield-");

    for (const cardId of cardsInZone) {
      const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      if (meta?.combatRole && !isBattlefield) {
        ctx.cards.updateCardMeta(cardId, {
          combatRole: null,
        } as Partial<RiftboundCardMeta>);
        stateChanged = true;
      }
    }

    // rule 464.2.c.3.a: a unit that becomes present at a battlefield during an
    // ongoing combat gains Attacker/Defender at the next cleanup.
    if (!isBattlefield) {
      continue;
    }
    const bfId = (zoneId as string).slice("battlefield-".length);
    const bf = ctx.draft.battlefields[bfId];
    // rule 466.2 / 323.6 — the Combat Damage Step ran and the combat is parked
    // while the items it produced resolve. The combat is still ongoing there,
    // so a unit that arrives in that window is designated at the next Cleanup
    // (323.2.a) even though the Showdown itself has already closed.
    const deferredResult = bf?.combatDamageDone === true;
    if (!bf?.contested || (bf.showdownComplete && !deferredResult) || !bf.contestedBy) {
      continue;
    }
    // Only while a combat showdown is actually running here — a contested flag
    // alone can outlive the showdown that set it.
    const combatRunning = (ctx.draft.interaction?.showdownStack ?? []).some(
      (sd) => sd.active && sd.isCombatShowdown && sd.battlefieldId === bfId,
    );
    if (!combatRunning && !deferredResult) {
      continue;
    }
    const units = cardsInZone.filter((id) => registry.getCardType(id as string) === "unit");
    const attackerSide = bf.contestedBy;
    // rules 181/182 / 323.2.b / 464.2 — a unit fights for its CONTROLLER: a
    // stolen unit joins the thief's side even while standing among the units
    // of the player who still owns it.
    const sideOf = (id: CoreCardId): string | undefined =>
      ctx.cards.getCardController?.(id) ?? ctx.cards.getCardOwner(id);
    // rule 323.2.b — designation follows the CONTROLLER: a unit that changed
    // hands mid-combat swaps Attacker↔Defender at this cleanup, even when its
    // new side is now the only one present at the battlefield.
    for (const cardId of units) {
      const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      if (!meta?.combatRole) {
        continue;
      }
      const role = sideOf(cardId) === attackerSide ? "attacker" : "defender";
      if (meta.combatRole !== role) {
        ctx.cards.updateCardMeta(cardId, { combatRole: role } as Partial<RiftboundCardMeta>);
        stateChanged = true;
      }
    }
    const bothSidesPresent =
      units.some((id) => sideOf(id) === attackerSide) &&
      units.some((id) => sideOf(id) !== attackerSide);
    // rule 323.2.a — in the deferred Resolution Step the combat is ongoing no
    // matter who is left standing (the other side may have died in the damage
    // step), so a newcomer is still designated.
    if (!bothSidesPresent && !deferredResult) {
      continue;
    }
    for (const cardId of units) {
      const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      if (meta?.combatRole) {
        continue;
      }
      const side = sideOf(cardId);
      const role = side === attackerSide ? "attacker" : "defender";
      ctx.cards.updateCardMeta(cardId, {
        combatRole: role,
      } as Partial<RiftboundCardMeta>);
      stateChanged = true;
      // rule 383.4.e — gaining the designation IS attacking/defending, so the
      // unit's attack/defend triggers fire right here, exactly as they do when
      // the Combat Showdown opens.
      fireTriggers(
        {
          alone: units.filter((id) => sideOf(id) === side).length === 1,
          battlefieldId: bfId,
          cardId,
          owner: side,
          type: role === "attacker" ? "attack" : "defend",
        } as never,
        cleanupTriggerContext(ctx),
      );
    }
  }

  // Step 3: Recalculate static/passive ability effects (rule 522)
  // Strip and re-apply all "While X" / "As long as" continuous effects
  if (recalculateStaticEffects({ cards: ctx.cards, draft: ctx.draft, zones: ctx.zones })) {
    stateChanged = true;
  }

  // Step 4: Remove orphaned hidden cards (rule 323.7 / 107.3.d)
  // A Facedown Zone belongs to the battlefield's CONTROLLER: a card there is
  // trashed only once its owner stops controlling that battlefield. Losing the
  // last unit there is not itself enough — control only changes in an Open
  // State (step 6 / rule 190.4.b), so a defender whose last unit dies mid-combat
  // keeps its facedown card and may still play it.
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const facedownZoneId = `facedown-${bfId}` as CoreZoneId;

    const hiddenCards = ctx.zones.getCardsInZone(facedownZoneId);
    if (hiddenCards.length === 0) {
      continue;
    }

    const bfController = ctx.draft.battlefields[bfId]?.controller ?? null;

    for (const hiddenCardId of hiddenCards) {
      const hiddenOwner =
        ctx.cards.getCardController?.(hiddenCardId) ?? ctx.cards.getCardOwner(hiddenCardId) ?? "";

      if (bfController !== hiddenOwner) {
        // Remove hidden card to trash
        ctx.zones.moveCard({
          cardId: hiddenCardId,
          targetZoneId: "trash" as CoreZoneId,
        });
        ctx.cards.updateCardMeta(hiddenCardId, {
          hidden: false,
          hiddenAt: undefined,
        } as Partial<RiftboundCardMeta>);
        hiddenRemoved.push(hiddenCardId as string);
        stateChanged = true;
      }
    }
  }

  // Step 4b: rule 107.3.b.2 / 421.4 — a Facedown Zone holding more cards than
  // its (now reduced) maximum is trimmed immediately: the zone's CONTROLLER
  // chooses which card to trash, and the trashed card is revealed. One prompt
  // at a time; the check re-runs after each answer until the zone fits.
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    if (ctx.draft.pendingChoice) {
      break;
    }
    const hiddenCards = ctx.zones.getCardsInZone(`facedown-${bfId}` as CoreZoneId);
    if (hiddenCards.length < 2) {
      continue;
    }
    const bfController = ctx.draft.battlefields[bfId]?.controller ?? null;
    if (bfController === null) {
      continue;
    }
    if (hiddenCards.length <= hiddenCapacityAt(ctx.draft, bfController, bfId, ctx)) {
      continue;
    }
    ctx.draft.pendingChoice = {
      effect: { type: "trash-facedown" },
      options: [...hiddenCards] as CoreCardId[],
      playerId: bfController,
      remaining: 1,
      sourceCardId: hiddenCards[0],
      type: "choose-target",
    } as typeof ctx.draft.pendingChoice;
    stateChanged = true;
  }

  // Step 4c — rule 719.3.a: "When the Top-Most Card changes locations, all
  // Attached cards change locations with it." Movers relocate the host only
  // (swaps, effect moves, standard moves), so the Equipment is dragged along
  // here rather than in every mover. Runs before the loose-gear recall below,
  // which skips Equipment whose host is on the board.
  for (const zoneId of getBoardZoneIds(ctx)) {
    for (const hostId of ctx.zones.getCardsInZone(zoneId as CoreZoneId)) {
      const hostMeta = ctx.cards.getCardMeta(hostId) as Partial<RiftboundCardMeta> | undefined;
      for (const equipId of hostMeta?.equippedWith ?? []) {
        const equipZone = ctx.zones.getCardZone?.(equipId as CoreCardId) as string | undefined;
        const equipOnBoard = equipZone === "base" || equipZone?.startsWith("battlefield-") === true;
        if (equipOnBoard && equipZone !== zoneId) {
          ctx.zones.moveCard({ cardId: equipId as CoreCardId, targetZoneId: zoneId as CoreZoneId });
          stateChanged = true;
        }
      }
    }
  }

  // Step 5: Auto-recall gear from battlefields to base (rule 518)
  // rule 811.1.d.1 / 811.1.d.1.a / 152.2 (sfd-139-221 Edge of Night) — a gear
  // played from [Hidden] is played TO the battlefield it was hidden at, and its
  // own play trigger attaches it to a unit "here" (811.1.d.2). That trigger has
  // to find it AT the battlefield, so the recall waits while an unresolved Chain
  // item sourced from this gear is still pending; a gear with nothing of its own
  // on the Chain is recalled by this Cleanup as before (319.6 / 518).
  const gearWithPendingItem = new Set(
    (ctx.draft.interaction?.chain?.items ?? [])
      .filter((it) => it.triggered === true && it.countered !== true)
      .map((it) => it.cardId),
  );
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const cardsAtBf = ctx.zones.getCardsInZone(bfZoneId);

    for (const cardId of cardsAtBf) {
      const def = registry.get(cardId as string);
      // Only auto-recall gear/equipment (never units)
      if (def?.cardType !== "gear" && def?.cardType !== "equipment") {
        continue;
      }
      const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      if (meta?.attachedTo) {
        // rule 457.1 / 323.7: once its host leaves the board the Equipment is
        // loose at the battlefield — detach it and recall it to base. Any
        // removal path (kill effect, bounce, banish) can orphan it, so the
        // check lives here rather than in each remover.
        const hostZone = ctx.zones.getCardZone?.(meta.attachedTo as CoreCardId) as
          | string
          | undefined;
        const hostOnBoard = hostZone === "base" || hostZone?.startsWith("battlefield-") === true;
        if (hostOnBoard) {
          continue;
        }
        ctx.cards.updateCardMeta(cardId, {
          attachedTo: undefined,
        } as Partial<RiftboundCardMeta>);
        stateChanged = true;
      }
      if (gearWithPendingItem.has(cardId as string)) {
        continue;
      }
      // rule 435.4.a / 318: an Equipment detached from a unit AT a battlefield
      // is present at that battlefield, so this Cleanup recalls it to base —
      // exactly like any other loose gear (rule 518).
      ctx.zones.moveCard({
        cardId,
        targetZoneId: "base" as CoreZoneId,
      });
      stateChanged = true;
    }
  }

  // (Step 5b removed) rule 397 — releasing the cards banished WITH a tracker
  // is the tracker's own ability ("Play all units banished with this"), not a
  // state-based action: The Zero Drive plays them from its activated ability,
  // so a Cleanup must never move them on its own.

  // Step 5c — rule-id: sfd-109-221 (Akshan "You control it until I leave the
  // board"): re-layer control-changing effects. Entries whose source left the
  // board expire; the latest surviving entry sets the controller, and with
  // none left the permanent reverts to its owner.
  if (ctx.cards.setCardController) {
    const liveBoard = new Set<string>();
    for (const zoneId of getBoardZoneIds(ctx)) {
      for (const id of ctx.zones.getCardsInZone(zoneId as CoreZoneId)) {
        liveBoard.add(id as string);
      }
    }
    for (const id of liveBoard) {
      const cardId = id as CoreCardId;
      const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      const effects = meta?.controlEffects;
      if (!effects || effects.length === 0) {
        continue;
      }
      const surviving = effects.filter(
        (e) => e.sourceCardId === undefined || liveBoard.has(e.sourceCardId),
      );
      if (surviving.length !== effects.length) {
        ctx.cards.updateCardMeta(cardId, {
          controlEffects: surviving.length > 0 ? surviving : undefined,
        } as Partial<RiftboundCardMeta>);
        stateChanged = true;
      }
      const desired =
        surviving[surviving.length - 1]?.controllerId ?? ctx.cards.getCardOwner(cardId);
      const current = ctx.cards.getCardController?.(cardId) ?? ctx.cards.getCardOwner(cardId);
      if (desired && desired !== current) {
        ctx.cards.setCardController(cardId, desired as CorePlayerId);
        stateChanged = true;
      }
    }
  }

  // Step 6: Battlefield control (rule 323.6 — the ONE model lives in
  // `operations/battlefield-control.ts`: control lapses in an Open-State Cleanup
  // when the controller has no unit here and no Showdown / Combat is ongoing
  // HERE; a Closed State — chain item, pending trigger, the `die` triggers of
  // units reaped in this very pass — keeps it) + combat staging (323.13).
  if (!opts.skipControlStep && applyControlCleanupStep(ctx, { killedThisPass: killed.length })) {
    stateChanged = true;
  }
  for (const [bfId, bf] of Object.entries(ctx.draft.battlefields)) {
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const unitsAtBf = ctx.zones.getCardsInZone(bfZoneId);

    if (unitsAtBf.length < 2) {
      continue;
    }

    // rules 181/182 / 323.2.b — two SIDES make a battlefield contested, and a
    // side is a controller: a stolen unit standing among its owner's units is
    // the thief's presence there.
    // rule 190.3 / 323.6 — only UNITS are a presence: an Equipment the opponent
    // controls, riding along on someone else's unit (718.5.e), is not a side.
    const sides = new Set<string>();
    for (const unitId of unitsAtBf) {
      if (!isPresenceUnit(unitId as string)) {
        continue;
      }
      const side =
        (ctx.cards.getCardController?.(unitId) ?? ctx.cards.getCardOwner(unitId)) ?? "";
      if (side) {
        sides.add(side);
      }
    }

    if (sides.size >= 2 && !bf.contested) {
      combatPending.push(bfId);
      stateChanged = true;
    }
  }

  // rule 472 / 323.1 — the victory check is a Cleanup task: the only place a
  // points win ends the game (no-op while a Chain Item is resolving, rule 321).
  checkVictory(ctx.draft, { io: ctx });

  return { combatPending, deaths, hiddenRemoved, killed, stateChanged };
}


/**
 * Run cleanup repeatedly until no more state changes occur.
 * This handles cascading effects (e.g., killing a unit triggers deathknell,
 * which deals damage, which kills another unit).
 *
 * Safety valve: max 10 iterations to prevent infinite loops.
 */
export function performFullCleanup(ctx: CleanupContext): CleanupResult {
  const allKilled: string[] = [];
  const allHiddenRemoved: string[] = [];
  const allCombatPending: string[] = [];

  for (let i = 0; i < 10; i++) {
    const result = performCleanup(ctx);
    allKilled.push(...result.killed);
    allHiddenRemoved.push(...result.hiddenRemoved);
    allCombatPending.push(...result.combatPending);

    if (!result.stateChanged) {
      break;
    }
  }

  return {
    combatPending: allCombatPending,
    hiddenRemoved: allHiddenRemoved,
    killed: allKilled,
    stateChanged:
      allKilled.length > 0 || allHiddenRemoved.length > 0 || allCombatPending.length > 0,
  };
}

/**
 * Get all zone IDs where cards could be on the board.
 */
function getBoardZoneIds(ctx: CleanupContext): string[] {
  const zones: string[] = ["base"];

  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    zones.push(`battlefield-${bfId}`);
  }

  return zones;
}
