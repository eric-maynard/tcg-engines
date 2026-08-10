// Effect handler: "grant-keywords"
import type { CardId as CoreCardId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { GrantedKeyword, RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, unitIsOnBoard } from "./_helpers";

/**
 * "Give … my keywords" (sfd-112-221 Kato the Arm). Card definitions encode this
 * as the placeholder keyword `$self-keywords`; it expands, at resolution time,
 * to every keyword the SOURCE currently has — printed (`keyword` abilities or a
 * flat `keywords[]`) plus anything granted to it — so the recipient really gains
 * the keyword (rule 809: a granted Deflect taxes opponents targeting it).
 */
const SELF_KEYWORDS = "$self-keywords";

/** A keyword to grant, with its numeric value when the keyword carries one. */
interface KeywordGrant {
  readonly keyword: string;
  readonly value?: number;
}

// rule 807.1.b.3 — "If X is omitted, it is presumed to be 1": a valued keyword
// (Assault 3, Deflect 1) must carry its VALUE onto the recipient, or copying it
// silently downgrades it to the 1-value form.
function expandSelfKeywords(kws: readonly string[], ctx: EffectContext): KeywordGrant[] {
  if (!kws.includes(SELF_KEYWORDS)) {
    return kws.map((k) => ({ keyword: k }));
  }
  const source = ctx.sourceCardId;
  // rule 359.3.e.12 — information about a permanent that has changed to a
  // non-board zone is null: the ability still resolves (355.9.c) but "my
  // keywords" copies nothing. The card now in hand/trash is a new object (124).
  if (!unitIsOnBoard(source, ctx)) {
    return kws.filter((k) => k !== SELF_KEYWORDS).map((k) => ({ keyword: k }));
  }
  const def = getGlobalCardRegistry().get(source);
  const own: KeywordGrant[] = [];
  for (const ability of def?.abilities ?? []) {
    if (ability.type === "keyword" && typeof ability.keyword === "string") {
      const value = (ability as { value?: unknown }).value;
      own.push(typeof value === "number" ? { keyword: ability.keyword, value } : { keyword: ability.keyword });
    }
  }
  for (const k of def?.keywords ?? []) {
    own.push({ keyword: String(k) });
  }
  const meta = ctx.cards.getCardMeta?.(source as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  for (const granted of meta?.grantedKeywords ?? []) {
    // rule 718.3 / 719.1 — a keyword conferred by an attached Equipment (or any other
    // continuous effect) is stored with `duration: "static"`: it exists only while that
    // effect applies to THIS card. "Give … my keywords" copies the keywords the source
    // itself has, not another object's continuous grant, so static entries are skipped.
    if (granted.duration === "static") {
      continue;
    }
    if (typeof granted.keyword === "string" && granted.keyword !== SELF_KEYWORDS) {
      const value = (granted as { value?: unknown }).value;
      own.push(typeof value === "number" ? { keyword: granted.keyword, value } : { keyword: granted.keyword });
    }
  }
  const out: KeywordGrant[] = [];
  for (const k of kws) {
    for (const candidate of k === SELF_KEYWORDS ? own : [{ keyword: k }]) {
      const seen = out.findIndex((o) => o.keyword === candidate.keyword);
      if (seen < 0) {
        out.push(candidate);
      } else if (out[seen]?.value === undefined && candidate.value !== undefined) {
        out[seen] = candidate;
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
    const entries: GrantedKeyword[] = kws.map((k) =>
      k.value === undefined
        ? ({ duration, keyword: k.keyword } as GrantedKeyword)
        : ({ duration, keyword: k.keyword, value: k.value } as GrantedKeyword),
    );
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        grantedKeywords: [...existing, ...entries],
      } as unknown as Record<string, unknown>,
    );
  }
}
