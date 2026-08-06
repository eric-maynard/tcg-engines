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
import { PREVENT_WEAKER_ENEMY_COMBAT_DAMAGE, resolveCombat } from "../../../combat";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { findAllReplacements } from "../../../abilities/replacement-effects";
import { createInteractionState, getTurnState } from "../../../chain";
import { cleanupAndFireDeaths } from "../../../cleanup/post-move-cleanup";
import type { PostMoveCleanupContext } from "../../../cleanup/post-move-cleanup";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { unitIgnoresDamage } from "../../../operations/damage-immunity";
import type {
  GrantedKeyword,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../../types";
import { hasPlayerWon } from "../../win-conditions/victory";
import {
  applyScoreReplacement,
  canPlayerScoreAtBattlefield,
  finalPointConquerDrawsInstead,
} from "../../../operations/scoring-rules";

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
/** rule 708 / 710 — a unit is Mighty while its current Might is 5 or more. */
const MIGHTY_THRESHOLD = 5;

/**
 * rule 476.3 — continuous effects are re-applied until the result is stable, and
 * Mighty reads CURRENT Might (708). A combat-only bonus (Shield while defending,
 * rule 814.1.c; Assault while attacking, 719.1.c) can push a unit to 5+ Might,
 * which turns on its own "While I'm [Mighty]" grants — and a Shield gained that
 * way stacks with the one that made it Mighty (814.2). Board-level static recalc
 * cannot see combat-only Might, so those layers are closed here.
 *
 * Grants already applied on the board (`duration: "static"` in grantedKeywords)
 * are skipped so they are not counted twice.
 */
function applyMightyCombatLayers(
  unit: CombatUnit,
  role: "attacker" | "defender",
  abilities: readonly unknown[],
  staticGranted: ReadonlySet<string>,
): CombatUnit {
  const grants: { keyword: string; value: number }[] = [];
  for (const raw of abilities) {
    const ability = raw as {
      type?: string;
      condition?: { type?: string };
      effect?: {
        type?: string;
        keyword?: string;
        keywords?: string[];
        value?: number;
        target?: unknown;
      };
    };
    if (ability.type !== "static" || ability.condition?.type !== "while-mighty") {
      continue;
    }
    const effect = ability.effect;
    const target = effect?.target as { type?: string } | string | undefined;
    const selfTargeted =
      target === undefined ||
      target === "self" ||
      (typeof target === "object" && target?.type === "self");
    if (!selfTargeted) {
      continue;
    }
    if (effect?.type === "grant-keyword" && effect.keyword) {
      grants.push({ keyword: effect.keyword, value: effect.value ?? 1 });
    } else if (effect?.type === "grant-keywords" && Array.isArray(effect.keywords)) {
      for (const keyword of effect.keywords) {
        grants.push({ keyword, value: 1 });
      }
    }
  }
  if (grants.length === 0) {
    return unit;
  }

  const keywords = [...unit.keywords];
  const keywordValues: Record<string, number> = { ...(unit.keywordValues ?? {}) };
  const valueOf = (keyword: string): number =>
    keywordValues[keyword] ?? keywords.filter((k) => k === keyword).length;
  const roleKeyword = role === "defender" ? "Shield" : "Assault";
  const applied = new Set<number>();

  for (let pass = 0; pass <= grants.length; pass++) {
    if (unit.baseMight + valueOf(roleKeyword) < MIGHTY_THRESHOLD) {
      break;
    }
    let changed = false;
    for (const [index, grant] of grants.entries()) {
      if (applied.has(index) || staticGranted.has(grant.keyword)) {
        continue;
      }
      applied.add(index);
      keywordValues[grant.keyword] = valueOf(grant.keyword) + grant.value;
      keywords.push(grant.keyword);
      changed = true;
    }
    if (!changed) {
      break;
    }
  }

  if (applied.size === 0) {
    return unit;
  }
  return { ...unit, keywordValues, keywords };
}

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

    // rule-id: sfd-110-221 (rule 466.7.c) — "this combat" Might changes end at
    // Combat Cleanup: revert the combat-scoped portion of mightModifier.
    const expireCombatMight = (): void => {
      for (const id of unitIds) {
        const m = cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined;
        const combatMod = m?.combatMightModifier ?? 0;
        if (combatMod !== 0) {
          cards.updateCardMeta(id, {
            combatMightModifier: 0,
            mightModifier: (m?.mightModifier ?? 0) - combatMod,
          } as Partial<RiftboundCardMeta>);
        }
      }
    };

    // Look up card definitions from the global registry
    const registry = getGlobalCardRegistry();

    // Build CombatUnit arrays partitioned by attacker/defender
    const attackerUnits: CombatUnit[] = [];
    const defenderUnits: CombatUnit[] = [];

    // rule-id: ogn-254-298 — a runtime take-damage→kill replacement bound to a
    // unit ("Kill it the next time it takes damage this turn") must also fire
    // on combat damage, not only spell/ability damage.
    // rule-id: ogn-221-298 (Imperial Decree) — a turn-wide, unbound
    // take-damage→kill entry ("When any unit takes damage this turn, kill it")
    // applies to every unit in this combat.
    const activeRepl = draft.activeReplacements as
      | {
          replaces?: string;
          replacement?: unknown;
          duration?: string;
          targetCardIds?: readonly string[];
        }[]
      | undefined;
    const killOnDamageIdx = (unitId: string): number =>
      activeRepl?.findIndex(
        (e) =>
          e?.replaces === "take-damage" &&
          (e.targetCardIds
            ? e.targetCardIds.includes(unitId)
            : e.duration === "turn") &&
          (e.replacement as { type?: string } | undefined)?.type === "kill",
      ) ?? -1;

    for (const cardId of unitIds) {
      const owner = cards.getCardOwner(cardId) ?? "";
      const meta = cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      const def = registry.get(cardId as string);

      const printedMight = def?.might ?? 0;
      // Skip non-unit cards (might === 0 or no might)
      if (printedMight <= 0) {
        continue;
      }

      // rule-id: unl-143-219 — combat uses the unit's *current* Might (printed
      // + buff + turn-scoped mightModifier + static bonus + equipment), not the
      // registry's printed value, for both damage dealt and lethal threshold.
      let equipBonus = 0;
      for (const equipId of meta?.equippedWith ?? []) {
        equipBonus += registry.getMightBonus(equipId as string);
      }
      const baseMight = Math.max(
        0,
        printedMight +
          (meta?.buffed ? 1 : 0) +
          (meta?.extraBuffs ?? 0) +
          (meta?.mightModifier ?? 0) +
          (meta?.staticMightBonus ?? 0) +
          equipBonus,
      );

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
        } else if (ability.type === "static" && ability.condition === undefined) {
          // rule-id: unl-060-219 — an unconditional self-granted marker keyword
          // must reach combat even if no static recalc ran since it entered play.
          const eff = ability.effect as { type?: string; keyword?: string; target?: unknown };
          if (
            eff?.type === "grant-keyword" &&
            eff.keyword === PREVENT_WEAKER_ENEMY_COMBAT_DAMAGE &&
            (eff.target === undefined || eff.target === "self") &&
            !grantedKeywords.some((gk) => gk.keyword === eff.keyword)
          ) {
            abilityKeywords.push(eff.keyword);
          }
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
        // rule 437.5.a / 465.2.c.5: a "prevent the next N damage" shield is
        // part of this unit's lethal-damage calculation at ASSIGNMENT time.
        ...(((meta as { damagePreventionShield?: number } | undefined)?.damagePreventionShield ?? 0) > 0
          ? {
              preventValue: (meta as { damagePreventionShield?: number }).damagePreventionShield,
            }
          : {}),
        ...((meta as { preventNextDamageInstance?: boolean } | undefined)
          ?.preventNextDamageInstance === true
          ? { preventsNextDamageInstance: true }
          : {}),
        ...(killOnDamageIdx(cardId as string) >= 0 ? { diesOnAnyDamage: true } : {}),
        // rule 465.2.c.10 (ogn-189-298): "I don't take damage" — skipped for
        // damage assignment and never dealt lethal damage.
        ...(unitIgnoresDamage(cardId as string, draft) ? { immuneToDamage: true } : {}),
        // rule 423.1.b: a stunned unit deals no combat damage (it still takes damage).
        ...(meta?.stunned === true ||
        (meta as { __flags?: Record<string, boolean> } | undefined)?.__flags?.stunned === true
          ? { dealsNoCombatDamage: true }
          : {}),
      };

      const role = owner === attackingPlayer ? "attacker" : "defender";
      const staticGranted = new Set(
        grantedKeywords.filter((gk) => gk.duration === "static").map((gk) => gk.keyword),
      );
      const layered = applyMightyCombatLayers(unit, role, def?.abilities ?? [], staticGranted);
      if (role === "attacker") {
        attackerUnits.push(layered);
      } else {
        defenderUnits.push(layered);
      }
    }

    // rule 465.1: the Combat Damage Step only happens if both Attacking and
    // Defending units remain here when the showdown closes. If one side left
    // during the showdown (e.g. the lone defender was killed by a spell), skip
    // straight to the Resolution Step — rule 466.3.a / 466.5: the player with
    // units remaining wins and Establishes Control (a Conquer).
    // rule-id: ogn-034-298 — excess damage assigned to enemy units this combat.
    let excessDamage = battlefield.combatExcessDamage ?? 0;
    // rule 466.2: chain items from the Combat Damage Step / Combat Cleanup
    // already resolved on an earlier pass — go straight to the result step.
    const damageAlreadyDone = battlefield.combatDamageDone === true;
    battlefield.combatDamageDone = undefined;
    battlefield.combatExcessDamage = undefined;
    if (!damageAlreadyDone && attackerUnits.length > 0 && defenderUnits.length > 0) {
    // Run the combat resolver
    const result = resolveCombat(attackerUnits, defenderUnits);
    excessDamage = result.attackerExcessDamage;

    // Apply damage to each unit from damageAssignment
    for (const [unitId, assigned] of Object.entries(result.damageAssignment)) {
      if (assigned > 0) {
        // rule 437.4 / 437.7: a Prevent shield absorbs the assigned damage
        // (fully prevented damage counts as not dealt) and is spent by it.
        const existingMeta = cards.getCardMeta(unitId as CoreCardId) as
          | (Partial<RiftboundCardMeta> & {
              damagePreventionShield?: number;
              preventNextDamageInstance?: boolean;
            })
          | undefined;
        // rule 437.2.a / 437.4 (sfd-194-221): a "prevent it" shield replaces the
        // whole assigned instance with 0 and is spent by it.
        if (existingMeta?.preventNextDamageInstance === true) {
          cards.updateCardMeta(unitId as CoreCardId, {
            preventNextDamageInstance: false,
          } as unknown as Partial<RiftboundCardMeta>);
          continue;
        }
        const shield = Math.max(0, existingMeta?.damagePreventionShield ?? 0);
        const prevented = Math.min(shield, assigned);
        const dmg = assigned - prevented;
        if (prevented > 0) {
          cards.updateCardMeta(unitId as CoreCardId, {
            damagePreventionShield: shield - prevented,
          } as unknown as Partial<RiftboundCardMeta>);
        }
        if (dmg <= 0) {
          continue;
        }
        counters.addCounter(unitId as CoreCardId, "damage", dmg);
        // Also update card meta damage for consistency
        const existingDamage = existingMeta?.damage ?? 0;
        cards.updateCardMeta(
          unitId as CoreCardId,
          {
            damage: existingDamage + dmg,
          } as Partial<RiftboundCardMeta>,
        );
      }
    }

    // rule 466.1 (Combat Cleanup): combat deaths are ordinary deaths — reap
    // lethally-damaged units through the state-based pipeline so board die
    // replacements (Zhonya's Hourglass, rule 372/373), equipment detach and
    // `die` triggers (Deathknell, rule 808) all apply, instead of trashing
    // `result.killed` directly.
    // The resolver's lethal threshold includes combat-only Might (Shield),
    // which the state-based check can't see — so heal the resolver's survivors
    // first (rule 466.1.a.1: combat damage never persists on survivors) and
    // hand exactly `result.killed` to the cleanup with lethal damage marked.
    const killedSet = new Set<string>(result.killed);
    for (const unit of [...attackerUnits, ...defenderUnits]) {
      if (killedSet.has(unit.id)) {
        // rule-id: ogn-254-298 — a take-damage→kill replacement fired on this
        // unit's combat damage: it dies even to non-lethal damage, and a
        // "next"-duration one is spent.
        if ((result.damageAssignment[unit.id] ?? 0) > 0) {
          const idx = killOnDamageIdx(unit.id);
          if (activeRepl && idx >= 0 && activeRepl[idx]?.duration === "next") {
            activeRepl.splice(idx, 1);
          }
        }
        const metaNow = cards.getCardMeta(unit.id as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        // rule 428.5.c.2: a combat death is a kill by the opposing
        // combatant's controller ("When you kill a stunned enemy unit").
        cards.updateCardMeta(unit.id as CoreCardId, {
          ...((metaNow?.damage ?? 0) < unit.baseMight ? { damage: Math.max(1, unit.baseMight) } : {}),
          lastDamageSource: "combat",
          lastDamagedBy: unit.owner === attackingPlayer ? defenderUnits[0]?.owner : attackingPlayer,
        } as Partial<RiftboundCardMeta>);
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
    cleanupAndFireDeaths(draft, context as unknown as PostMoveCleanupContext);

    // rule 466.2: resolve every chain item from combat damage and the Combat
    // Cleanup (Deathknell, "when a unit dies" …) BEFORE determining the combat
    // result — a Deathknell that kills the last attacker means no conquer.
    // The battlefield stays contested/showdown-complete, so this move re-runs
    // as soon as the chain empties (its condition needs a neutral-open state).
    if (draft.interaction?.chain?.active === true) {
      battlefield.combatDamageDone = true;
      battlefield.combatExcessDamage = excessDamage;
      return;
    }
    }

    // rule 466.3: the combat result is read off who still has units HERE after
    // the Combat Cleanup (a death replacement may have recalled or removed a
    // unit the resolver counted as killed or surviving).
    const unitsHereNow = zones
      .getCardsInZone(battlefieldZoneId)
      .filter((id) => (registry.get(id as string)?.might ?? 0) > 0 || registry.getCardType(id as string) === "unit");
    const attackersLeft = unitsHereNow.filter((id) => cards.getCardOwner(id) === attackingPlayer);
    const defendersLeft = unitsHereNow.filter((id) => cards.getCardOwner(id) !== attackingPlayer);
    let winner: "attacker" | "defender" | "tie";
    if (attackersLeft.length > 0 && defendersLeft.length === 0) {
      winner = "attacker";
    } else if (attackersLeft.length === 0 && defendersLeft.length === 0) {
      winner = "tie";
    } else {
      // rule 466.1.a.2 / 466.3.d: defenders still present → attackers recalled.
      winner = "defender";
    }

    // Apply outcome based on winner
    if (winner === "attacker") {
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
        !alreadyScored &&
        canPlayerScoreAtBattlefield(draft, attackingPlayer, battlefieldId) &&
        // rule 471.1.b.1: the Final Point by conquer requires every battlefield
        // scored this turn; otherwise draw a card instead (and don't record it
        // as scored).
        !finalPointConquerDrawsInstead(draft, attackingPlayer, battlefieldId, { cards, zones });
      const player = draft.players[attackingPlayer];
      if (player && scoringAllowed) {
        draft.scoredThisTurn[attackingPlayer].push(battlefieldId);
        // Rule 571.4: a board `score` replacement (e.g. Otterpus) substitutes for the point.
        if (!applyScoreReplacement(draft, attackingPlayer, { cards, zones })) {
          player.victoryPoints += 1;
        }

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
      // rule-id: ogn-034-298 — this conquer happened after an attack, so it
      // carries the excess damage the attackers assigned (rule 626.1.d.2).
      fireTriggers(
        {
          afterAttack: true,
          battlefieldId,
          excessDamage,
          playerId: attackingPlayer,
          type: "conquer",
        },
        { cards, counters, draft, zones },
      );

    } else if (winner === "defender") {
      // rule 740.3.a — units of BOTH players still here in step 3d of the
      // Combat Cleanup is a tie. rule-id: ogn-227-298 (Symbol of the Solari):
      // a `combat-tie` replacement owned by the attacker replaces the
      // attacker-only recall (466.1.a.2) with recalling ALL units here. It
      // isn't a move, so nothing is exhausted and no `move` event fires; the
      // emptied battlefield then becomes Uncontrolled (466.5.b).
      const tieReplacement =
        attackersLeft.length > 0 && defendersLeft.length > 0
          ? findAllReplacements(
              { owner: attackingPlayer, playerId: attackingPlayer, type: "combat-tie" },
              { cards, draft, zones },
            ).find(
              (m) =>
                m.sourceOwner === attackingPlayer &&
                (m.replacement as { type?: string } | undefined)?.type === "recall",
            )
          : undefined;
      // Defenders hold the battlefield
      // rule 466.1.a.2: recall attackers still present to base (every
      // attacker-owned card here, so nothing lingers to re-contest).
      for (const survivorId of zones
        .getCardsInZone(battlefieldZoneId)
        .filter((id) =>
          tieReplacement !== undefined
            ? registry.getCardType(id as string) === "unit" ||
              (registry.get(id as string)?.might ?? 0) > 0
            : cards.getCardOwner(id) === attackingPlayer,
        )) {
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
    expireCombatMight();

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
