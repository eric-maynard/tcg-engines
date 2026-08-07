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
import {
  NO_COMBAT_DAMAGE,
  PREVENT_WEAKER_ENEMY_COMBAT_DAMAGE,
  planCombatDamageAssignments,
  resolveCombat,
} from "../../../combat";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { findAllReplacements } from "../../../abilities/replacement-effects";
import { createInteractionState, getTurnState } from "../../../chain";
import { cleanupAndFireDeaths } from "../../../cleanup/post-move-cleanup";
import { openPendingContestedShowdown } from "../chain/showdown";
import type { PostMoveCleanupContext } from "../../../cleanup/post-move-cleanup";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { getCardEffectiveMight } from "../play/cost";
import { collectAnyDamageLethalPlayers } from "../../../operations/lethal-damage";
import { unitIgnoresDamage } from "../../../operations/damage-immunity";
import { addDamage, clearDamage, getDamage, setDamage } from "../../../operations/damage-store";
import type {
  GrantedKeyword,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../../types";
import { scoreBattlefield, scoreEvents } from "../../../operations/points";

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

    // rule 188 / 469.1: who held the battlefield as combat began — combat
    // deaths can empty it and state-based checks clear control (466.5.b)
    // before the outcome is applied, so "a battlefield that was uncontrolled"
    // must read the controller from before the damage step, not after.
    const controllerBeforeCombat = battlefield.controller ?? null;

    const attackingPlayer = battlefield.contestedBy;
    if (!attackingPlayer) {
      // Rule 627.4: Resolution Step always clears Contested even when no
      // damage step occurred — otherwise startShowdown re-enumerates forever.
      battlefield.contested = false;
      battlefield.contestedBy = undefined;
      return;
    }

    // rule 434 / 190.3.a (unl-140-219 Conscription) — a unit fights for its
    // CONTROLLER, not its owner: a conscripted unit attacks alongside its new
    // controller's units and is recalled with them, while still being owned
    // (and trashed) by its original owner.
    const sideOf = (cardId: CoreCardId): string =>
      ((cards.getCardController?.(cardId) ?? cards.getCardOwner(cardId)) as string | undefined) ?? "";

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

    // rule 142.4.c — an enemy board static ("Any amount of your damage is
    // enough to kill enemy units") lowers this unit's lethal-damage value, and
    // combat damage assignment (465.2.c.3) must use that lowered value.
    const anyDamageLethalPlayers = collectAnyDamageLethalPlayers({ cards, draft, zones });

    for (const cardId of unitIds) {
      const owner = cards.getCardOwner(cardId) ?? "";
      const meta = cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
      const def = registry.get(cardId as string);

      const printedMight = def?.might ?? 0;
      // Skip non-unit cards (gear, …). rule 142.4.b: a 0-Might unit is a real
      // body in combat — it takes damage (any non-zero damage is lethal) and is
      // counted for the combat result, so printed Might alone can't exclude it.
      const cardType = registry.getCardType(cardId as string);
      if (cardType !== undefined ? cardType !== "unit" : printedMight <= 0) {
        continue;
      }

      // rule-id: unl-143-219 — combat uses the unit's *current* Might (printed
      // + buff + turn-scoped mightModifier + static bonus + equipment), not the
      // registry's printed value, for both damage dealt and lethal threshold.
      let equipBonus = 0;
      for (const equipId of meta?.equippedWith ?? []) {
        equipBonus += registry.getMightBonus(equipId as string);
      }
      // rule 323.5 — combat reads a set base Might in place of the printed one.
      const baseMight = Math.max(
        0,
        (meta?.baseMightOverride ?? printedMight) +
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
            (eff.keyword === PREVENT_WEAKER_ENEMY_COMBAT_DAMAGE ||
              eff.keyword === NO_COMBAT_DAMAGE) &&
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
        // rule 142.4.c: any damage from the opposing side is lethal to this unit.
        ...([...anyDamageLethalPlayers].some(
          (p) => p !== ((cards.getCardController?.(cardId) ?? owner) as string),
        )
          ? { lethalDamageOverride: 1 }
          : {}),
        // rule 465.2.c.10 (ogn-189-298): "I don't take damage" — skipped for
        // damage assignment and never dealt lethal damage.
        ...(unitIgnoresDamage(cardId as string, draft, () => meta as { empowered?: boolean; combatRole?: string } | undefined) ? { immuneToDamage: true } : {}),
        // rule 423.1.b: a stunned unit deals no combat damage (it still takes damage).
        // Same for a unit carrying the NoCombatDamage marker ("I don't deal combat
        // damage." — sfd-082-221), printed or granted by a static.
        ...(meta?.stunned === true ||
        (meta as { __flags?: Record<string, boolean> } | undefined)?.__flags?.stunned === true ||
        allKeywords.includes(NO_COMBAT_DAMAGE)
          ? { dealsNoCombatDamage: true }
          : {}),
      };

      const role = sideOf(cardId) === attackingPlayer ? "attacker" : "defender";
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

    // rule 466.7.b — roster of units that were in this combat, so "when a
    // combat that I was in ends" can fire for survivors (and for attackers
    // recalled home by 466.1.a.2, which were still in it — rule 466.7.a).
    const combatParticipantIds = new Set<string>(
      [...attackerUnits, ...defenderUnits].map((u) => u.id as string),
    );

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
    // rule 466.1.a.2 — whether the attackers were recalled is decided during
    // the Combat Cleanup, not at the Resolution Step; carry that fact across
    // the deferral in 466.2.
    let noDefendersAtCleanup = battlefield.combatNoDefendersAtCleanup === true;
    // rules 371.2 / 372 / 373 — the Combat Cleanup waited on a die-replacement
    // question; it has finished now, so read "no defender left" off the board.
    if (damageAlreadyDone && battlefield.combatCleanupSuspended === true) {
      noDefendersAtCleanup =
        zones
          .getCardsInZone(battlefieldZoneId)
          .filter(
            (id) =>
              sideOf(id) !== attackingPlayer &&
              (registry.getCardType(id as string) === "unit" ||
                (registry.get(id as string)?.might ?? 0) > 0),
          ).length === 0;
    }
    battlefield.combatDamageDone = undefined;
    battlefield.combatExcessDamage = undefined;
    battlefield.combatNoDefendersAtCleanup = undefined;
    battlefield.combatCleanupSuspended = undefined;
    if (!damageAlreadyDone && attackerUnits.length > 0 && defenderUnits.length > 0) {
    // rule 465.2.c.3 / 465.2.c.7 — each side's player chooses which opposing
    // unit is made lethal first whenever more than one legal assignment
    // exists. Ask before any damage is written; the answer is stored on the
    // battlefield and this move re-runs (its condition is blocked while a
    // pendingChoice exists) with both allocations in hand.
    // rule 766 / 767 — "You ignore [Tank] while assigning combat damage here"
    // (ven-004-166): only that unit's controller, and only at ITS battlefield.
    const ignoresTankHere = (playerId: string | undefined): boolean =>
      playerId !== undefined &&
      [...attackerUnits, ...defenderUnits].some(
        (u) =>
          ((cards.getCardController?.(u.id as CoreCardId) ?? u.owner) as string) === playerId &&
          (getGlobalCardRegistry().getAbilities(u.id) ?? []).some(
            (a) =>
              a.type === "static" &&
              (a.effect as { type?: string; keyword?: string } | undefined)?.type ===
                "ignore-keyword" &&
              (a.effect as { keyword?: string }).keyword === "Tank",
          ),
      );
    const defendingPlayer = defenderUnits[0]?.owner;
    const attackerIgnoresTank = ignoresTankHere(attackingPlayer as string);
    const defenderIgnoresTank = ignoresTankHere(defendingPlayer as string | undefined);
    const plans = planCombatDamageAssignments(attackerUnits, defenderUnits, {
      attackerIgnoresTank,
      defenderIgnoresTank,
    });
    const raiseAssignment = (
      side: "attacker" | "defender",
      playerId: string,
      plan: (typeof plans)["attacker"],
    ): void => {
      draft.pendingChoice = {
        battlefieldId,
        defaultAllocation: { ...plan.defaultAllocation },
        lethalNeed: { ...plan.need },
        options: [...plan.order] as CoreCardId[],
        playerId: playerId as CorePlayerId,
        side,
        tier: { ...plan.tier },
        total: plan.total,
        type: "combat-damage",
      };
      // The deferral bookkeeping cleared above must survive the round trip.
      battlefield.combatExcessDamage = excessDamage > 0 ? excessDamage : undefined;
      battlefield.combatNoDefendersAtCleanup = noDefendersAtCleanup ? true : undefined;
    };
    if (battlefield.combatDamageAllocation === undefined && plans.attacker.hasChoice) {
      raiseAssignment("attacker", attackingPlayer, plans.attacker);
      return;
    }
    if (
      battlefield.combatDefenderDamageAllocation === undefined &&
      plans.defender.hasChoice &&
      defendingPlayer
    ) {
      raiseAssignment("defender", defendingPlayer, plans.defender);
      return;
    }
    const chosenAttackerAssignment = battlefield.combatDamageAllocation;
    const chosenDefenderAssignment = battlefield.combatDefenderDamageAllocation;
    battlefield.combatDamageAllocation = undefined;
    battlefield.combatDefenderDamageAllocation = undefined;
    // Run the combat resolver
    const result = resolveCombat(attackerUnits, defenderUnits, {
      attackerIgnoresTank,
      defenderIgnoresTank,
      ...(chosenAttackerAssignment ? { attackerAssignment: { ...chosenAttackerAssignment } } : {}),
      ...(chosenDefenderAssignment ? { defenderAssignment: { ...chosenDefenderAssignment } } : {}),
    });
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
        // rule 520 / 124.1 — single damage store (counter + meta mirror).
        addDamage(context, unitId, dmg);
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
        // rule 428.5.c.2: a combat death is a kill by the opposing
        // combatant's controller ("When you kill a stunned enemy unit").
        const attribution = {
          lastDamageSource: "combat",
          lastDamagedBy: unit.owner === attackingPlayer ? defenderUnits[0]?.owner : attackingPlayer,
        };
        if (getDamage(context, unit.id) < unit.baseMight) {
          setDamage(context, unit.id, Math.max(1, unit.baseMight), attribution);
        } else {
          cards.updateCardMeta(unit.id as CoreCardId, attribution as Partial<RiftboundCardMeta>);
        }
        continue;
      }
      if (getDamage(context, unit.id) > 0) {
        clearDamage(context, unit.id);
      }
    }

    // rule 466.1.a.1: the Combat Cleanup's step 3c is "Heal all Units" — it has
    // no location qualifier, so damage on units outside this combat (in a base
    // or at another battlefield) is cleared too. Lethally damaged bystanders are
    // left alone: they are killed by the cleanup below before any healing.
    const combatantIds = new Set<string>([...attackerUnits, ...defenderUnits].map((u) => u.id));
    const healZoneIds: string[] = [];
    for (const playerId of Object.keys(draft.players ?? {})) {
      for (const id of zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId)) {
        if (!combatantIds.has(id as string)) {
          healZoneIds.push(id as string);
        }
      }
    }
    for (const bfId of Object.keys(draft.battlefields ?? {})) {
      for (const id of zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)) {
        if (!combatantIds.has(id as string)) {
          healZoneIds.push(id as string);
        }
      }
    }
    for (const id of healZoneIds) {
      const dmg = getDamage(context, id as string);
      if (dmg <= 0) {
        continue;
      }
      if (dmg >= getCardEffectiveMight(id as string, (cid) => cards.getCardMeta(cid) as Partial<RiftboundCardMeta> | undefined)) {
        continue;
      }
      clearDamage(context, id as string);
    }

    cleanupAndFireDeaths(draft, context as unknown as PostMoveCleanupContext);

    // rules 371.2 / 372 / 373 — the Combat Cleanup is waiting on a
    // die-replacement question (which shield, which death, pay?): nothing has
    // died yet, so the result cannot be read. Defer exactly like rule 466.2 —
    // this move re-runs once the answer's cleanup has finished.
    if (draft.pendingChoice) {
      battlefield.combatDamageDone = true;
      battlefield.combatExcessDamage = excessDamage;
      battlefield.combatCleanupSuspended = true;
      return;
    }

    // rule 466.1.a.2: with no defending unit left here when the Combat Cleanup
    // finished, the surviving attackers stay — nothing recalls them.
    noDefendersAtCleanup =
      zones
        .getCardsInZone(battlefieldZoneId)
        .filter(
          (id) =>
            sideOf(id) !== attackingPlayer &&
            (registry.getCardType(id as string) === "unit" ||
              (registry.get(id as string)?.might ?? 0) > 0),
        ).length === 0;

    // rule 466.2: resolve every chain item from combat damage and the Combat
    // Cleanup (Deathknell, "when a unit dies" …) BEFORE determining the combat
    // result — a Deathknell that kills the last attacker means no conquer.
    // The battlefield stays contested/showdown-complete, so this move re-runs
    // as soon as the chain empties (its condition needs a neutral-open state).
    if (draft.interaction?.chain?.active === true) {
      battlefield.combatDamageDone = true;
      battlefield.combatExcessDamage = excessDamage;
      battlefield.combatNoDefendersAtCleanup = noDefendersAtCleanup;
      return;
    }
    }

    // rule 466.3: the combat result is read off who still has units HERE after
    // the Combat Cleanup (a death replacement may have recalled or removed a
    // unit the resolver counted as killed or surviving).
    const unitsHereNow = zones
      .getCardsInZone(battlefieldZoneId)
      .filter((id) => (registry.get(id as string)?.might ?? 0) > 0 || registry.getCardType(id as string) === "unit");
    const attackersLeft = unitsHereNow.filter((id) => sideOf(id) === attackingPlayer);
    const defendersLeft = unitsHereNow.filter((id) => sideOf(id) !== attackingPlayer);
    // rule 466.3.d: both players have units here but the Combat Cleanup left no
    // defender behind (a pending Deathknell put a fresh unit here afterwards) —
    // the combat has No Result: nobody conquers, nobody is recalled, and
    // rule 466.3.d.1 stages a new combat here immediately.
    if (noDefendersAtCleanup && attackersLeft.length > 0 && defendersLeft.length > 0) {
      for (const unitId of zones.getCardsInZone(battlefieldZoneId)) {
        cards.updateCardMeta(unitId, { combatRole: null } as Partial<RiftboundCardMeta>);
      }
      expireCombatMight();
      battlefield.showdownComplete = false;
      battlefield.contested = true;
      battlefield.contestedBy = attackingPlayer;
      // rule 466.3.d.1 — the new combat is staged immediately, not offered as a
      // discretionary action.
      openPendingContestedShowdown(
        draft,
        context as unknown as Parameters<typeof openPendingContestedShowdown>[1],
      );
      return;
    }

    // rule 466.1.a.2: defenders still present → the attackers are recalled,
    // whether the defenders won the combat or it was a tie.
    const attackersRecalled = defendersLeft.length > 0;
    let winner: "attacker" | "defender" | "tie";
    if (attackersLeft.length > 0 && defendersLeft.length === 0) {
      winner = "attacker";
    } else if (attackersLeft.length === 0 && defendersLeft.length > 0) {
      winner = "defender";
    } else {
      // rule 740.3.a / 466.3.d: nobody left here, or units of BOTH players
      // left — No Result, so neither side won.
      winner = "tie";
    }

    // rule 466.3.a — the units still here on the side that carried the combat
    // won it, so their "When I win a combat" triggers fire. A tie (740.3.a)
    // has no winner, so nothing fires.
    if (winner !== "tie") {
      for (const unitId of winner === "attacker" ? attackersLeft : defendersLeft) {
        fireTriggers(
          {
            battlefieldId,
            cardId: unitId as string,
            playerId:
              (cards.getCardController?.(unitId) as string | undefined) ??
              (cards.getCardOwner(unitId) as string | undefined),
            type: "win-combat",
          },
          { cards, counters, draft, zones },
        );
      }
    }

    // Units recalled to base by this resolution (rule 466.1.a.2).
    const recalledUnits: CoreCardId[] = [];

    // Apply outcome based on winner
    if (winner === "attacker") {
      // Attacker conquers the battlefield
      battlefield.controller = attackingPlayer;

      // rule 469.1 / 471: establishing control is a Conquer (a Score, worth up
      // to one point) unless this player already scored here this turn or a
      // battlefield static forbids scoring here. The point itself goes through
      // the awardPoints gates (denial, skips, Final Point → draw instead); the
      // victory check waits for the Cleanup below (rule 472).
      const { isScore } = scoreBattlefield(
        draft,
        attackingPlayer,
        battlefieldId,
        "conquer",
        { cards, zones },
        { previousController: controllerBeforeCombat },
      );

      // Emit "conquer" event so triggered abilities fire
      // rule-id: ogn-034-298 — this conquer happened after an attack, so it
      // carries the excess damage the attackers assigned (rule 626.1.d.2).
      // rule 471.2.c: Conquer abilities only trigger when the battlefield is
      // actually Scored, so re-taking one this player already scored this turn
      // establishes control without firing them. rule 471.2.a: the
      // draw-instead Final Point case (471.1.b.1) still Conquered, so its
      // triggers do fire.
      if (isScore) {
        for (const event of scoreEvents(attackingPlayer, battlefieldId, "conquer", {
          afterAttack: true,
          excessDamage,
          previousController: controllerBeforeCombat,
        })) {
          fireTriggers(event, { cards, counters, draft, zones });
        }
      }

    } else if (attackersRecalled) {
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
            : sideOf(id) === attackingPlayer,
        )) {
        // rule 466.7.a: a recalled attacker leaves the combat, so its
        // designation must be cleared too — it is no longer here below.
        recalledUnits.push(survivorId as CoreCardId);
        zones.moveCard({
          cardId: survivorId as CoreCardId,
          targetZoneId: "base" as CoreZoneId,
        });
      }
    }
    // rule 466.7.a: remove the Attacker/Defender designation from every unit
    // that was in this combat — those still here and those recalled to base.
    const remainingUnits = zones.getCardsInZone(battlefieldZoneId);
    for (const unitId of [...remainingUnits, ...recalledUnits]) {
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

    // rule 466.7.b: the combat ENDS here, as the last step of the Resolution
    // Step — after damage, kills, recalls and control are settled. Every unit
    // that was in it and is still on the board sees it end; ones that died are
    // in the trash and see nothing (rule 428.1.a).
    for (const unitId of [...remainingUnits, ...recalledUnits]) {
      if (!combatParticipantIds.has(unitId as string)) {
        continue;
      }
      fireTriggers(
        {
          battlefieldId,
          cardId: unitId as string,
          playerId:
            (cards.getCardController?.(unitId) as string | undefined) ??
            (cards.getCardOwner(unitId) as string | undefined),
          type: "combat-end",
        },
        { cards, counters, draft, zones },
      );
    }

    // rule 319.1 / 472 — the Cleanup that follows combat resolution: statics,
    // state-based checks, and the victory check for a conquer point.
    cleanupAndFireDeaths(draft, context as unknown as PostMoveCleanupContext);
  },
};
