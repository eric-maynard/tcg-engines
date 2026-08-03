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
import type { CombatUnit } from "../../combat";
import { resolveCombat } from "../../combat";
import { fireTriggers } from "../../abilities/trigger-runner";
import { createInteractionState, getActiveShowdown, getTurnState } from "../../chain";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
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
      // Rule 140.1.b/c + 516.2.b: Contest is a Discretionary Action,
      // legal only in a Neutral Open state (no chain, no showdown).
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
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
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
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
        battlefield.showdownComplete = false;
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
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
        return false;
      }
      const bf = state.battlefields[context.params.battlefieldId];
      // Rule 625.1 / 516.4.f: the Combat Damage Step (626) follows the
      // mandatory Showdown Step (625). resolveFullCombat may not run until
      // that showdown has completed.
      return bf?.contested === true && bf.showdownComplete === true;
    },
    enumerator: (state) => {
      if (state.status !== "playing") {
        return [];
      }
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
        return [];
      }
      const results: { battlefieldId: string }[] = [];
      for (const [bfId, bf] of Object.entries(state.battlefields || {})) {
        if (bf.contested && bf.showdownComplete) {
          results.push({ battlefieldId: bfId });
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const { battlefieldId } = context.params;
      const { zones, cards, counters } = context;

      const battlefield = draft.battlefields[battlefieldId];
      if (!battlefield || !battlefield.contested) {
        return;
      }

      const attackingPlayer = battlefield.contestedBy;
      if (!attackingPlayer) {
        // Rule 627.4: Resolution Step always clears Contested even when no
        // damage step occurred — otherwise startShowdown re-enumerates forever.
        battlefield.contested = false;
        battlefield.contestedBy = undefined;
        return;
      }

      // Get all unit card IDs at this battlefield
      const battlefieldZoneId = `battlefield-${battlefieldId}` as CoreZoneId;
      const unitIds = zones.getCardsInZone(battlefieldZoneId);

      if (unitIds.length === 0) {
        battlefield.contested = false;
        battlefield.contestedBy = undefined;
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

        const baseMight = def?.might ?? 0;
        // Skip non-unit cards (might === 0 or no might)
        if (baseMight <= 0) {
          continue;
        }

        const currentDamage = meta?.damage ?? 0;

        // Collect keywords from every source: the flat keywords[] array, the
        // abilities[{type:"keyword"}] entries (where card data actually stores
        // them — see hasKeyword fix), and runtime-granted keywords.
        const defKeywords = def?.keywords ?? [];
        const abilityKeywords: string[] = [];
        const grantedKeywords: GrantedKeyword[] = meta?.grantedKeywords ?? [];
        const keywordValues: Record<string, number> = {};

        for (const ability of def?.abilities ?? []) {
          if (ability.type === "keyword" && ability.keyword) {
            abilityKeywords.push(ability.keyword);
            keywordValues[ability.keyword] =
              (keywordValues[ability.keyword] ?? 0) + (ability.value ?? 1);
          }
        }
        for (const gk of grantedKeywords) {
          keywordValues[gk.keyword] = (keywordValues[gk.keyword] ?? 0) + (gk.value ?? 1);
        }

        const allKeywords = [
          ...defKeywords,
          ...abilityKeywords,
          ...grantedKeywords.map((gk) => gk.keyword),
        ];

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

      // If either side is empty, skip the Combat Damage Step (rule 626.1.a.1)
      // but still perform the Resolution Step (rule 627): recall the
      // attacker's cards (627.2 — attacker failed to Conquer) and clear
      // Contested (627.4). Without the recall, non-combat cards remain on
      // both sides and contestBattlefield re-enumerates forever.
      if (attackerUnits.length === 0 || defenderUnits.length === 0) {
        for (const cardId of unitIds) {
          if (cards.getCardOwner(cardId) === attackingPlayer) {
            zones.moveCard({ cardId, targetZoneId: "base" as CoreZoneId });
          }
        }
        battlefield.contested = false;
        battlefield.contestedBy = undefined;
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

      // Kill units that were destroyed
      for (const killedId of result.killed) {
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

      // Apply outcome based on winner
      if (result.winner === "attacker") {
        // Attacker conquers the battlefield
        battlefield.controller = attackingPlayer;

        // Track conquered battlefield for this turn
        if (!draft.conqueredThisTurn[attackingPlayer]) {
          draft.conqueredThisTurn[attackingPlayer] = [];
        }
        draft.conqueredThisTurn[attackingPlayer].push(battlefieldId);

        // Rule 631: a player may only Score once per battlefield per turn.
        // Record scoredThisTurn here so scorePoint/conquerBattlefield can't
        // award a second point for the same battlefield later this turn.
        const alreadyScored =
          draft.scoredThisTurn[attackingPlayer]?.includes(battlefieldId) ?? false;
        if (!draft.scoredThisTurn[attackingPlayer]) {
          draft.scoredThisTurn[attackingPlayer] = [];
        }

        // Award 1 VP for conquering (rule 630.1)
        // Blocked if a battlefield ability (e.g. Forgotten Monument) prevents
        // This player from scoring here right now.
        const scoringAllowed =
          !alreadyScored && canPlayerScoreAtBattlefield(draft, attackingPlayer, battlefieldId);
        const player = draft.players[attackingPlayer];
        if (player && scoringAllowed) {
          draft.scoredThisTurn[attackingPlayer].push(battlefieldId);
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
        // Defenders hold the battlefield
        // Recall surviving attackers (losingSurvivors) to base
        for (const survivorId of result.losingSurvivors) {
          zones.moveCard({
            cardId: survivorId as CoreCardId,
            targetZoneId: "base" as CoreZoneId,
          });
        }
      }
      // Clear combat roles for all remaining units at this battlefield
      const remainingUnits = zones.getCardsInZone(battlefieldZoneId);
      for (const unitId of remainingUnits) {
        cards.updateCardMeta(unitId, {
          combatRole: null,
        } as Partial<RiftboundCardMeta>);
      }

      // Rule 466.5.b (Vendetta): if there are no Units remaining here
      // controlled by any player, the Battlefield becomes Uncontrolled.
      // Without this a mutual-kill leaves the previous controller set and
      // grants illegal Hold scores on an empty battlefield.
      const anyUnitRemaining = remainingUnits.some((id) => {
        const registry = getGlobalCardRegistry();
        return registry.getCardType(id as string) === "unit";
      });
      if (!anyUnitRemaining) {
        battlefield.controller = null;
      }

      // Clear contested status
      battlefield.contested = false;
      battlefield.contestedBy = undefined;
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
      // Rule 140.1.b/c + 589.1.a: Conquer is a Discretionary Action,
      // legal only in a Neutral Open state (no chain, no showdown).
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
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
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
        return [];
      }

      const results: { playerId: string; battlefieldId: string }[] = [];

      for (const [bfId, bf] of Object.entries(state.battlefields || {})) {
        if (bf.controller === (context.playerId as string)) {
          continue;
        }

        // Rule 548.2: Cannot conquer while a showdown is active at this battlefield
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
      // Rule 140.1.b/c + 589.1.a: Scoring is a Discretionary Action,
      // legal only in a Neutral Open state (no chain, no showdown).
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
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
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
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
