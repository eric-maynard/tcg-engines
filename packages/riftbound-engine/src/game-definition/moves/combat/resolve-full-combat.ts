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
  combatLethalMight,
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
import { clearDamage, getDamage, setDamage } from "../../../operations/damage-store";
import {
  type DamageRequest,
  damageReplacementProfile,
  dealDamageBatch,
} from "../../../operations/deal-damage";
import type {
  GrantedKeyword,
  PendingItem,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../../types";
import { settleControlByRemainingUnits } from "../../../operations/battlefield-control";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Resolve Full Combat
 *
 * Automated combat resolution using the combat resolver (rules 620-628).
 * Gathers units at the battlefield, partitions by owner, builds CombatUnit arrays,
 * calls resolveCombat(), then applies damage, kills, and outcome.
 *
 * Outcome handling (rule 466): Defenders still present ⇒ Attackers recalled
 * (466.1.a.2); then 466.5 — the sole player with units remaining establishes
 * control (a Conquer if they did not already control it), nobody ⇒ Uncontrolled.
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

    // rule 188 / 190.4.b / 469.1: who holds the battlefield as its Resolution
    // Step runs. Control is frozen for the whole Combat (the 323.6 vacancy check
    // skips a battlefield with a Combat ongoing — operations/battlefield-control.ts),
    // so this is the pre-combat controller; "conquer a battlefield that was
    // uncontrolled" (sfd-116-221 Yone) reads it off the `conquer` event.
    const controllerBeforeCombat =
      battlefield.controller ?? battlefield.controllerAtShowdownStart ?? null;

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
      // rule 466.3.d / 466.5.b — nobody is left here (both sides died to combat
      // damage whose triggers deferred this step, or left during the showdown):
      // No Result; the battlefield stops being Contested and becomes
      // Uncontrolled. Control was frozen for the whole combat (190.4.b), so this
      // is where the emptied battlefield is given up — operations/battlefield-control.ts.
      settleControlByRemainingUnits({ cards, counters, draft, zones }, battlefieldId, "combat");
      battlefield.combatDamageDone = undefined;
      battlefield.combatExcessDamage = undefined;
      battlefield.combatNoDefendersAtCleanup = undefined;
      battlefield.combatCleanupSuspended = undefined;
      battlefield.combatWinTriggersFired = undefined;
      cleanupAndFireDeaths(draft, context as unknown as PostMoveCleanupContext);
      return;
    }

    // rule-id: sfd-110-221 (rule 466.7.c) — "this combat" Might changes end at
    // Combat Cleanup: revert the combat-scoped portion of mightModifier.
    const expireCombatMight = (): void => {
      // `unitIds` is the snapshot of who was HERE when the resolver started; a
      // unit sent home mid-combat (Fight or Flight) still carries its "this
      // combat" buff, so sweep every card holding one rather than the snapshot.
      const combatMightIds =
        (
          cards as unknown as {
            queryCards?: (
              predicate: (id: CoreCardId, meta: Record<string, unknown>) => boolean,
            ) => CoreCardId[];
          }
        ).queryCards?.(
          (_id, meta) => ((meta as Partial<RiftboundCardMeta>).combatMightModifier ?? 0) !== 0,
        ) ?? unitIds;
      for (const id of combatMightIds) {
        const m = cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined;
        const combatMod = m?.combatMightModifier ?? 0;
        if (combatMod !== 0) {
          cards.updateCardMeta(id, {
            combatMightModifier: 0,
            mightModifier: (m?.mightModifier ?? 0) - combatMod,
          } as Partial<RiftboundCardMeta>);
        }
      }
      // rule 466.7 — every "this combat" effect ends with the combat, including
      // keywords granted with `duration:"combat"` (Fortified Position's
      // [Shield 2]). The grant may sit on a unit that was never here (the
      // chooser may pick any unit), so sweep every card that carries one.
      const combatGrantIds =
        (
          cards as unknown as {
            queryCards?: (predicate: (id: CoreCardId, meta: Record<string, unknown>) => boolean) => CoreCardId[];
          }
        ).queryCards?.((_id, meta) =>
          ((meta as Partial<RiftboundCardMeta>).grantedKeywords ?? []).some(
            (gk: { duration?: string }) => gk.duration === "combat",
          ),
        ) ?? unitIds;
      for (const id of combatGrantIds) {
        const m = cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined;
        const granted = m?.grantedKeywords ?? [];
        const remaining = granted.filter((gk: { duration?: string }) => gk.duration !== "combat");
        if (remaining.length !== granted.length) {
          cards.updateCardMeta(id, {
            grantedKeywords: remaining.length > 0 ? remaining : undefined,
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

    // rule 417 / 437.5 / 465.2.c.5 — combat damage is dealt through the damage
    // choke point; each unit's ORDERED replacement chain (Double / Prevent …)
    // is read from it up front so lethal assignment, the kill check and the
    // damage finally dealt agree. rule 372: a unit whose chain is
    // order-sensitive has its controller order it before any assignment.
    const damageIO = { cards, counters, draft, zones };
    const damageOrderQuestions: { unitId: string; chooser: string; items: readonly PendingItem[] }[] = [];

    for (const cardId of unitIds) {
      // rules 181/182 — CombatUnit.owner is the SIDE this body fights for, so
      // a stolen unit is read as the thief's (its real owner still gets the
      // card back when it dies, which is handled off the CombatUnit).
      const owner = sideOf(cardId);
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
      // rule 814.2 / 719.1 (unl-208-219) — Shield (and Assault) from several
      // sources SUM. A printed keyword listed in the flat `keywords[]` array
      // carries no explicit value, so it must still contribute its +1 to the
      // values map; otherwise a granted copy would overwrite the printed one
      // (`getKeywordValue` prefers the map over counting occurrences) and a
      // unit with printed Shield standing where Shield is granted would defend
      // at +1 instead of +2. `abilities[{type:"keyword"}]` is the same printing
      // in another shape — never count a keyword from both.
      for (const keyword of defKeywords) {
        if (!abilityKeywords.includes(keyword)) {
          keywordValues[keyword] = (keywordValues[keyword] ?? 0) + 1;
        }
      }
      // rule 136.2.c / 814.2 (sfd-059-221 Svellsongur) — an attached Equipment
      // whose effect text COPIES the wearer's text appends that text back onto
      // the unit, so every printed keyword applies once more per such copy.
      const printedTextCopies = (meta?.equippedWith ?? []).filter((equipId) => {
        const equipMeta = cards.getCardMeta(equipId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        return (
          registry.get(equipId as string)?.copyAttachedUnitText === true &&
          equipMeta?.copiedFromCardId === cardId
        );
      }).length;
      const printedKeywords = [...defKeywords, ...abilityKeywords];
      if (printedTextCopies > 0) {
        for (const keyword of Object.keys(keywordValues)) {
          keywordValues[keyword] = (keywordValues[keyword] ?? 0) * (1 + printedTextCopies);
        }
      }
      for (const gk of grantedKeywords) {
        keywordValues[gk.keyword] = (keywordValues[gk.keyword] ?? 0) + (gk.value ?? 1);
      }

      const allKeywords = [
        ...printedKeywords,
        ...Array.from({ length: printedTextCopies }, () => printedKeywords).flat(),
        ...grantedKeywords.map((gk) => gk.keyword),
      ];

      // rule 437.5.a–b / 465.2.c.4.a / 465.2.c.5 / 465.2.c.10 — this unit's
      // damage replacement chain and immunity, as the choke point will apply them.
      const damageProfile = damageReplacementProfile(damageIO, cardId as string, { kind: "combat" });
      if (damageProfile.orderMatters && !damageProfile.ordered) {
        damageOrderQuestions.push({ chooser: damageProfile.chooser, items: damageProfile.items, unitId: cardId as string });
      }
      const unit: CombatUnit = {
        baseMight,
        currentDamage,
        id: cardId as string,
        incomingDamageOps: damageProfile.ops,
        keywordValues: Object.keys(keywordValues).length > 0 ? keywordValues : undefined,
        keywords: allKeywords,
        owner,
        ...(killOnDamageIdx(cardId as string) >= 0 ? { diesOnAnyDamage: true } : {}),
        // rule 142.4.c: any damage from the opposing side is lethal to this unit.
        ...([...anyDamageLethalPlayers].some(
          (p) => p !== ((cards.getCardController?.(cardId) ?? owner) as string),
        )
          ? { lethalDamageOverride: 1 }
          : {}),
        // rule 465.2.c.10 (ogn-189-298): "I don't take damage" — skipped for
        // damage assignment and never dealt lethal damage.
        ...(damageProfile.immune ? { immuneToDamage: true } : {}),
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

    // rule 466.1.a.1: the Combat Cleanup's step 3c is "Heal all Units" — it has
    // no location qualifier, so damage on units outside this combat (in a base
    // or at another battlefield) is cleared too. Lethally damaged units are left
    // alone: they are killed by the cleanup before any healing. `alreadySettled`
    // are the combatants whose own damage the damage step just settled (killed
    // ones marked lethal, survivors healed).
    const healAllUnits = (alreadySettled: ReadonlySet<string>): void => {
      const healZoneIds: string[] = [];
      for (const playerId of Object.keys(draft.players ?? {})) {
        for (const id of zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId)) {
          if (!alreadySettled.has(id as string)) {
            healZoneIds.push(id as string);
          }
        }
      }
      for (const bfId of Object.keys(draft.battlefields ?? {})) {
        for (const id of zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)) {
          if (!alreadySettled.has(id as string)) {
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
    };

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
    // rule 466.4 — the result was read on an earlier pass and its "win a
    // combat" triggers have now resolved; resume at 466.5 without re-reading it.
    const winTriggersAlreadyFired = battlefield.combatWinTriggersFired === true;
    battlefield.combatDamageDone = undefined;
    battlefield.combatExcessDamage = undefined;
    battlefield.combatNoDefendersAtCleanup = undefined;
    battlefield.combatCleanupSuspended = undefined;
    battlefield.combatWinTriggersFired = undefined;
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
    // rule 372 / 465.2.c.5 — Double + Prevent N on one unit: its controller
    // orders them (the answer lands in draft.damageReplacementOrder and this
    // move re-runs) before either side assigns damage against that need.
    const orderQuestion = damageOrderQuestions[0];
    if (orderQuestion !== undefined) {
      draft.pendingChoice = {
        items: orderQuestion.items.map((i) => ({ ...i })),
        playerId: orderQuestion.chooser as CorePlayerId,
        prompt: "Order the replacement effects that apply to combat damage dealt to this unit (first = applied first)",
        resume: { kind: "damage-order", targetCardId: orderQuestion.unitId },
        sourceCardId: orderQuestion.unitId as CoreCardId,
        type: "order",
      };
      battlefield.combatExcessDamage = excessDamage > 0 ? excessDamage : undefined;
      battlefield.combatNoDefendersAtCleanup = noDefendersAtCleanup ? true : undefined;
      return;
    }
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

    // rule 465.2.c.1.a / 465.2.d / 417.6.c — all assigned damage is DEALT
    // simultaneously, as one batch through the damage choke point (Double /
    // Prevent chains and their spending, immunity, "when it takes damage"
    // effects, kill attribution 428.5.c.2, one `take-damage` event per unit).
    const defendingSide = defenderUnits[0]?.owner;
    const attackerIds = new Set(attackerUnits.map((u) => u.id));
    const damageRequests: DamageRequest[] = [];
    for (const [unitId, assigned] of Object.entries(result.damageAssignment)) {
      if (assigned <= 0) {
        continue;
      }
      const isAttacker = attackerIds.has(unitId);
      damageRequests.push({
        amount: assigned,
        combat: { battlefieldId, role: isAttacker ? "attacker" : "defender" },
        source: { kind: "combat", ...((isAttacker ? defendingSide : attackingPlayer) ? { player: (isAttacker ? defendingSide : attackingPlayer) as string } : {}) },
        target: unitId,
      });
    }
    // ruling a07c6b97df7477e0 (rules 322 / 323 / 391) — a unit that is dealt
    // LETHAL combat damage while carrying a bound "kill it the next time it
    // takes damage" replacement (ogn-254-298) faces TWO independent deaths in
    // this Cleanup: the lethal-damage death and the delayed kill. A single-use
    // die replacement (Zhonya's Hourglass) can only replace ONE of them, so
    // note them here and re-mark the survivor below.
    const twoDeaths = new Set<string>(
      [...attackerUnits, ...defenderUnits]
        .filter(
          (u) =>
            u.diesOnAnyDamage === true &&
            u.immuneToDamage !== true &&
            (result.damageAssignment[u.id] ?? 0) >=
              combatLethalMight(u, attackerIds.has(u.id) ? "attacker" : "defender") &&
            (result.damageAssignment[u.id] ?? 0) > 0,
        )
        .map((u) => u.id),
    );
    dealDamageBatch(damageIO, damageRequests);

    // rule 466.1 (Combat Cleanup): combat deaths are ordinary deaths — reap
    // lethally-damaged units through the state-based pipeline so board die
    // replacements (Zhonya's Hourglass, rule 372/373), equipment detach and
    // `die` triggers (Deathknell, rule 808) all apply, instead of trashing
    // `result.killed` directly.
    // The resolver's lethal threshold includes combat-only Might (Shield),
    // which the state-based check can't see — so heal the resolver's survivors
    // first (rule 466.1.a.1: combat damage never persists on survivors) and
    // hand exactly `result.killed` to the cleanup with lethal damage marked.
    // rule 143.2.a / 465.2.d — a combatant dies iff the damage now MARKED on
    // it (whatever the choke point actually dealt: doubled, prevented,
    // redirected onto it …) reaches its combat lethal Might (Shield / Assault
    // in role, 142.4.c overrides) — read off the board, not off the plan.
    const stillHere = new Set<string>(zones.getCardsInZone(battlefieldZoneId).map((id) => id as string));
    const killedSet = new Set<string>();
    for (const unit of attackerUnits) {
      const marked = getDamage(context, unit.id);
      if (unit.immuneToDamage !== true && marked > 0 && marked >= combatLethalMight(unit, "attacker")) {
        killedSet.add(unit.id);
      }
    }
    for (const unit of defenderUnits) {
      const marked = getDamage(context, unit.id);
      if (unit.immuneToDamage !== true && marked > 0 && marked >= combatLethalMight(unit, "defender")) {
        killedSet.add(unit.id);
      }
    }
    for (const unit of [...attackerUnits, ...defenderUnits]) {
      // rule 391 (ogn-254-298 / ogn-221-298) — a "when it takes damage, kill
      // it" effect already removed this unit inside the damage batch.
      if (!stillHere.has(unit.id)) {
        // ruling a07c6b97df7477e0 — …unless a die replacement replaced THAT
        // death and left the unit alive elsewhere (recalled, healed): its
        // lethal combat damage is a second, unreplaced death, so mark it again
        // and let the Combat Cleanup reap it.
        if (twoDeaths.has(unit.id)) {
          const zone = zones.getCardZone(unit.id as CoreCardId) as string | undefined;
          if (zone === "base" || (typeof zone === "string" && zone.startsWith("battlefield-"))) {
            setDamage(context, unit.id, Math.max(1, unit.baseMight), {
              lastDamageSource: "combat",
              lastDamagedBy: unit.owner === attackingPlayer ? defenderUnits[0]?.owner : attackingPlayer,
            });
          }
        }
        continue;
      }
      if (killedSet.has(unit.id)) {
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

    healAllUnits(new Set<string>([...attackerUnits, ...defenderUnits].map((u) => u.id)));

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
    } else if (!damageAlreadyDone) {
      // rule 465.1 → 466.1.a.1: one side was gone before the showdown closed, so
      // there is no Combat Damage Step — but the Resolution Step still performs
      // a Combat Cleanup, and its "3c. Heal all Units" clears damage dealt
      // earlier in the combat (an attack/defend trigger's ping) all the same.
      healAllUnits(new Set<string>());
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
    if (winner !== "tie" && !winTriggersAlreadyFired) {
      // rule 466.3.a — it is the PLAYER who wins the combat, so the batch index
      // lets "when YOU win a combat" fire once however many units survived.
      const winningUnits = winner === "attacker" ? attackersLeft : defendersLeft;
      for (const [batchIndex, unitId] of winningUnits.entries()) {
        fireTriggers(
          {
            batchIndex,
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
      // rule 466.4: the chain items the combat RESULT produced resolve before
      // rule 466.5 Establish Control — so a "when I win a combat" point is
      // scored before the Conquer point is even attempted (and the Conquer
      // then meets the Final-Point check, 471.1.b.1, at the higher total).
      // Park the Resolution Step exactly like the 466.2 deferral above; this
      // move re-runs once the chain empties.
      if (draft.interaction?.chain?.active === true) {
        battlefield.combatDamageDone = true;
        battlefield.combatExcessDamage = excessDamage;
        battlefield.combatNoDefendersAtCleanup = noDefendersAtCleanup;
        battlefield.combatWinTriggersFired = true;
        return;
      }
    }

    // Units recalled to base by this resolution (rule 466.1.a.2).
    const recalledUnits: CoreCardId[] = [];

    // Apply outcome based on winner. rule 466.1.a.2 — with Defenders still
    // present the Attackers are recalled; control is then settled by 466.5
    // below for every outcome alike.
    if (winner !== "attacker" && attackersRecalled) {
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
    // rule 466.7.a / 466.7.c: the Attacker/Defender designation and every "this
    // combat" bonus end for every unit that was in this combat — those still
    // here and those recalled to base.
    // rule 807.1.d.1 (ruling 211635a4cca0ac5a): [Assault] / [Shield] Might is
    // real for as long as the designation is, so the cleanup is PARKED while the
    // triggers this combat is about to produce (the conquer below, combat-end,
    // deaths) sit on the chain with both players still holding priority.
    // `flushPendingCombatDesignations` runs it at the first Cleanup with an
    // empty chain — which, when nothing triggers, is the one at the tail of this
    // very move.
    const remainingUnits = zones.getCardsInZone(battlefieldZoneId);
    battlefield.combatDesignationsPending = [
      ...new Set<string>([
        ...(unitIds as readonly string[]),
        ...(remainingUnits as readonly string[]),
        ...(recalledUnits as readonly string[]),
      ]),
    ];

    // rule 466.5 — Establish Control, ONE model (operations/battlefield-control.ts):
    // the sole player with units remaining here establishes control if they did
    // not already control it — the winning Attacker, or a surviving / surprise
    // DEFENDER at an uncontrolled or enemy battlefield (466.5.e: not necessarily
    // the Contested applier; a tie recalls the attackers first, 466.1.a.2, and
    // leaves the defenders alone here). Taking control not already held is a
    // Conquer (466.5.d / 469.1: scored unless already scored here this turn,
    // 471.2.c; the `conquer` event carries the excess damage, 626.1.d.2).
    // Keeping control never lost — the defender came back mid-combat, or simply
    // held — is nothing. Nobody remaining ⇒ Uncontrolled (466.5.b, Vendetta:
    // no Hold on an emptied battlefield). 466.5.a clears Contested either way.
    settleControlByRemainingUnits({ cards, counters, draft, zones }, battlefieldId, "combat", {
      afterAttack: true,
      excessDamage,
      fire: { cards, counters, draft, zones },
      previousController: controllerBeforeCombat,
    });

    // rule 466.7.b: the combat ENDS here, as the last step of the Resolution
    // Step — after damage, kills, recalls and control are settled. Every unit
    // that was in it and is still on the board sees it end; ones that died are
    // in the trash and see nothing (rule 428.1.a).
    // rule 466.7.b / 384.2 (ruling 69880fdccc4bd956) — "was in" is historical:
    // a unit that held a designation here and then LEFT the battlefield (e.g.
    // Flashed to base) is still on the board when the combat ends, so it sees
    // it end too. `wasInCombatAt` is stamped with the designation and survives
    // the relocation that clears `combatRole`.
    const onBoardIds: string[] = Object.keys(draft.battlefields ?? {}).flatMap((bfId) =>
      [...zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)].map((id) => String(id)),
    );
    for (const playerId of Object.keys(draft.players ?? {})) {
      for (const id of zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId)) {
        onBoardIds.push(String(id));
      }
    }
    const departed: string[] = [];
    for (const id of onBoardIds) {
      const meta = cards.getCardMeta?.(id as CoreCardId) as { wasInCombatAt?: string } | undefined;
      if (meta?.wasInCombatAt === battlefieldId) {
        departed.push(id);
      }
    }
    const endRoster = [
      ...new Set<string>([
        ...[...remainingUnits, ...recalledUnits]
          .map((id) => String(id))
          .filter((id) => combatParticipantIds.has(id)),
        ...departed,
      ]),
    ];
    for (const unitId of endRoster) {
      fireTriggers(
        {
          battlefieldId,
          cardId: unitId,
          playerId:
            (cards.getCardController?.(unitId as CoreCardId) as string | undefined) ??
            (cards.getCardOwner(unitId as CoreCardId) as string | undefined),
          type: "combat-end",
        },
        { cards, counters, draft, zones },
      );
    }
    // The combat is over: its historical roster stamp goes with it.
    for (const unitId of [...endRoster, ...combatParticipantIds]) {
      const meta = cards.getCardMeta?.(unitId as CoreCardId) as
        | { wasInCombatAt?: string }
        | undefined;
      if (meta?.wasInCombatAt === battlefieldId) {
        cards.updateCardMeta?.(unitId as CoreCardId, { wasInCombatAt: undefined } as never);
      }
    }

    // rule 319.1 / 472 — the Cleanup that follows combat resolution: statics,
    // state-based checks, and the victory check for a conquer point.
    cleanupAndFireDeaths(draft, context as unknown as PostMoveCleanupContext);

    // rule 460 / 323.13 — this combat has fully ended, so the same Cleanup is
    // the first moment another staged Combat elsewhere may begin.
    openPendingContestedShowdown(
      draft,
      context as unknown as Parameters<typeof openPendingContestedShowdown>[1],
    );
  },
};
