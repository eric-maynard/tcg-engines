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
import { runDieBatch } from "../abilities/die-replacement-batch";
import { recalculateStaticEffects } from "../abilities/static-abilities";
import { fireTriggers, type TriggerRunnerContext } from "../abilities/trigger-runner";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import { getDamage } from "../operations/damage-store";
import { collectAnyDamageLethalPlayers } from "../operations/lethal-damage";
import { combatRoleMightBonus } from "../operations/combat-role-might";
import { hiddenCapacityAt } from "../operations/hidden-capacity";
import {
  type LeaveResult,
  clearLKI,
  leaveBoard,
  recordDepartedOwner,
  snapshotBatch,
  snapshotLKI,
} from "../operations/leave-board";
import { checkVictory, scoreBattlefield, scoreEvents } from "../operations/points";
import type { PlayerId, RiftboundCardMeta, RiftboundGameState } from "../types";

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
export function performCleanup(ctx: CleanupContext): CleanupResult {
  const killed: string[] = [];
  const deaths: CleanupDeath[] = [];
  const hiddenRemoved: string[] = [];
  const combatPending: string[] = [];
  let stateChanged = false;

  // Step 0 — rule-id: 186.1: tokens that left the board cease to exist.
  if (sweepOffBoardTokens(ctx)) {
    stateChanged = true;
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
    }
  }
  // rule 428.1.a.1.b / 740.2.a — last-known information for every candidate,
  // taken while the whole simultaneous batch is still on the board.
  const preLKI = snapshotBatch(ctx, lethalIds);

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
      openPrompt.resume?.kind === "die-assign");
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
  clearLKI(
    ctx.draft,
    [...damagedIds, ...lethalIds].filter((id) => !killed.includes(id)),
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
    if (!bf?.contested || bf.showdownComplete || !bf.contestedBy) {
      continue;
    }
    // Only while a combat showdown is actually running here — a contested flag
    // alone can outlive the showdown that set it.
    const combatRunning = (ctx.draft.interaction?.showdownStack ?? []).some(
      (sd) => sd.active && sd.isCombatShowdown && sd.battlefieldId === bfId,
    );
    if (!combatRunning) {
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
    if (!bothSidesPresent) {
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

  // Step 5b: Return exile-tracked cards when the tracking card leaves the
  // Board (The Zero Drive). Equipment with `tracksExiledCards` stores each
  // Banished card's ID in `exiledByThis`. When the equipment is no longer
  // On the board (base / battlefield), all tracked cards are played back to
  // Their owner's base and the list is cleared.
  const offBoardZoneIds: string[] = ["trash", "banishment", "hand", "mainDeck"];
  const scannedTrackers = new Set<string>();
  for (const zoneId of offBoardZoneIds) {
    const cardsInZone = ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    for (const cardId of cardsInZone) {
      const key = cardId as string;
      if (scannedTrackers.has(key)) {
        continue;
      }
      scannedTrackers.add(key);
      const def = registry.get(key);
      if (def?.tracksExiledCards !== true) {
        continue;
      }
      const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      const tracked = meta?.exiledByThis ?? [];
      if (tracked.length === 0) {
        continue;
      }
      for (const exiledId of tracked) {
        ctx.zones.moveCard({
          cardId: exiledId as CoreCardId,
          targetZoneId: "base" as CoreZoneId,
        });
      }
      ctx.cards.updateCardMeta(cardId, {
        exiledByThis: undefined,
      } as Partial<RiftboundCardMeta>);
      stateChanged = true;
    }
  }

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

  // Step 6: Battlefield control + combat staging (rules 323.6, 323.13)
  for (const [bfId, bf] of Object.entries(ctx.draft.battlefields)) {
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const unitsAtBf = ctx.zones.getCardsInZone(bfZoneId);

    // Rule 323.6: a player loses control of a Battlefield they control if
    // they no longer have a Unit at that Battlefield — but only during an
    // Open State (no chain, no showdown; rule 190.4.c). Pending items keep
    // the chain closed so a unit banished-then-replayed by a spell keeps its
    // battlefield controlled through the sequence.
    // rule-id: ogn-276-298-arcane-shift-replay-keeps-control — an outstanding
    // pendingChoice (e.g. the replayed unit's choose-destination) means the
    // last chain item has not finished resolving, so the state is still
    // Closed even though the chain itself has emptied.
    // rule 309.1 / 190.4.c — units reaped in THIS pass have not had their `die`
    // event dispatched yet, so the Deathknell / dies-triggers they generate are
    // not on the chain when step 6 runs. Those pending items keep the turn in a
    // Closed State, so defer the 323.6 check to the next maintenance pass (the
    // runner always makes one after a pass that killed something).
    // rule-id: sfd-165-221 (Glasc Mixologist) — his Deathknell may play a unit
    // back to the battlefield he just died at, which requires that battlefield
    // to still be controlled by his controller.
    const isOpenState =
      !ctx.draft.interaction?.chain?.active &&
      (ctx.draft.interaction?.showdownStack?.length ?? 0) === 0 &&
      !ctx.draft.pendingChoice &&
      killed.length === 0;
    if (bf.controller) {
      // rule 323.6 / 127.1: "have a Unit there" follows CONTROL, not ownership — a unit
      // stolen by e.g. Hostile Takeover holds the battlefield for its new controller.
      const controllerOf = (id: CoreCardId) =>
        ctx.cards.getCardController?.(id) ?? ctx.cards.getCardOwner(id);
      const unitControllers = new Set<string>();
      for (const id of unitsAtBf) {
        if (registry.getCardType(id as string) !== "unit") {
          continue;
        }
        const c = controllerOf(id);
        if (c) {
          unitControllers.add(c);
        }
      }
      if (unitControllers.has(bf.controller)) {
        // rule 190.4.a — control rests on the controller's units being here. Recorded in
        // every state (not just Open ones) so a unit that arrives and leaves inside one
        // closed window still arms the 323.6 vacancy check below.
        bf.controllerOccupied = true;
      } else if (isOpenState) {
        // rule 190.3.a: a unit that "otherwise becomes present" (a control change, no move)
        // at a battlefield its controller doesn't control contests it. With no other enemy
        // units there the showdown is non-combat and settles straight into a conquer.
        if (unitControllers.size === 1 && !bf.contested) {
          const conqueror = [...unitControllers][0] as string;
          conquerByPresence(ctx, bfId, conqueror);
          stateChanged = true;
        } else if (bf.controllerOccupied) {
          // rule 323.6 / 190.4.c — control is lost in cleanup once the controller's
          // units are gone. Control that never rested on a unit here (a seeded board
          // state, or control handed over by an effect) has nothing to vacate, so it
          // survives until a unit of the controller occupies and then leaves it —
          // otherwise the first cleanup after any action silently wiped it.
          bf.controller = null;
          bf.controllerOccupied = false;
          stateChanged = true;
        }
      }
    }

    if (unitsAtBf.length < 2) {
      continue;
    }

    // rules 181/182 / 323.2.b — two SIDES make a battlefield contested, and a
    // side is a controller: a stolen unit standing among its owner's units is
    // the thief's presence there.
    const sides = new Set<string>();
    for (const unitId of unitsAtBf) {
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
 * rule 190.3.a / 630.1 — the sole player with units at a battlefield they don't control takes
 * it and scores, exactly as a non-combat showdown close would.
 */
function conquerByPresence(ctx: CleanupContext, bfId: string, playerId: string): void {
  const draft = ctx.draft;
  const bf = draft.battlefields[bfId];
  if (!bf) {
    return;
  }
  const previousController = bf.controller;
  bf.controller = playerId;
  bf.contested = false;
  bf.contestedBy = undefined;
  const zonesAny = ctx.zones as unknown as Partial<TriggerRunnerContext["zones"]>;
  const countersAny = ctx.counters as unknown as Partial<TriggerRunnerContext["counters"]>;
  const noop = () => {};
  const zones = {
    drawCards: zonesAny.drawCards ?? noop,
    getCardZone: zonesAny.getCardZone,
    getCardsInZone: ctx.zones.getCardsInZone,
    moveCard: ctx.zones.moveCard,
  };
  const { isScore } = scoreBattlefield(
    draft,
    playerId as PlayerId,
    bfId,
    "conquer",
    { cards: ctx.cards, zones },
    { previousController },
  );
  // rule 471.2.a — it is a Conquer like any other, so its Conquer / "when an
  // opponent scores" abilities trigger (real contexts carry the counter ops;
  // stripped test stubs fall back to no-ops).
  if (isScore) {
    const triggerCtx: TriggerRunnerContext = {
      cards: ctx.cards,
      counters: {
        addCounter: countersAny.addCounter ?? noop,
        clearCounter: ctx.counters.clearCounter,
        removeCounter: countersAny.removeCounter,
        setFlag: ctx.counters.setFlag,
      },
      draft,
      zones,
    };
    for (const event of scoreEvents(playerId as PlayerId, bfId, "conquer", { previousController })) {
      fireTriggers(event, triggerCtx);
    }
  }
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
