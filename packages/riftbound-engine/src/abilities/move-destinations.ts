/**
 * rule 355.4 / 355.4.a — the valid Move Destinations of ONE unit for a move
 * effect whose destination its controller chooses ("Move a unit." /
 * "…to a battlefield" / "…to a different battlefield"): every Location other
 * than the unit's current one where it is allowed to be present, narrowed by
 * the effect's own wording. ONE computation shared by the play-time choice
 * (`moves/play/play-time-destinations.ts`) and by the move as it executes
 * (`effects/move.ts` re-checks the carried choice against it — 359.3.e.5).
 * Leaf module: imports the target resolver only.
 */
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "./effect-executor";
import { getEffectiveMight } from "./effects/_helpers";
import type { TargetDescriptor } from "./target-resolver";
import { resolveTarget } from "./target-resolver";

type BattlefieldWhich = string;

interface DestinationShape {
  readonly to?:
    | string
    | { readonly battlefield?: BattlefieldWhich; readonly requireSourceMightExceedsEnemyTotal?: boolean };
  readonly chosenBy?: string;
  readonly swap?: boolean;
  readonly chooseAtResolution?: boolean;
  readonly from?: unknown;
  readonly deferredMoverId?: string;
  readonly extraDestinations?: readonly string[];
}

/**
 * True when the effect's destination is a free choice of its controller among
 * several Locations (rule 355.4) — as opposed to a fixed referent ("to base",
 * "here", "there", "to that unit's battlefield") or a location another player
 * / a later game state determines.
 */
export function hasCasterChosenDestination(effect: unknown): boolean {
  const e = (effect ?? {}) as DestinationShape & { type?: string };
  if (e.type !== "move" || e.chosenBy !== undefined || e.swap === true || e.chooseAtResolution === true) {
    return false;
  }
  if (e.from !== undefined || e.deferredMoverId !== undefined) {
    return false;
  }
  const to = e.to;
  if (to === "choose" || to === "any-battlefield") {
    return true;
  }
  return typeof to === "object" && to !== null && typeof to.battlefield === "string";
}

function resolverCtx(ctx: EffectContext): Parameters<typeof resolveTarget>[1] {
  return {
    cards: ctx.cards,
    draft: ctx.draft,
    playerId: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    sourceZone: ctx.sourceZone,
    zones: ctx.zones,
  } as Parameters<typeof resolveTarget>[1];
}

/**
 * The destination zone ids (`base` / `battlefield-<id>`) legal RIGHT NOW for
 * `moverId` under `effect`, or `undefined` when the effect has no
 * caster-chosen destination or the mover is not on the board (a card an effect
 * is about to PLAY chooses where it enters as it is played — 354.2 — not here).
 */
export function moveDestinationOptions(
  effect: ExecutableEffect | unknown,
  moverId: string,
  ctx: EffectContext,
): string[] | undefined {
  if (!hasCasterChosenDestination(effect)) {
    return undefined;
  }
  const e = effect as DestinationShape;
  const currentZone = ctx.zones.getCardZone(moverId as CoreCardId) as string | undefined;
  const onBoard = currentZone === "base" || (currentZone ?? "").startsWith("battlefield-");
  const battlefields = Object.entries(ctx.draft.battlefields ?? {});
  const to = e.to;

  if (to === "choose") {
    // rule 355.4.a — base or any battlefield other than the unit's current
    // location. (A card entering play from off-board keeps its own, narrower
    // resolution-time prompt: sfd-200-221.)
    if (!onBoard) {
      return undefined;
    }
    return ["base", ...battlefields.map(([bfId]) => `battlefield-${bfId}`)].filter((z) => z !== currentZone);
  }

  if (to === "any-battlefield") {
    // rule-id: unl-105-219 — "to a different battlefield": never the base.
    if (!onBoard) {
      return undefined;
    }
    return battlefields.map(([bfId]) => `battlefield-${bfId}`).filter((z) => z !== currentZone);
  }

  if (typeof to !== "object" || to === null || typeof to.battlefield !== "string") {
    return undefined;
  }
  const which = to.battlefield;
  // rule-id: unl-144-219 (Maduli) — "to an occupied enemy battlefield if my
  // Might is greater than the total Might of enemy units there".
  const mightGate = to.requireSourceMightExceedsEnemyTotal === true;
  const rctx = resolverCtx(ctx);
  const enemyUnits = mightGate
    ? resolveTarget({ controller: "enemy", quantity: "all", type: "unit" } as TargetDescriptor, rctx)
    : [];
  // rule-id: ven-148-166 (rule 355.4) — "to a battlefield WHERE YOU HAVE
  // UNITS" is a presence test, not a control test.
  const friendlyUnits =
    which === "friendly-units"
      ? resolveTarget({ controller: "friendly", quantity: "all", type: "unit" } as TargetDescriptor, rctx)
      : [];
  const moverMight = mightGate ? getEffectiveMight(moverId, ctx) : 0;
  return battlefields
    .filter(([bfId]) => {
      if (!mightGate) {
        return true;
      }
      const zone = `battlefield-${bfId}`;
      const there = enemyUnits.filter((id) => ctx.zones.getCardZone(id as CoreCardId) === zone);
      if (there.length === 0) {
        return false;
      }
      const total = there.reduce((sum, id) => sum + getEffectiveMight(id, ctx), 0);
      return moverMight > total;
    })
    .filter(([bfId, bf]) => {
      switch (which) {
        case "controlled":
          return bf.controller === ctx.playerId;
        case "enemy":
          return bf.controller !== null && bf.controller !== ctx.playerId;
        case "open":
          return bf.controller === null;
        case "contested":
          return bf.contested === true;
        case "friendly-units":
          return friendlyUnits.some((id) => ctx.zones.getCardZone(id as CoreCardId) === `battlefield-${bfId}`);
        default:
          return true;
      }
    })
    .map(([bfId]) => `battlefield-${bfId}`)
    .filter((z) => z !== currentZone);
}
