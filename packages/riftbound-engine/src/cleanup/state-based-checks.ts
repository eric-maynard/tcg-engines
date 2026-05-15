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
import { checkReplacement, markReplacementConsumed } from "../abilities/replacement-effects";
import { recalculateStaticEffects } from "../abilities/static-abilities";
import { computeEffectiveMight, getGlobalCardRegistry } from "../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

/**
 * Context needed for state-based checks.
 * Passed from move reducers or flow hooks.
 */
export interface CleanupContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void;
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
  };
  readonly cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
  readonly counters: {
    getCounter: (cardId: CoreCardId, counter: string) => number;
    clearCounter: (cardId: CoreCardId, counter: string) => void;
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
  };
}

/**
 * Result of running state-based checks.
 */
export interface CleanupResult {
  /** Card IDs of units killed by damage >= might */
  readonly killed: string[];
  /** Card IDs of hidden cards removed */
  readonly hiddenRemoved: string[];
  /** Battlefield IDs where combat is now pending */
  readonly combatPending: string[];
  /** Whether any state changes occurred (may need to re-run) */
  readonly stateChanged: boolean;
}

/**
 * Run all state-based checks and cleanup (rules 518-526).
 *
 * Returns what changed so callers can fire appropriate triggers.
 */
export function performCleanup(ctx: CleanupContext): CleanupResult {
  const killed: string[] = [];
  const hiddenRemoved: string[] = [];
  const combatPending: string[] = [];
  let stateChanged = false;

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

  for (const { cardId } of boardCards) {
    const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
    // Rule 520: a unit dies when its marked damage >= its Might. Combat code
    // Historically writes damage to *both* `meta.damage` and the
    // `__counters.damage` bag, but spell/ability `damage` effects only update
    // The counter — so reading `meta.damage` alone missed spell kills. Take
    // The larger of the two so non-combat damage kills units (and fires their
    // `die` triggers via the caller's cleanup-and-fire-deaths pass).
    const metaDamage = meta?.damage ?? 0;
    const counterDamage = ctx.counters.getCounter?.(cardId, "damage") ?? 0;
    const damage = Math.max(metaDamage, counterDamage);

    if (damage <= 0) {
      continue;
    }

    // Rule 460.2.c.9 — "If a unit cannot be dealt damage, then no amount of
    // Damage can be considered lethal." A unit flagged `cannotTakeDamage`
    // (e.g. Kayn, Unleashed after moving twice) is never killed by marked
    // Damage; clear any stray damage so it doesn't re-check next pass.
    if (meta?.cannotTakeDamage === true) {
      ctx.cards.updateCardMeta(cardId, { damage: 0 } as Partial<RiftboundCardMeta>);
      ctx.counters.clearCounter(cardId, "damage");
      continue;
    }

    // Only cards that are units (have a base Might) can die from damage —
    // Skip everything else (gear, runes, spells in odd zones, …).
    const baseMight = registry.getMight(cardId as string);
    if (baseMight <= 0) {
      continue;
    }

    // Rule 323.5 / 140.x: a unit with non-zero marked Damage dies when that
    // Damage >= its *effective* Might — base Might plus the [+1] buff counter,
    // Runtime `mightModifier` deltas, `staticMightBonus` from static
    // Abilities, and any attached equipment's Might bonus. Reading `def.might`
    // Alone (the base) wrongly killed buffed units and wrongly spared
    // Might-reduced ones. A unit whose effective Might has been reduced to 0
    // (rule 143.2.b — treated as 0) dies to any non-zero damage.
    const effectiveMight = computeEffectiveMight(
      cardId as string,
      (id) => ctx.cards.getCardMeta(id as CoreCardId) as Partial<RiftboundCardMeta> | undefined,
      registry,
    );

    if (damage >= effectiveMight) {
      // Check for replacement effects ("instead of dying...") (rule 571-575)
      const owner = ctx.cards.getCardOwner(cardId) ?? "";
      const replacementMatch = checkReplacement(
        { cardId: cardId as string, owner, type: "die" },
        { cards: ctx.cards, draft: ctx.draft, zones: ctx.zones },
      );
      if (replacementMatch) {
        // Replacement intercepted the death — skip normal kill
        // The replacement effect itself (e.g., "kill this instead, recall that unit")
        // Would be executed by the caller if needed.
        // For "prevent", just skip the kill entirely.
        if (replacementMatch.replacement !== "prevent") {
          // Non-prevent replacements store an effect to execute
          // For now, mark that a replacement occurred and skip the kill
        }
        // Consume single-fire "next"-duration death replacements so they
        // Don't re-trigger on subsequent deaths this turn.
        markReplacementConsumed(ctx.draft, replacementMatch);
        stateChanged = true;
        // Clear damage so it doesn't re-trigger next cleanup pass (both the
        // `meta.damage` field and the `__counters.damage` bag).
        ctx.cards.updateCardMeta(cardId, { damage: 0 } as Partial<RiftboundCardMeta>);
        ctx.counters.clearCounter(cardId, "damage");
        continue;
      }

      // Detach any equipment before killing (equipment returns to owner's base).
      // Also clears `copiedFromCardId` so Svellsongur stops exposing the
      // Dying unit's abilities once it's no longer attached.
      const unitMeta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      const equippedWith = unitMeta?.equippedWith ?? [];
      for (const equipId of equippedWith) {
        ctx.cards.updateCardMeta(
          equipId as CoreCardId,
          {
            attachedTo: undefined,
            copiedFromCardId: undefined,
          } as Partial<RiftboundCardMeta>,
        );
        ctx.zones.moveCard({
          cardId: equipId as CoreCardId,
          targetZoneId: "base" as CoreZoneId,
        });
      }

      // Kill this unit — move to trash
      ctx.zones.moveCard({
        cardId,
        targetZoneId: "trash" as CoreZoneId,
      });

      // Clear all temporary metadata (rule 170+: zone change clears all mods)
      ctx.cards.updateCardMeta(cardId, {
        buffed: false,
        combatRole: null,
        damage: 0,
        equippedWith: undefined,
        exhausted: false,
        grantedKeywords: undefined,
        mightModifier: 0,
        stunned: false,
      } as Partial<RiftboundCardMeta>);
      ctx.counters.clearCounter(cardId, "damage");

      killed.push(cardId as string);
      stateChanged = true;
    }
  }

  // Step 1.5: Tokens cease to exist when they enter a Non-Board Zone (rule
  // 183.1: "If a token is put into any Non-Board Zone besides the chain, it
  // Ceases to exist immediately after moving to its new zone."). Death moves
  // A unit to trash; cease-to-exist moves a token to `banishment` and clears
  // Its meta so it can't be referenced/triggered against. (Banishment is the
  // Engine's "the card no longer exists" sink — tokens in banishment are not
  // Counted as cards by deckbuilder/draw paths and are gone for game-logic
  // Purposes; the only zone we strictly couldn't use here is the chain. We
  // Intentionally do NOT delete the registry entry — the def is shared across
  // All instances of that token type, and other live instances still need it.)
  const tokenCeaseZones: string[] = ["trash", "hand", "mainDeck"];
  for (const zoneId of tokenCeaseZones) {
    const cardsInZone = ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    for (const cardId of cardsInZone) {
      const def = registry.get(cardId as string);
      if (def?.isToken !== true) {
        continue;
      }
      ctx.zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: "banishment" as CoreZoneId,
      });
      // Clear any lingering meta so listeners / static-recalc don't see it.
      ctx.cards.updateCardMeta(cardId, {
        buffed: false,
        combatRole: null,
        damage: 0,
        equippedWith: undefined,
        exhausted: false,
        grantedKeywords: undefined,
        mightModifier: 0,
        stunned: false,
      } as Partial<RiftboundCardMeta>);
      ctx.counters.clearCounter(cardId, "damage");
      stateChanged = true;
    }
  }

  // Step 2: Remove stale combat roles / re-assign designations (rules 521 +
  // 323.2). Under CR 2026-03-30 the Attacker/Defender designations only exist
  // For the duration of the combat that established them: a unit keeps its
  // Combat role only while it sits at a battlefield that has an *ongoing*
  // Combat or combat-showdown (the battlefield carries the Contested status,
  // Or there's an active combat showdown there). A unit that has moved away
  // From such a battlefield — OR a unit still at a battlefield whose combat
  // Has resolved (no longer Contested, no active showdown) — loses its
  // Designation.
  const activeShowdownState = ctx.draft.interaction?.showdownStack;
  const activeCombatShowdown =
    activeShowdownState && activeShowdownState.length > 0
      ? activeShowdownState[activeShowdownState.length - 1]
      : undefined;
  for (const zoneId of allBoardZones) {
    const cardsInZone = ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    const isBattlefield = (zoneId as string).startsWith("battlefield-");
    let combatOngoingHere = false;
    // The Attacker at a battlefield with an ongoing combat is the player who
    // Applied the Contested status (`bf.contestedBy`), or — if a Combat
    // Showdown is active there — its `attackingPlayer`. Everyone else's units
    // Are Defenders (rule 459.2.b / 323.2).
    let attackerHere: string | undefined;
    if (isBattlefield) {
      const bfId = (zoneId as string).slice("battlefield-".length);
      const bf = ctx.draft.battlefields[bfId];
      const isContested = bf?.contested === true;
      const showdownHere =
        activeCombatShowdown?.active === true &&
        activeCombatShowdown.isCombatShowdown === true &&
        activeCombatShowdown.battlefieldId === bfId;
      combatOngoingHere = isContested || showdownHere;
      if (combatOngoingHere) {
        attackerHere =
          (showdownHere ? activeCombatShowdown?.attackingPlayer : undefined) ??
          bf?.contestedBy ??
          undefined;
      }
    }

    for (const cardId of cardsInZone) {
      const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      if (!combatOngoingHere) {
        // No combat at this location: a unit here keeps no combat designation.
        if (meta?.combatRole) {
          ctx.cards.updateCardMeta(cardId, {
            combatRole: null,
          } as Partial<RiftboundCardMeta>);
          stateChanged = true;
        }
        continue;
      }
      // Rule 323.2.a / 459.2.b.3.a / 459.2.b.4.a — a unit present at a
      // Battlefield with an ongoing combat that lacks a designation gains the
      // Same designation as its CONTROLLER now. Rule 323.2.b — a unit holding
      // The *opposite* designation of its CONTROLLER loses it and gains the
      // Correct one. (Rule 323.2 says "their Controller" — after a
      // `take-control` per rule 187/323.6, the new controller is what
      // Determines attacker vs defender, not the original owner.)
      const cardsBag = ctx.cards as typeof ctx.cards & {
        getCardController?: (id: CoreCardId) => string | undefined;
      };
      const controllerOfCard =
        cardsBag.getCardController?.(cardId) ?? ctx.cards.getCardOwner(cardId) ?? "";
      const desiredRole: "attacker" | "defender" | undefined =
        attackerHere === undefined
          ? undefined
          : (controllerOfCard === attackerHere
            ? "attacker"
            : "defender");
      if (desiredRole === undefined) {
        if (meta?.combatRole) {
          ctx.cards.updateCardMeta(cardId, {
            combatRole: null,
          } as Partial<RiftboundCardMeta>);
          stateChanged = true;
        }
        continue;
      }
      if (meta?.combatRole !== desiredRole) {
        ctx.cards.updateCardMeta(cardId, {
          combatRole: desiredRole,
        } as Partial<RiftboundCardMeta>);
        stateChanged = true;
      }
    }
  }

  // Rule 323.10 / 456.2 — a Combat that was Staged (the battlefield carries
  // The Contested status) but has *not yet opened* (no Combat Showdown active
  // There) ceases being Staged once units of two opposing players are no
  // Longer both present there. Clear the Contested status so a stale staged
  // Combat is never resolved. (If a Combat Showdown is already active at the
  // Bf, the combat has opened — leave it to combat resolution to settle.)
  for (const [bfId, bf] of Object.entries(ctx.draft.battlefields)) {
    if (!bf.contested) {
      continue;
    }
    const showdownOpenHere =
      activeCombatShowdown?.active === true &&
      activeCombatShowdown.isCombatShowdown === true &&
      activeCombatShowdown.battlefieldId === bfId;
    if (showdownOpenHere) {
      continue;
    }
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const owners = new Set<string>();
    for (const unitId of ctx.zones.getCardsInZone(bfZoneId)) {
      const o = ctx.cards.getCardOwner(unitId) ?? "";
      if (o) {
        owners.add(o);
      }
    }
    if (owners.size < 2) {
      bf.contested = false;
      bf.contestedBy = undefined;
      stateChanged = true;
    }
  }

  // NOTE: Rule 323.6 / 187.4.c — "while the turn is in an Open State, a
  // Battlefield with no Units occupying it and no Showdown/Combat ongoing
  // Becomes Uncontrolled" — is intentionally NOT enforced here yet. The
  // Engine currently treats Battlefield control as sticky (Establish-Control
  // Claims it persistently). Flipping to rules-correct lose-control-when-empty
  // Cascades through the scoring engine and many tests that set `controller`
  // Without placing units; it deserves its own focused tick. Tracked in the
  // Remaining-work list.

  // Step 3: Recalculate static/passive ability effects (rule 522)
  // Strip and re-apply all "While X" / "As long as" continuous effects
  if (recalculateStaticEffects({ cards: ctx.cards, draft: ctx.draft, zones: ctx.zones })) {
    stateChanged = true;
  }

  // Step 4: Remove orphaned hidden cards (rule 323.7): "Remove all Hidden
  // Cards from all Battlefields that are not controlled by the same player
  // And place them in their owner's Trash." A hidden card stays only while
  // Its owner controls (or holds — rule 185 control includes Contested-by)
  // The battlefield it sits at; otherwise it is trashed.
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const facedownZoneId = `facedown-${bfId}` as CoreZoneId;

    const hiddenCards = ctx.zones.getCardsInZone(facedownZoneId);
    if (hiddenCards.length === 0) {
      continue;
    }

    const bf = ctx.draft.battlefields[bfId];
    // A player "controls" a battlefield if they're its `controller`, or — while
    // It's Contested — if they're the contesting player (rule 185.x).
    const controllingPlayer = bf?.contested ? (bf?.contestedBy ?? bf?.controller) : bf?.controller;

    for (const hiddenCardId of hiddenCards) {
      const hiddenOwner = ctx.cards.getCardOwner(hiddenCardId) ?? "";

      if (controllingPlayer !== hiddenOwner) {
        // Owner does not control this battlefield → trash the hidden card.
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

  // Step 5: Auto-recall gear from battlefields to base (rule 518)
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const cardsAtBf = ctx.zones.getCardsInZone(bfZoneId);

    for (const cardId of cardsAtBf) {
      const def = registry.get(cardId as string);
      // Only auto-recall gear (not units, not equipment attached to units)
      if (def?.cardType === "gear") {
        const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
        // Don't recall if it's attached as equipment
        if (!meta?.attachedTo) {
          ctx.zones.moveCard({
            cardId,
            targetZoneId: "base" as CoreZoneId,
          });
          stateChanged = true;
        }
      }
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

  // Step 5c: Resolve pending `until-leaves` control reverts (rule 187 / 323).
  // When a `take-control` with `duration:"until-leaves"` was applied and the
  // Target has since left the board (now in trash/hand/banishment/mainDeck),
  // Restore the original controller and drop the entry. End-of-turn reverts
  // (`expires:"end-of-turn"`) are handled separately by the Ending phase hook.
  const stateWithReverts = ctx.draft as typeof ctx.draft & {
    pendingControlReverts?: {
      cardId: string;
      originalController: string;
      expires: "end-of-turn" | "until-leaves";
    }[];
  };
  if (stateWithReverts.pendingControlReverts && stateWithReverts.pendingControlReverts.length > 0) {
    // Build the set of cards currently on the board (any of the board zones)
    // So we can detect a card that has left the board (trash / hand / banishment
    // / deck) and trigger its until-leaves revert.
    const onBoardCardIds = new Set<string>();
    for (const zoneId of allBoardZones) {
      for (const cardId of ctx.zones.getCardsInZone(zoneId as CoreZoneId)) {
        onBoardCardIds.add(cardId as string);
      }
    }
    const remaining: NonNullable<typeof stateWithReverts.pendingControlReverts> = [];
    for (const r of stateWithReverts.pendingControlReverts) {
      if (r.expires !== "until-leaves") {
        remaining.push(r);
        continue;
      }
      if (!onBoardCardIds.has(r.cardId)) {
        const cardsBag = ctx.cards as {
          setCardController?: (id: CoreCardId, controllerId: string) => void;
        };
        cardsBag.setCardController?.(r.cardId as CoreCardId, r.originalController);
        stateChanged = true;
        // Drop from list.
      } else {
        remaining.push(r);
      }
    }
    stateWithReverts.pendingControlReverts = remaining;
  }

  // Step 5d: Strip live-board temp meta from any unit/card sitting in a
  // Non-board zone (rule 705 + 711). The damage-kill path on Step 1 zeroes
  // A unit's temp meta as it moves to trash, but ANY other way a unit can
  // Leave play (return-to-hand, banish, voluntary discard, non-damage
  // Destroy) historically left dangling meta on the card while it sat in
  // The non-board zone — violating rule 705 ("If a Unit leaves play,
  // Remove all Buffs from it") and rule 711 ("Units in Non-Board Zones
  // Are evaluated according to their inherent Might"). This generic wipe
  // Applies the same meta clear regardless of HOW the card got there, so
  // The rule holds end-to-end without per-move opt-in. championZone is
  // Also covered for rule 705.1 — "Champions do not retain Buffs in the
  // Champion Zone, even if they return there somehow."
  const nonBoardLeavePlayZones: string[] = [
    "trash",
    "hand",
    "banishment",
    "mainDeck",
    "runeDeck",
    "championZone",
  ];
  for (const zoneId of nonBoardLeavePlayZones) {
    const cardsInZone = ctx.zones.getCardsInZone(zoneId as CoreZoneId);
    for (const cardId of cardsInZone) {
      const meta = ctx.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      if (!meta) {
        continue;
      }
      // Cheap dirty-check: only update when at least one tracked field is
      // Non-default, so we don't flood `updateCardMeta` with no-ops and we
      // Don't accidentally drive `stateChanged = true` on a stable state.
      // NOTE: `damage` is intentionally NOT wiped here — Deathknell triggers
      // Can legitimately deal damage to a unit that just moved to trash this
      // Pass, and observers (witnesses / event-bus tests) need to see that
      // Side-effect. The damage value on a trashed unit is functionally
      // Ignored by rule 711 (non-board zones use inherent might) anyway.
      const hasLiveMeta =
        meta.buffed === true ||
        (meta.mightModifier ?? 0) !== 0 ||
        (meta.combatMightModifier ?? 0) !== 0 ||
        (meta.staticMightBonus ?? 0) !== 0 ||
        meta.combatRole != null ||
        meta.exhausted === true ||
        meta.stunned === true ||
        (meta.grantedKeywords?.length ?? 0) > 0;
      if (!hasLiveMeta) {
        continue;
      }
      ctx.cards.updateCardMeta(cardId, {
        buffed: false,
        combatMightModifier: 0,
        combatRole: null,
        exhausted: false,
        grantedKeywords: undefined,
        mightModifier: 0,
        staticMightBonus: 0,
        stunned: false,
      } as Partial<RiftboundCardMeta>);
      stateChanged = true;
    }
  }

  // Step 6: Mark combat as pending (rule 524)
  for (const [bfId, bf] of Object.entries(ctx.draft.battlefields)) {
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const unitsAtBf = ctx.zones.getCardsInZone(bfZoneId);

    if (unitsAtBf.length < 2) {
      continue;
    }

    // Check if units belong to 2+ different players
    const owners = new Set<string>();
    for (const unitId of unitsAtBf) {
      const owner = ctx.cards.getCardOwner(unitId) ?? "";
      if (owner) {
        owners.add(owner);
      }
    }

    if (owners.size >= 2 && !bf.contested) {
      combatPending.push(bfId);
      stateChanged = true;
    }
  }

  return { combatPending, hiddenRemoved, killed, stateChanged };
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
