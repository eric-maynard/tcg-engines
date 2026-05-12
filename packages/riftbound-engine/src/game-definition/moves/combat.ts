/**
 * Riftbound Combat Moves
 *
 * Moves for combat: contesting battlefields, assigning attackers/defenders,
 * dealing damage, resolving combat, and scoring.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { Draft } from "immer";
import type { CombatUnit } from "../../combat";
import { resolveCombat } from "../../combat";
import { fireDieTriggers, fireTriggers } from "../../abilities/trigger-runner";
import type { TriggerRunnerContext } from "../../abilities/trigger-runner";
import { getActiveShowdown } from "../../chain";
import { computeEffectiveMight, getGlobalCardRegistry } from "../../operations/card-lookup";
import { getHuntValue } from "../../operations/hunt-keyword";
import type {
  GrantedKeyword,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../types";
import { hasPlayerWon } from "../win-conditions/victory";
import { canPlayerScoreAtBattlefield } from "../../operations/scoring-rules";
import { areAllies, isTeamGame } from "../../operations/teams";

/**
 * Hunt keyword (rule 823): grant a player XP based on the [Hunt N] units
 * they control at the given battlefield "when I conquer or hold".
 *
 * Mutates the immer draft directly: increments the player's `xp`, updates
 * `xpGainedThisTurn`, and fires a `gain-xp` trigger event so XP-reactive
 * abilities (e.g. "When you gain XP…") can respond.
 */
function applyHuntXp(
  draft: RiftboundGameState,
  battlefieldId: string,
  playerId: string,
  zones: { getCardsInZone: (zoneId: CoreZoneId) => readonly CoreCardId[] },
  cards: {
    getCardController?: (cardId: CoreCardId) => string | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
  },
): void {
  const registry = getGlobalCardRegistry();
  const battlefieldZoneId = `battlefield-${battlefieldId}` as CoreZoneId;
  const unitIds = zones.getCardsInZone(battlefieldZoneId);
  let xpGain = 0;
  for (const cardId of unitIds) {
    const controller = cards.getCardController?.(cardId) ?? cards.getCardOwner(cardId);
    if (controller !== playerId) {
      continue;
    }
    const meta = cards.getCardMeta(cardId);
    xpGain += getHuntValue(cardId as string, meta as { grantedKeywords?: GrantedKeyword[] }, registry);
  }
  if (xpGain <= 0) {
    return;
  }
  const player = draft.players[playerId];
  if (player) {
    player.xp += xpGain;
  }
  if (draft.xpGainedThisTurn[playerId] !== undefined) {
    draft.xpGainedThisTurn[playerId] = (draft.xpGainedThisTurn[playerId] ?? 0) + xpGain;
  } else {
    draft.xpGainedThisTurn[playerId] = xpGain;
  }
}

/**
 * Minimal shape of the move/flow context plumbing that the combat-resolution
 * core needs. Both move reducers and the showdown-close hook can supply this
 * (a move reducer's `context` is structurally compatible). It reuses the
 * trigger-runner's `zones`/`cards`/`counters` shapes so the same object can
 * be forwarded to `fireTriggers`/`fireDieTriggers` without re-wrapping.
 */
export interface CombatResolutionContext {
  zones: TriggerRunnerContext["zones"] & {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => readonly CoreCardId[];
  };
  cards: TriggerRunnerContext["cards"] & {
    updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
  counters: TriggerRunnerContext["counters"];
  endGame?: (result: {
    metadata?: Record<string, unknown>;
    reason: string;
    winner: CorePlayerId;
  }) => void;
}

/**
 * Run the three Steps of Combat's *resolution* (Step 2 Combat Damage + Step 3
 * Resolution) for the combat staged at `battlefieldId` — rules 460-461.
 *
 * The Combat Showdown Step (Step 1, rule 459) is the chain/showdown window;
 * combat resolution proper begins *after* the Combat Showdown closes (rule
 * 348.1 → 458). This function is the shared core invoked both by the explicit
 * `resolveFullCombat` move (legacy / direct-trigger path) and by the
 * showdown-close hook in `passShowdownFocus` when a Combat Showdown ends.
 *
 * Mutates the immer draft in place. No-op if the battlefield is not Contested.
 */
export function runCombatResolution(
  draft: Draft<RiftboundGameState>,
  context: CombatResolutionContext,
  battlefieldId: string,
): void {
  const { zones, cards, counters } = context;

  const battlefield = draft.battlefields[battlefieldId];
  if (!battlefield || !battlefield.contested) {
    return;
  }

  const attackingPlayer = battlefield.contestedBy;
  if (!attackingPlayer) {
    return;
  }

  // Get all unit card IDs at this battlefield
  const battlefieldZoneId = `battlefield-${battlefieldId}` as CoreZoneId;
  const unitIds = zones.getCardsInZone(battlefieldZoneId);

  if (unitIds.length === 0) {
    return;
  }

  // Look up card definitions from the global registry
  const registry = getGlobalCardRegistry();

  // Build CombatUnit arrays partitioned by attacker/defender
  const attackerUnits: CombatUnit[] = [];
  const defenderUnits: CombatUnit[] = [];

  for (const cardId of unitIds) {
    const owner = cards.getCardOwner(cardId) ?? "";
    const meta = cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
    const def = registry.get(cardId as string);

    // Skip non-unit cards (no base Might).
    if ((def?.might ?? 0) <= 0) {
      continue;
    }
    // Rule 460.2.a/b: combat damage is summed from each side's *current*
    // Might — buffs, equipment, `mightModifier`, and any "this combat"
    // Modifier all count, not just printed Might.
    const baseMight = computeEffectiveMight(
      cardId as string,
      (cid) => cards.getCardMeta(cid as CoreCardId) as Partial<RiftboundCardMeta> | undefined,
      registry,
    );

    const currentDamage = meta?.damage ?? 0;

    // Collect keywords from definition and granted keywords
    const defKeywords = def?.keywords ?? [];
    const grantedKeywords: GrantedKeyword[] = meta?.grantedKeywords ?? [];
    const allKeywords = [...defKeywords, ...grantedKeywords.map((gk) => gk.keyword)];

    // Build keywordValues from granted keywords with numeric values
    const keywordValues: Record<string, number> = {};
    for (const gk of grantedKeywords) {
      if (gk.value !== undefined) {
        keywordValues[gk.keyword] = (keywordValues[gk.keyword] ?? 0) + gk.value;
      }
    }

    // Also parse keyword values from definition keywords (e.g., "Assault" with value in abilities)
    if (def?.abilities) {
      for (const ability of def.abilities) {
        if (ability.type === "keyword" && ability.keyword && ability.value !== undefined) {
          keywordValues[ability.keyword] = (keywordValues[ability.keyword] ?? 0) + ability.value;
        }
      }
    }

    const unit: CombatUnit = {
      baseMight,
      currentDamage,
      id: cardId as string,
      keywordValues: Object.keys(keywordValues).length > 0 ? keywordValues : undefined,
      keywords: allKeywords,
      owner,
    };

    if (owner === attackingPlayer) {
      attackerUnits.push(unit);
    } else {
      defenderUnits.push(unit);
    }
  }

  // If either side is empty, skip combat damage resolution but still run the
  // Resolution Step (461) below so control / contested status settle.
  if (attackerUnits.length === 0 || defenderUnits.length === 0) {
    endCombatNoDamage(draft, context, battlefieldId);
    return;
  }

  // Run the combat resolver
  const result = resolveCombat(attackerUnits, defenderUnits);

  // Apply damage to each unit from damageAssignment
  for (const [unitId, dmg] of Object.entries(result.damageAssignment)) {
    if (dmg > 0) {
      counters.addCounter(unitId as CoreCardId, "damage", dmg);
      // Also update card meta damage for consistency
      const existingMeta = cards.getCardMeta(unitId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const existingDamage = existingMeta?.damage ?? 0;
      cards.updateCardMeta(
        unitId as CoreCardId,
        {
          damage: existingDamage + dmg,
        } as Partial<RiftboundCardMeta>,
      );
    }
  }

  // Kill units that were destroyed. Capture owners *before* moving them
  // So the "when I die" / Deathknell triggers (rule 813) attribute the
  // Death to the right player.
  const killedPairs: { cardId: string; owner: string }[] = [];
  for (const killedId of result.killed) {
    killedPairs.push({
      cardId: killedId as string,
      owner: cards.getCardOwner(killedId as CoreCardId) ?? "",
    });
    // Clear all metadata on killed unit
    cards.updateCardMeta(
      killedId as CoreCardId,
      {
        buffed: false,
        combatRole: null,
        damage: 0,
        equippedWith: undefined,
        exhausted: false,
        grantedKeywords: undefined,
        mightModifier: 0,
        stunned: false,
      } as Partial<RiftboundCardMeta>,
    );

    // Move to trash
    zones.moveCard({
      cardId: killedId as CoreCardId,
      targetZoneId: "trash" as CoreZoneId,
    });
  }

  // Fire "die" triggers (rule 540.x / 813 Deathknell) for units killed in
  // The Combat Damage Step, after they've all moved to the trash.
  if (killedPairs.length > 0) {
    fireDieTriggers(killedPairs, { cards, counters, draft, zones });
  }

  // Combat Cleanup step 3c (rule 461.1.a.1): "Heal all Units." Combat
  // Damage does NOT persist past the combat that dealt it — every unit
  // That survived the Combat Damage Step is healed back to full at the
  // Resolution Step.
  const healedIds = new Set<string>([
    ...result.winningSurvivors,
    ...result.losingSurvivors,
    ...zones
      .getCardsInZone(battlefieldZoneId)
      .map((c) => c as string)
      .filter((c) => !result.killed.includes(c as CoreCardId)),
  ]);
  for (const healId of healedIds) {
    cards.updateCardMeta(healId as CoreCardId, { damage: 0 } as Partial<RiftboundCardMeta>);
    counters.clearCounter?.(healId as CoreCardId, "damage");
  }

  // Apply outcome based on winner
  if (result.winner === "attacker") {
    // Attacker conquers the battlefield
    battlefield.controller = attackingPlayer;

    // Track conquered battlefield for this turn
    if (!draft.conqueredThisTurn[attackingPlayer]) {
      draft.conqueredThisTurn[attackingPlayer] = [];
    }
    draft.conqueredThisTurn[attackingPlayer].push(battlefieldId);

    // Award 1 VP for conquering (rule 630.1)
    const scoringAllowed = canPlayerScoreAtBattlefield(draft, attackingPlayer, battlefieldId);
    const player = draft.players[attackingPlayer];
    if (player && scoringAllowed) {
      player.victoryPoints += 1;

      // Check for victory
      if (hasPlayerWon(draft, attackingPlayer)) {
        draft.status = "finished";
        draft.winner = attackingPlayer;

        context.endGame?.({
          metadata: { finalScore: player.victoryPoints, method: "conquer" },
          reason: "victory_points",
          winner: attackingPlayer as CorePlayerId,
        });
      }
    }

    // Hunt keyword (rule 823).
    applyHuntXp(draft, battlefieldId, attackingPlayer, zones, cards);

    // Emit "conquer" event so triggered abilities fire
    fireTriggers(
      { battlefieldId, playerId: attackingPlayer, type: "conquer" },
      { cards, counters, draft, zones },
    );

    // Recall any losing survivors (defenders that survived) to their base
    for (const survivorId of result.losingSurvivors) {
      zones.moveCard({
        cardId: survivorId as CoreCardId,
        targetZoneId: "base" as CoreZoneId,
      });
    }
  } else if (result.winner === "defender") {
    // Defenders hold the battlefield (rule 461.3.a / 461.5).
    // Recall surviving attackers (losingSurvivors) to base.
    for (const survivorId of result.losingSurvivors) {
      zones.moveCard({
        cardId: survivorId as CoreCardId,
        targetZoneId: "base" as CoreZoneId,
      });
    }
    // Rule 461.5.d: Establishing Control results in a Conquer if that
    // Player has not yet scored this battlefield this turn.
    const defendingPlayer =
      result.winningSurvivors.length > 0
        ? (cards.getCardOwner(result.winningSurvivors[0] as CoreCardId) ?? undefined)
        : undefined;
    if (defendingPlayer && battlefield.controller !== defendingPlayer) {
      const alreadyScored =
        draft.scoredThisTurn[defendingPlayer]?.includes(battlefieldId) ?? false;
      battlefield.controller = defendingPlayer;
      if (!alreadyScored) {
        if (!draft.conqueredThisTurn[defendingPlayer]) {
          draft.conqueredThisTurn[defendingPlayer] = [];
        }
        draft.conqueredThisTurn[defendingPlayer].push(battlefieldId);
        const scoringAllowed = canPlayerScoreAtBattlefield(draft, defendingPlayer, battlefieldId);
        const dp = draft.players[defendingPlayer];
        if (dp && scoringAllowed) {
          dp.victoryPoints += 1;
          if (!draft.scoredThisTurn[defendingPlayer]) {
            draft.scoredThisTurn[defendingPlayer] = [];
          }
          draft.scoredThisTurn[defendingPlayer].push(battlefieldId);
          applyHuntXp(draft, battlefieldId, defendingPlayer, zones, cards);
          fireTriggers(
            { battlefieldId, playerId: defendingPlayer, type: "conquer" },
            { cards, counters, draft, zones },
          );
          if (hasPlayerWon(draft, defendingPlayer)) {
            draft.status = "finished";
            draft.winner = defendingPlayer;
            context.endGame?.({
              metadata: { finalScore: dp.victoryPoints, method: "conquer" },
              reason: "victory_points",
              winner: defendingPlayer as CorePlayerId,
            });
          }
        }
      }
    }
  }
  // For "tie"/"no-result": handled below.

  // Rule 461.3.d.1: if "No Result" and BOTH players still have units, a new
  // Combat is *staged* here — the contest does not end.
  const survivorsByOwner = new Set<string>();
  for (const unitId of zones.getCardsInZone(battlefieldZoneId)) {
    const o = cards.getCardOwner(unitId as CoreCardId);
    if (o) {
      survivorsByOwner.add(o as string);
    }
  }
  if (result.winner === "no-result" && survivorsByOwner.size >= 2) {
    // Re-stage: keep Contested, keep designations.
    return;
  }

  finalizeCombatEnd(draft, context, battlefieldId);
}

/**
 * Rule 461 Resolution Step when one side has no units left (so no Combat
 * Damage Step ran): the side with units Establishes Control (Conquer if not
 * already scored this turn), then combat ends.
 */
function endCombatNoDamage(
  draft: Draft<RiftboundGameState>,
  context: CombatResolutionContext,
  battlefieldId: string,
): void {
  const { zones, cards, counters } = context;
  const battlefield = draft.battlefields[battlefieldId];
  if (!battlefield) {
    return;
  }
  const battlefieldZoneId = `battlefield-${battlefieldId}` as CoreZoneId;
  // Determine the sole surviving controller (if any).
  const owners = new Set<string>();
  for (const unitId of zones.getCardsInZone(battlefieldZoneId)) {
    const o = cards.getCardOwner(unitId as CoreCardId);
    if (o) {
      owners.add(o as string);
    }
  }
  if (owners.size === 1) {
    const survivor = [...owners][0];
    if (battlefield.controller !== survivor) {
      const alreadyScored = draft.scoredThisTurn[survivor]?.includes(battlefieldId) ?? false;
      battlefield.controller = survivor;
      if (!alreadyScored && canPlayerScoreAtBattlefield(draft, survivor, battlefieldId)) {
        const p = draft.players[survivor];
        if (p) {
          p.victoryPoints += 1;
          if (!draft.scoredThisTurn[survivor]) {
            draft.scoredThisTurn[survivor] = [];
          }
          draft.scoredThisTurn[survivor].push(battlefieldId);
          if (!draft.conqueredThisTurn[survivor]) {
            draft.conqueredThisTurn[survivor] = [];
          }
          draft.conqueredThisTurn[survivor].push(battlefieldId);
          applyHuntXp(draft, battlefieldId, survivor, zones, cards);
          fireTriggers(
            { battlefieldId, playerId: survivor, type: "conquer" },
            { cards, counters, draft, zones },
          );
          if (hasPlayerWon(draft, survivor)) {
            draft.status = "finished";
            draft.winner = survivor;
            context.endGame?.({
              metadata: { finalScore: p.victoryPoints, method: "conquer" },
              reason: "victory_points",
              winner: survivor as CorePlayerId,
            });
          }
        }
      }
    }
  } else if (owners.size === 0) {
    // Rule 461.5.b: no units → battlefield becomes Uncontrolled.
    battlefield.controller = null;
  }
  finalizeCombatEnd(draft, context, battlefieldId);
}

/**
 * Rule 461.7 — Combat ends: drop Attacker/Defender designations from all
 * units (and players), expire all "this combat" effects (rule 461.7.b),
 * clear the Contested status (rule 461.5.a).
 */
function finalizeCombatEnd(
  draft: Draft<RiftboundGameState>,
  context: CombatResolutionContext,
  battlefieldId: string,
): void {
  const { zones, cards } = context;
  const battlefield = draft.battlefields[battlefieldId];
  const battlefieldZoneId = `battlefield-${battlefieldId}` as CoreZoneId;

  // Rule 461.7.a: remove Attacker/Defender designation from all units still here.
  for (const unitId of zones.getCardsInZone(battlefieldZoneId)) {
    cards.updateCardMeta(unitId, {
      combatRole: null,
    } as Partial<RiftboundCardMeta>);
  }

  // Rule 461.7.b: all "this combat" effects expire simultaneously. Sweep
  // Base + every battlefield (a "this combat" Reaction could buff a unit
  // Anywhere).
  const boardCards: CoreCardId[] = [];
  for (const pid of Object.keys(draft.players)) {
    boardCards.push(...zones.getCardsInZone("base" as CoreZoneId, pid as CorePlayerId));
  }
  for (const bfId of Object.keys(draft.battlefields)) {
    boardCards.push(...zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId));
  }
  for (const cardId of boardCards) {
    const meta = cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
    if (!meta) {
      continue;
    }
    const gk = meta.grantedKeywords ?? [];
    const combatScoped = gk.some((k) => k.duration === "combat");
    const hasCombatMight = (meta.combatMightModifier ?? 0) !== 0;
    if (!combatScoped && !hasCombatMight) {
      continue;
    }
    const remaining = gk.filter((k) => k.duration !== "combat");
    cards.updateCardMeta(cardId, {
      combatMightModifier: 0,
      grantedKeywords: remaining.length > 0 ? remaining : undefined,
    } as Partial<RiftboundCardMeta>);
  }

  // Rule 461.5.a: clear Contested — combat is over.
  if (battlefield) {
    battlefield.contested = false;
    battlefield.contestedBy = undefined;
  }
}

/**
 * Rule 348.2 — when a *non-combat* Showdown closes (all players passed Focus
 * with no spell/ability): if exactly one player's Units remain at the
 * battlefield and they don't already control it, that player Establishes
 * Control — a Conquer if they haven't scored that battlefield this turn
 * (348.2.a.1). Mutates the draft. No-op if the bf is Contested (a combat is
 * staged there — handled by combat resolution instead) or already controlled
 * by the survivor.
 */
export function establishNonCombatShowdownControl(
  draft: Draft<RiftboundGameState>,
  context: CombatResolutionContext,
  battlefieldId: string,
): void {
  const { zones, cards, counters } = context;
  const battlefield = draft.battlefields[battlefieldId];
  if (!battlefield || battlefield.contested) {
    return;
  }
  const battlefieldZoneId = `battlefield-${battlefieldId}` as CoreZoneId;
  const owners = new Set<string>();
  for (const unitId of zones.getCardsInZone(battlefieldZoneId)) {
    const o = cards.getCardOwner(unitId as CoreCardId);
    if (o) {
      owners.add(o as string);
    }
  }
  if (owners.size !== 1) {
    return;
  }
  const survivor = [...owners][0];
  if (battlefield.controller === survivor) {
    return;
  }
  battlefield.controller = survivor;
  const alreadyScored = draft.scoredThisTurn[survivor]?.includes(battlefieldId) ?? false;
  if (alreadyScored) {
    return;
  }
  if (!canPlayerScoreAtBattlefield(draft, survivor, battlefieldId)) {
    return;
  }
  const p = draft.players[survivor];
  if (!p) {
    return;
  }
  p.victoryPoints += 1;
  if (!draft.scoredThisTurn[survivor]) {
    draft.scoredThisTurn[survivor] = [];
  }
  draft.scoredThisTurn[survivor].push(battlefieldId);
  if (!draft.conqueredThisTurn[survivor]) {
    draft.conqueredThisTurn[survivor] = [];
  }
  draft.conqueredThisTurn[survivor].push(battlefieldId);
  applyHuntXp(draft, battlefieldId, survivor, zones, cards);
  fireTriggers(
    { battlefieldId, playerId: survivor, type: "conquer" },
    { cards, counters, draft, zones },
  );
  if (hasPlayerWon(draft, survivor)) {
    draft.status = "finished";
    draft.winner = survivor;
    context.endGame?.({
      metadata: { finalScore: p.victoryPoints, method: "conquer" },
      reason: "victory_points",
      winner: survivor as CorePlayerId,
    });
  }
}

/**
 * Combat move definitions
 */
export const combatMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  /**
   * Contest Battlefield
   *
   * Mark a battlefield as contested when opposing units arrive.
   * Combat occurs when a Cleanup happens with opposing units at a Battlefield.
   */
  contestBattlefield: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }

      const bf = state.battlefields[context.params.battlefieldId];
      if (!bf) {
        return false;
      }
      if (bf.contested) {
        return false;
      }

      // Check that both players have units at this battlefield
      const bfZoneId = `battlefield-${context.params.battlefieldId}` as CoreZoneId;
      const allCards = context.zones.getCardsInZone(bfZoneId);
      let hasPlayerUnit = false;
      let hasOpponentUnit = false;
      for (const cardId of allCards) {
        const owner = context.cards.getCardOwner(cardId);
        if ((owner as string) === context.params.playerId) {
          hasPlayerUnit = true;
        } else {
          hasOpponentUnit = true;
        }
      }

      return hasPlayerUnit && hasOpponentUnit;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }
      if (state.turn.activePlayer !== (context.playerId as string)) {
        return [];
      }

      const results: { playerId: string; battlefieldId: string }[] = [];

      for (const [bfId, bf] of Object.entries(state.battlefields || {})) {
        if (bf.contested) {
          continue;
        }

        const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
        const allCards = context.zones.getCardsInZone(bfZoneId);
        let hasPlayerUnit = false;
        let hasOpponentUnit = false;
        for (const cardId of allCards) {
          const owner = context.cards.getCardOwner(cardId);
          if ((owner as string) === (context.playerId as string)) {
            hasPlayerUnit = true;
          } else {
            hasOpponentUnit = true;
          }
        }

        if (hasPlayerUnit && hasOpponentUnit) {
          results.push({
            battlefieldId: bfId,
            playerId: context.playerId as string,
          });
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const { playerId, battlefieldId } = context.params;

      const battlefield = draft.battlefields[battlefieldId];
      if (battlefield) {
        battlefield.contested = true;
        battlefield.contestedBy = playerId;
      }

      // Rule 455.1 / 459.2: if a Showdown is already ongoing at the battlefield
      // Where this combat is being staged, that Showdown becomes a Combat
      // Showdown (a combat will be initiated there). Promote it in place,
      // Recording attacker/defender designations from the contest.
      if (draft.interaction) {
        const activeShowdown = getActiveShowdown(draft.interaction);
        if (
          activeShowdown?.active &&
          activeShowdown.battlefieldId === battlefieldId &&
          !activeShowdown.isCombatShowdown
        ) {
          const opponent =
            activeShowdown.relevantPlayers.find((p) => p !== playerId) ??
            activeShowdown.defendingPlayer ??
            playerId;
          const stack = draft.interaction.showdownStack;
          const topIdx = stack.length - 1;
          if (topIdx >= 0) {
            stack[topIdx] = {
              ...activeShowdown,
              attackingPlayer: playerId,
              defendingPlayer: opponent,
              // Rule 459.2.b.1.a: the player who applied Contested (the
              // Attacker) gains Focus as the (now-combat) showdown begins.
              focusPlayer: playerId,
              isCombatShowdown: true,
              // Re-open: a Combat Showdown re-runs the focus rotation.
              passedPlayers: [],
            };
          }
        }
      }
    },
  },

  /**
   * Assign Attacker
   *
   * Designate a unit as an attacker in combat.
   * The attacker is the player who applied Contested status.
   */
  assignAttacker: {
    reducer: (_draft, context) => {
      const { unitId } = context.params;
      const { cards } = context;

      // Set combat role to attacker
      cards.updateCardMeta(
        unitId as CoreCardId,
        {
          combatRole: "attacker",
        } as Partial<RiftboundCardMeta>,
      );
    },
  },

  /**
   * Assign Defender
   *
   * Designate a unit as a defender in combat.
   * The defender is the other player in combat.
   */
  assignDefender: {
    reducer: (_draft, context) => {
      const { unitId } = context.params;
      const { cards } = context;

      // Set combat role to defender
      cards.updateCardMeta(
        unitId as CoreCardId,
        {
          combatRole: "defender",
        } as Partial<RiftboundCardMeta>,
      );
    },
  },

  /**
   * Assign Damage
   *
   * Assign combat damage to a unit.
   * Damage assignment rules:
   * - Units with Tank must receive lethal damage first
   * - Must assign lethal damage before moving to next unit
   */
  assignDamage: {
    reducer: (_draft, context) => {
      const { targetId, amount } = context.params;
      const { counters } = context;

      // Add damage to the target
      counters.addCounter(targetId as CoreCardId, "damage", amount);
    },
  },

  /**
   * Resolve Combat
   *
   * End combat and determine the outcome.
   * - Both sides have units: Attackers recalled to Base
   * - Only attackers remain: Battlefield conquered
   * - Only defenders remain: Defenders keep control
   * - Neither remain: No control change
   */
  resolveCombat: {
    reducer: (draft, context) => {
      const { battlefieldId } = context.params;

      const battlefield = draft.battlefields[battlefieldId];
      if (battlefield) {
        // Clear contested status
        battlefield.contested = false;
        battlefield.contestedBy = undefined;
      }
    },
  },

  /**
   * Resolve Full Combat
   *
   * Automated combat resolution using the combat resolver (rules 620-628).
   * Gathers units at the battlefield, partitions by owner, builds CombatUnit arrays,
   * calls resolveCombat(), then applies damage, kills, and outcome.
   *
   * Outcome handling:
   * - Attacker wins: Conquer battlefield, award VP, surviving attackers stay
   * - Defender wins: Recall surviving attackers to base, defenders keep battlefield
   * - Tie: All dead, clear contested, no control change
   */
  resolveFullCombat: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      const bf = state.battlefields[context.params.battlefieldId];
      if (bf?.contested !== true) {
        return false;
      }
      // Rule 455: a Combat occurs only when no Showdown or Combat is ongoing
      // At any *other* Battlefield. If a different battlefield has an active
      // Showdown there, that interaction must resolve first.
      if (state.interaction) {
        const activeShowdown = getActiveShowdown(state.interaction);
        if (
          activeShowdown?.active &&
          activeShowdown.battlefieldId !== context.params.battlefieldId
        ) {
          return false;
        }
      }
      return true;
    },
    enumerator: (state) => {
      if (state.status !== "playing") {
        return [];
      }
      // Rule 455 / 456.1: if any battlefield has an active showdown, only a
      // Combat at *that* battlefield (i.e. that showdown becoming a combat
      // Showdown) may proceed; no other staged combat resolves. Otherwise the
      // Turn Player picks which staged Combat resolves first by passing that
      // BattlefieldId to the move — we surface them all.
      const activeShowdown = state.interaction ? getActiveShowdown(state.interaction) : null;
      const lockedToBf = activeShowdown?.active ? activeShowdown.battlefieldId : null;
      const results: { battlefieldId: string }[] = [];
      for (const [bfId, bf] of Object.entries(state.battlefields || {})) {
        if (!bf.contested) {
          continue;
        }
        if (lockedToBf !== null && bfId !== lockedToBf) {
          continue;
        }
        results.push({ battlefieldId: bfId });
      }
      return results;
    },
    reducer: (draft, context) => {
      runCombatResolution(draft, context as CombatResolutionContext, context.params.battlefieldId);
    },
  },

  /**
   * Conquer Battlefield
   *
   * Take control of a battlefield.
   * This happens when attackers win combat or move to an uncontrolled battlefield.
   */
  conquerBattlefield: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }

      // Rule 548.2: Cannot conquer while a showdown is active at this battlefield
      if (state.interaction) {
        const activeShowdown = getActiveShowdown(state.interaction);
        if (
          activeShowdown?.active &&
          activeShowdown.battlefieldId === context.params.battlefieldId
        ) {
          return false;
        }
      }

      const bf = state.battlefields[context.params.battlefieldId];
      if (!bf) {
        return false;
      }
      if (bf.controller === context.params.playerId) {
        return false;
      }

      // Rule 185 / 461.5: control of a battlefield cannot change while a
      // Combat (or showdown) is in progress / staged there. A battlefield
      // With the Contested status has a combat staged on it; control is
      // Locked until that combat resolves and clears Contested.
      if (bf.contested) {
        return false;
      }

      // Player must have units at the battlefield
      const bfZoneId = `battlefield-${context.params.battlefieldId}` as CoreZoneId;
      const allCards = context.zones.getCardsInZone(bfZoneId);
      let hasPlayerUnit = false;
      let hasOpponentUnit = false;
      for (const cardId of allCards) {
        const owner = context.cards.getCardOwner(cardId);
        if ((owner as string) === context.params.playerId) {
          hasPlayerUnit = true;
        } else {
          hasOpponentUnit = true;
        }
      }

      // Can only conquer if player has units and opponent does not
      return hasPlayerUnit && !hasOpponentUnit;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }
      if (state.turn.activePlayer !== (context.playerId as string)) {
        return [];
      }

      const results: { playerId: string; battlefieldId: string }[] = [];

      for (const [bfId, bf] of Object.entries(state.battlefields || {})) {
        if (bf.controller === (context.playerId as string)) {
          continue;
        }

        // Rule 185 / 461.5: control is locked while a combat is staged here
        // (Contested status), and...
        if (bf.contested) {
          continue;
        }

        // ...rule 548.2: cannot conquer while a showdown is active at this battlefield
        if (state.interaction) {
          const enumShowdown = getActiveShowdown(state.interaction);
          if (enumShowdown?.active && enumShowdown.battlefieldId === bfId) {
            continue;
          }
        }

        const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
        const allCards = context.zones.getCardsInZone(bfZoneId);
        let hasPlayerUnit = false;
        let hasOpponentUnit = false;
        for (const cardId of allCards) {
          const owner = context.cards.getCardOwner(cardId);
          if ((owner as string) === (context.playerId as string)) {
            hasPlayerUnit = true;
          } else {
            hasOpponentUnit = true;
          }
        }

        if (hasPlayerUnit && !hasOpponentUnit) {
          results.push({
            battlefieldId: bfId,
            playerId: context.playerId as string,
          });
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const { playerId, battlefieldId } = context.params;

      const battlefield = draft.battlefields[battlefieldId];
      if (battlefield) {
        battlefield.controller = playerId;
        battlefield.contested = false;
        battlefield.contestedBy = undefined;
      }

      // Track conquered battlefield for this turn
      if (!draft.conqueredThisTurn[playerId]) {
        draft.conqueredThisTurn[playerId] = [];
      }
      draft.conqueredThisTurn[playerId].push(battlefieldId);

      // Award 1 VP for conquering (rule 630.1)
      // Blocked if a battlefield ability (e.g. Forgotten Monument) prevents
      // This player from scoring here right now.
      const scoringAllowed = canPlayerScoreAtBattlefield(draft, playerId, battlefieldId);
      const player = draft.players[playerId];
      if (player && scoringAllowed) {
        player.victoryPoints += 1;
      }

      // Track as scored this turn to prevent double-scoring
      if (!draft.scoredThisTurn[playerId]) {
        draft.scoredThisTurn[playerId] = [];
      }
      draft.scoredThisTurn[playerId].push(battlefieldId);

      // Hunt keyword (rule 823): [Hunt N] units the player controls here
      // Grant N XP "when I conquer".
      applyHuntXp(draft, battlefieldId, playerId, context.zones, context.cards);

      // Emit "conquer" event so triggered abilities fire
      // (e.g. Blade Dancer's "When you conquer, pay 1 to ready me")
      fireTriggers(
        { battlefieldId, playerId, type: "conquer" },
        {
          cards: context.cards,
          counters: context.counters,
          draft,
          zones: context.zones,
        },
      );

      // Check for victory
      if (player && hasPlayerWon(draft, playerId)) {
        draft.status = "finished";
        draft.winner = playerId;

        context.endGame?.({
          metadata: { finalScore: player.victoryPoints, method: "conquer" },
          reason: "victory_points",
          winner: playerId as CorePlayerId,
        });
      }
    },
  },

  /**
   * Score Point
   *
   * Award a victory point to a player.
   * Two ways to score:
   * - Conquer: Gain control of a battlefield
   * - Hold: Control a battlefield during Beginning Phase
   */
  scorePoint: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }

      const { playerId, battlefieldId } = context.params;

      // Must not have already scored this battlefield this turn
      if (state.scoredThisTurn?.[playerId]?.includes(battlefieldId)) {
        return false;
      }

      // Player must control this battlefield
      const bf = state.battlefields[battlefieldId];
      if (!bf || bf.controller !== playerId) {
        return false;
      }

      // Battlefield abilities (e.g. Forgotten Monument) can block scoring
      if (!canPlayerScoreAtBattlefield(state, playerId, battlefieldId)) {
        return false;
      }

      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }
      if (state.turn.activePlayer !== (context.playerId as string)) {
        return [];
      }

      const scoredThisTurn = state.scoredThisTurn[context.playerId as string] ?? [];
      const results: { playerId: string; method: "conquer" | "hold"; battlefieldId: string }[] = [];

      for (const [bfId, bf] of Object.entries(state.battlefields || {})) {
        if (bf.controller !== (context.playerId as string)) {
          continue;
        }
        if (scoredThisTurn.includes(bfId)) {
          continue;
        }
        if (!canPlayerScoreAtBattlefield(state, context.playerId as string, bfId)) {
          continue;
        }

        // Player controls this BF and hasn't scored it this turn
        results.push({
          battlefieldId: bfId,
          method: "conquer",
          playerId: context.playerId as string,
        });
      }
      return results;
    },
    reducer: (draft, context) => {
      const { playerId, method, battlefieldId } = context.params;
      const { cards, counters, zones } = context;

      // Blocked if a battlefield ability (e.g. Forgotten Monument) prevents
      // This player from scoring here right now.
      const scoringAllowed = canPlayerScoreAtBattlefield(draft, playerId, battlefieldId);

      const player = draft.players[playerId];
      if (!player || !scoringAllowed) {
        // Still record the attempt for idempotence (no VP, no event).
        draft.scoredThisTurn[playerId] = draft.scoredThisTurn[playerId] || [];
        draft.scoredThisTurn[playerId].push(battlefieldId);
        return;
      }

      // Rule 632.1.b.2: If trying to score the Final Point via conquer, the
      // Player must have scored EVERY battlefield this turn. Otherwise, they
      // Draw a card INSTEAD of scoring. No VP, no score event, no scoredThisTurn
      // Entry for this battlefield.
      const victoryScore = draft.victoryScore ?? 8;
      const isFinalPoint = player.victoryPoints === victoryScore - 1;
      if (isFinalPoint && method === "conquer") {
        const allBattlefieldIds = Object.keys(draft.battlefields ?? {});
        const scoredForPlayer = draft.scoredThisTurn[playerId] ?? [];
        const allScored = allBattlefieldIds.every(
          (bfId) => bfId === battlefieldId || scoredForPlayer.includes(bfId),
        );
        if (!allScored) {
          // Draw a card instead of scoring (rule 632.1.b.2).
          zones.drawCards({
            count: 1,
            from: "mainDeck" as CoreZoneId,
            playerId: playerId as CorePlayerId,
            to: "hand" as CoreZoneId,
          });
          // Intentionally do NOT push to scoredThisTurn — the battlefield was
          // Not scored, so a subsequent scorePoint this turn is still legal
          // (e.g. after scoring other battlefields first).
          return;
        }
      }

      // Rule 630.1.a: In team-based modes, conquering a battlefield whose
      // Previous controller was a teammate does not grant a victory
      // Point — the team already effectively controlled it. The battlefield
      // Still counts as "scored this turn" so subsequent scorePoint calls
      // Are idempotent, but no VP is awarded.
      const prevController = context.params.previousController ?? null;
      const teamDisqualified =
        method === "conquer" &&
        isTeamGame(draft) &&
        prevController !== null &&
        prevController !== playerId &&
        areAllies(draft, playerId, prevController as string);

      if (!teamDisqualified) {
        player.victoryPoints += 1;
      }

      // Track that this battlefield was scored this turn
      draft.scoredThisTurn[playerId] = draft.scoredThisTurn[playerId] || [];
      draft.scoredThisTurn[playerId].push(battlefieldId);

      // Hunt keyword (rule 823): [Hunt N] units the player controls here
      // Grant N XP "when I conquer or hold".
      applyHuntXp(draft, battlefieldId, playerId, zones, cards);

      // Rule 632.2: emit the appropriate score event so battlefield score
      // Abilities (on-conquer / on-hold) fire. Only the combat path used to
      // Emit these events — non-combat scorePoint invocations (e.g. Hold
      // During Beginning phase, manual Conquer moves) must fire them too.
      const scoreEvent =
        method === "conquer"
          ? ({ battlefieldId, playerId, type: "conquer" } as const)
          : ({ battlefieldId, playerId, type: "hold" } as const);
      fireTriggers(scoreEvent, { cards, counters, draft, zones });

      // Check for victory
      if (hasPlayerWon(draft, playerId)) {
        draft.status = "finished";
        draft.winner = playerId;

        context.endGame?.({
          metadata: { finalScore: player.victoryPoints, method },
          reason: "victory_points",
          winner: playerId as CorePlayerId,
        });
      }
    },
  },

  /**
   * Clear Combat State
   *
   * Reset combat designations for all units at a battlefield.
   * Called after combat resolution.
   */
  clearCombatState: {
    reducer: (_draft, context) => {
      const { battlefieldId } = context.params;
      const { zones, cards } = context;

      // Get all cards at this battlefield
      const battlefieldZoneId = `battlefield-${battlefieldId}`;
      const unitsAtBattlefield = zones.getCardsInZone(battlefieldZoneId as CoreZoneId);

      // Clear combat role for each unit
      for (const unitId of unitsAtBattlefield) {
        cards.updateCardMeta(unitId, {
          combatRole: null,
        } as Partial<RiftboundCardMeta>);
      }
    },
  },
};
