// Effect handler: "empower", "disempower"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { recalculateStaticEffects, type StaticAbilityContext } from "../static-abilities";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_empower(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  const empowerTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  let changed = false;
  for (const targetId of empowerTargets) {
    // rule 124.1 / 441.2 — Empowered is a board state on a permanent. A unit
    // that left the board before this resolved is a new object in its new
    // zone, so the status must not be written onto the card there.
    // rule 355.9.a.4 — legends are permanents too and can be Empowered
    // ("empower a legend, unit, or gear"); they sit in a Legend Zone.
    const zone = ctx.zones.getCardZone?.(targetId as CoreCardId) as string | undefined;
    if (
      zone !== undefined &&
      zone !== "base" &&
      zone !== "legendZone" &&
      !zone.startsWith("battlefield-")
    ) {
      continue;
    }
    const priorMeta = ctx.cards.getCardMeta(targetId as CoreCardId) as
      | { empowered?: boolean; empowerCount?: number }
      | undefined;
    const wasEmpowered = priorMeta?.empowered ?? false;
    // rule 441.1.c.1 (rule-id: ven-134-166) — cards that may be Empowered more
    // than once scale off HOW MANY times ("+2 [Might] for each time I'm
    // [Empowered]"), so the status carries a count alongside the flag.
    const priorCount = priorMeta?.empowerCount ?? (wasEmpowered ? 1 : 0);
    // rule 392 / 383.3 (rule-id: ven-035-166, ven-099-166) — "Disempower it at
    // end of turn" (and its mirror "Empower it at end of turn") is a DELAYED
    // TRIGGERED ability, not a silent duration: at rule 317.1 it goes on the
    // chain under the controller of the effect that installed it, ordered
    // against every other end-of-turn trigger (rule 383.3.d) and respondable,
    // rather than lapsing unseen in the Expiration Step.
    const turnDuration = (effect as { duration?: string }).duration === "turn";
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        empowered: effect.type === "empower",
        empowerCount: effect.type === "empower" ? priorCount + 1 : 0,
      } as unknown as Record<string, unknown>,
    );
    if (turnDuration) {
      const existing =
        (priorMeta as { delayedTriggers?: readonly unknown[] } | undefined)?.delayedTriggers ?? [];
      ctx.cards.updateCardMeta?.(
        targetId as CoreCardId,
        {
          delayedTriggers: [
            ...existing,
            {
              // rule 392 — the installer controls the delayed ability even when
              // it hangs on an opponent's permanent.
              controllerId: ctx.playerId,
              duration: "turn",
              effect: {
                // "it" is this permanent, frozen at install time.
                target: { filter: { idIn: [targetId] }, type: "permanent" },
                type: effect.type === "empower" ? "disempower" : "empower",
              },
              sourceCardId: ctx.sourceCardId,
              // "at end of turn" = the Ending Step of the turn in progress,
              // whoever's turn that is.
              trigger: { event: "end-of-turn", on: "any-player" },
            },
          ],
        } as unknown as Record<string, unknown>,
      );
    }
    // A repeat Empower (441.1.c.1) leaves the flag alone but raises the count,
    // and per-empower statics have to be recomputed for it too.
    if (wasEmpowered !== (effect.type === "empower") || effect.type === "empower") {
      changed = true;
    }
    // rule 441.1.c.1 (rule-id: ven-153-166) — the empower ACTION happens every
    // time it is performed, even on a card that is already Empowered (Kayle's
    // 2nd/3rd self-Empower), so "when you empower something else" gets its
    // event each time. `becameEmpowered` carries the false→true edge that
    // "When I become [Empowered]" (rule 827.1.c) keys on instead.
    if (effect.type === "empower") {
      ctx.fireTriggers?.({
        becameEmpowered: !wasEmpowered,
        cardId: targetId,
        owner: ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId,
        // rule 441.3.a — the player the effect DIRECTS to empower is the one who
        // "empowers"; the empowered card's owner is irrelevant to that.
        actor: ctx.playerId,
        type: "empower",
      });
    }
  }
  // rule 828.1.c — [Empowered] passives are dependent on the status, so they
  // must come and go with it immediately: a later step of the SAME effect
  // ("…then kill it if it has 3 Might or less") has to see the new Might.
  if (changed) {
    recalculateStaticEffects({
      cards: ctx.cards,
      draft: ctx.draft,
      zones: ctx.zones,
    } as unknown as StaticAbilityContext);
  }
}
