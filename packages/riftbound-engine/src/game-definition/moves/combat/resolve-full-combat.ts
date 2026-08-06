/**
 * resolveFullCombat move (split from combat.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { CombatUnit } from "../../../combat";
import { resolveCombat } from "../../../combat";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { createInteractionState, getTurnState } from "../../../chain";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import type {
  GrantedKeyword,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../../types";
import { hasPlayerWon } from "../../win-conditions/victory";
import { canPlayerScoreAtBattlefield } from "../../../operations/scoring-rules";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

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
export const resolveFullCombat: Defs["resolveFullCombat"] = {
  condition: (state, context) => {
    if (state.pendingChoice) {
      return false;
    }
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
    if (state.pendingChoice) {
      return [];
    }
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

    // Rule 466.1.a.1 (Combat Cleanup step 3c): heal all surviving Units —
    // combat damage does not persist on survivors past resolution.
    const killedSet = new Set<string>(result.killed);
    for (const unit of [...attackerUnits, ...defenderUnits]) {
      if (killedSet.has(unit.id)) {
        continue;
      }
      counters.clearCounter?.(unit.id as CoreCardId, "damage");
      const survivorMeta = cards.getCardMeta(unit.id as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      if ((survivorMeta?.damage ?? 0) > 0) {
        cards.updateCardMeta(unit.id as CoreCardId, {
          damage: 0,
        } as Partial<RiftboundCardMeta>);
      }
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
};
