// Effect handler: "delayed-trigger"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

/**
 * rule-id: unl-095-219 (Grim Resolve) — rule 364.3: "When it wins a combat
 * this turn, gain 2 XP." installs a triggered ability ON the chosen unit for
 * the rest of the turn. The trigger is stored on the unit's meta so
 * `getBoardCards` offers it alongside the printed ones; the Ending Step
 * expires turn-scoped entries (rule 517.2.b).
 */
/**
 * The location "here"/"this battlefield" names as the installing trigger
 * resolves: the source's own board location, else the battlefield the firing
 * event named (rule 359.3.f.3 — e.g. the battlefield a "when I hold" trigger
 * scored at, which stays the referent even after the source is bounced).
 */
function hereAnchor(ctx: EffectContext): string | undefined {
  const zone = ctx.sourceZone;
  if (zone !== undefined && (zone === "base" || zone.startsWith("battlefield-"))) {
    return zone;
  }
  return ctx.triggerBattlefieldZone;
}

/** Replace every `to: "here"` inside a stored delayed effect with `anchor`. */
function freezeHereReferent(node: unknown, anchor: string | undefined): void {
  if (anchor === undefined || node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      freezeHereReferent(child, anchor);
    }
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.to === "here") {
    obj.to = anchor;
  }
  for (const value of Object.values(obj)) {
    freezeHereReferent(value, anchor);
  }
}

export function handle_delayedTrigger(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const dt = effect as unknown as {
    trigger?: { event?: string; on?: string; afterAttack?: boolean };
    effect?: unknown;
    duration?: string;
    optional?: boolean;
  };
  if (!dt.trigger?.event || !dt.effect) {
    return;
  }
  const duration = (dt.duration ?? "turn") as "turn" | "permanent";
  // The effect reaches here as part of a chain item (an immer draft node), so
  // snapshot it into plain data before it is stored on card meta.
  const stored = JSON.parse(JSON.stringify(dt.effect)) as unknown;
  // rule 359.3.f.3.b (rule-id: unl-050-219 Iascylla) — "this battlefield" is a
  // referent fixed when the INSTALLING trigger resolves, so freeze it into the
  // stored effect: by the time the delayed ability executes its source may sit
  // in hand (rule 392) and "here" would no longer resolve to any location.
  freezeHereReferent(stored, hereAnchor(ctx));
  // rule 390.2 (rule-id: sfd-166-221) — "When a friendly unit is played this
  // turn, buff it" hangs on the PLAYER, not on a permanent: no unit is chosen
  // and the window outlives the spell that created it.
  if ((effect as { target?: unknown }).target === "controller") {
    const draft = ctx.draft as unknown as {
      playerDelayedTriggers?: {
        playerId: string;
        sourceCardId: string;
        trigger: { event: string; on?: string };
        effect: unknown;
        duration: "turn" | "permanent";
      }[];
    };
    draft.playerDelayedTriggers ??= [];
    draft.playerDelayedTriggers.push({
      duration,
      effect: stored,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      trigger: { event: dt.trigger.event, on: dt.trigger.on },
    });
    return;
  }
  for (const targetId of getTargetIds(effect, ctx)) {
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const existing = meta?.delayedTriggers ?? [];
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        delayedTriggers: [
          ...existing,
          {
            // rule 392 — the installer controls the delayed ability, so it
            // resolves for them even while it hangs on an enemy permanent.
            controllerId: ctx.playerId,
            duration,
            effect: stored,
            ...(dt.optional === true ? { optional: true } : {}),
            sourceCardId: ctx.sourceCardId,
            trigger: {
              ...(dt.trigger.afterAttack === true ? { afterAttack: true } : {}),
              event: dt.trigger.event,
              on: dt.trigger.on ?? "self",
            },
          },
        ],
      } as unknown as Record<string, unknown>,
    );
  }
}
