// Effect handler: "ready"
import type { CardId as CoreCardId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_ready(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  // Only fall back to the source card when the ability has NO target
  // descriptor ("ready me"). A targeted ready that finds no legal targets
  // fizzles — otherwise Bubble Bot's "ready another friendly Mech" readies
  // itself when no other Mech is on the board.
  const hasTargetSpec = "target" in effect && effect.target != null;
  const readied = targets.length === 0 && !hasTargetSpec ? [ctx.sourceCardId] : targets;
  const registry = getGlobalCardRegistry();
  for (const targetId of readied) {
    // rule-id: unl-144-219 — "I can't be readied." also blocks ready effects.
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | {
          grantedKeywords?: { keyword: string }[];
          exhausted?: boolean;
          __flags?: Record<string, boolean>;
        }
      | undefined;
    if (registry.cantReady(targetId, meta?.grantedKeywords)) {
      continue;
    }
    // rule 415.1.b/c: an object that is already ready cannot be readied, so
    // nothing happens and no `ready` event is emitted for it.
    if (meta?.__flags?.exhausted !== true && meta?.exhausted !== true) {
      continue;
    }
    // rule 466 (ogn-070-298) — an enemy permanent's continuous "spells and
    // abilities can't ready enemy units and gear" restriction.
    if (readyBlockedByRestriction(targetId, ctx)) {
      continue;
    }
    ctx.counters.setFlag(targetId as CoreCardId, "exhausted", false);
    // Seeded positions may carry the legacy top-level `exhausted` — clear it
    // too so both representations agree (mirrors the Awaken ready-all).
    if (meta?.exhausted === true) {
      ctx.cards.updateCardMeta?.(targetId as CoreCardId, { exhausted: false } as Record<string, unknown>);
    }
    ctx.fireTriggers?.({
      cardId: targetId,
      playerId: ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId,
      type: "ready",
    });
  }
}

/**
 * rule 466 (ogn-070-298 Mageseeker Warden) — a board permanent may carry a
 * continuous `{type:"static", effect:{type:"restriction", restriction:
 * "cant-ready-enemy"}}`: while its condition holds, no spell or ability may
 * ready a unit or gear controlled by one of ITS opponents. Only effect-driven
 * readying passes through here — the Awaken-step ready is not a spell or
 * ability, so it is unaffected.
 */
function readyBlockedByRestriction(targetId: string, ctx: EffectContext): boolean {
  const registry = getGlobalCardRegistry();
  const targetType = registry.getCardType(targetId);
  if (targetType !== "unit" && targetType !== "gear") {
    return false;
  }
  const controllerOf = (id: string) =>
    ctx.cards.getCardController?.(id as CoreCardId) ?? ctx.cards.getCardOwner(id as CoreCardId);
  const targetController = controllerOf(targetId);
  if (targetController === undefined) {
    return false;
  }

  const zoneIds: string[] = [];
  for (const pid of Object.keys(ctx.draft.players ?? {})) {
    zoneIds.push(`base:${pid}`);
  }
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    zoneIds.push(`battlefield-${bfId}`);
  }

  for (const spec of zoneIds) {
    const [zoneId, pid] = spec.startsWith("base:") ? ["base", spec.slice(5)] : [spec, undefined];
    const cardIds = ctx.zones.getCardsInZone(
      zoneId as Parameters<EffectContext["zones"]["getCardsInZone"]>[0],
      pid as Parameters<EffectContext["zones"]["getCardsInZone"]>[1],
    );
    for (const id of cardIds) {
      const sourceController = controllerOf(id as string);
      if (sourceController === undefined || sourceController === targetController) {
        continue;
      }
      const abilities = (registry.getAbilities(id as string) ?? []) as {
        type?: string;
        condition?: { type?: string };
        effect?: { type?: string; restriction?: string };
      }[];
      for (const ability of abilities) {
        if (
          ability.type !== "static" ||
          ability.effect?.type !== "restriction" ||
          ability.effect.restriction !== "cant-ready-enemy"
        ) {
          continue;
        }
        // The only gate printed on this restriction today is "While I'm at a
        // battlefield"; an unrecognised condition applies unconditionally,
        // matching `static-abilities.ts evaluateCondition`.
        if (ability.condition?.type === "while-at-battlefield") {
          const zone = ctx.zones.getCardZone(id as CoreCardId);
          if (!zone?.startsWith("battlefield-")) {
            continue;
          }
        }
        return true;
      }
    }
  }
  return false;
}
