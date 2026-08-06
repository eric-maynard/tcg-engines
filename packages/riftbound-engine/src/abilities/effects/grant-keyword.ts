// Effect handler: "grant-keyword"
import type { CardId as CoreCardId } from "@tcg/core";
import type { GrantedKeyword, RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_grantKeyword(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const kw = effect.keyword;
  if (!kw) {
    return;
  }
  // rule-id: ogn-026-298 — "opponents can't play cards this turn" is a
  // player-level restriction, not card meta; record it on game state so the
  // play moves can consult it.
  const target = effect.target as { type?: string; which?: string } | undefined;
  if (kw === "CannotPlayCards" && target?.type === "player") {
    const which = target.which ?? "opponent";
    const all = Object.keys(ctx.draft.players);
    const players =
      which === "self" || which === "controller"
        ? [ctx.playerId]
        : which === "all" || which === "each"
          ? all
          : all.filter((p) => p !== ctx.playerId);
    const draft = ctx.draft as { cannotPlayCardsThisTurn?: Record<string, true> };
    draft.cannotPlayCardsThisTurn ??= {};
    for (const p of players) {
      draft.cannotPlayCardsThisTurn[p] = true;
    }
    return;
  }
  const targets = getTargetIds(effect, ctx);
  const kwTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  // rule 816.1.b: Temporary only acts at the controller's next Beginning Phase, so
  // an unqualified "give it [Temporary]" must outlive the turn it was granted.
  const duration = (effect.duration ?? (kw === "Temporary" ? "permanent" : "turn")) as
    | "turn"
    | "permanent"
    | "combat";
  for (const targetId of kwTargets) {
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const existing = meta?.grantedKeywords ?? [];
    const entry: GrantedKeyword = { duration, keyword: kw, value: effect.value };
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        grantedKeywords: [...existing, entry],
      } as unknown as Record<string, unknown>,
    );
  }
}
