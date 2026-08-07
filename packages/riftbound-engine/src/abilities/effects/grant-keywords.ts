// Effect handler: "grant-keywords"
import type { CardId as CoreCardId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { GrantedKeyword, RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

/**
 * "Give … my keywords" (sfd-112-221 Kato the Arm). Card definitions encode this
 * as the placeholder keyword `$self-keywords`; it expands, at resolution time,
 * to every keyword the SOURCE currently has — printed (`keyword` abilities or a
 * flat `keywords[]`) plus anything granted to it — so the recipient really gains
 * the keyword (rule 809: a granted Deflect taxes opponents targeting it).
 */
const SELF_KEYWORDS = "$self-keywords";

function expandSelfKeywords(kws: readonly string[], ctx: EffectContext): string[] {
  if (!kws.includes(SELF_KEYWORDS)) {
    return [...kws];
  }
  const source = ctx.sourceCardId;
  const def = getGlobalCardRegistry().get(source);
  const own: string[] = [];
  for (const ability of def?.abilities ?? []) {
    if (ability.type === "keyword" && typeof ability.keyword === "string") {
      own.push(ability.keyword);
    }
  }
  for (const k of def?.keywords ?? []) {
    own.push(String(k));
  }
  const meta = ctx.cards.getCardMeta?.(source as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  for (const granted of meta?.grantedKeywords ?? []) {
    if (typeof granted.keyword === "string" && granted.keyword !== SELF_KEYWORDS) {
      own.push(granted.keyword);
    }
  }
  const out: string[] = [];
  for (const k of kws) {
    for (const candidate of k === SELF_KEYWORDS ? own : [k]) {
      if (!out.includes(candidate)) {
        out.push(candidate);
      }
    }
  }
  return out;
}

export function handle_grantKeywords(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const kws = effect.keywords ? expandSelfKeywords(effect.keywords, ctx) : undefined;
  if (!kws || kws.length === 0) {
    return;
  }
  const targets = getTargetIds(effect, ctx);
  const kwTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  const duration = (effect.duration ?? "turn") as "turn" | "permanent" | "combat";
  for (const targetId of kwTargets) {
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const existing = meta?.grantedKeywords ?? [];
    const entries: GrantedKeyword[] = kws.map((k) => ({ duration, keyword: k }));
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        grantedKeywords: [...existing, ...entries],
      } as unknown as Record<string, unknown>,
    );
  }
}
