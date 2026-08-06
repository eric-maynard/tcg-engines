// Effect handler: "create-token"
import type { CardId as CoreCardId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount, tokenEntersReadyFromStaticGrant } from "./_helpers";

export function handle_createToken(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  if (!ctx.createCardInZone) {
    return;
  }
  const tokenDef = effect.token;
  if (!tokenDef) {
    return;
  }
  const count = resolveAmount(effect.amount ?? 1, ctx);
  let targetZone: string;
  if (effect.location === "here" && ctx.sourceZone) {
    targetZone = ctx.sourceZone;
  } else if (effect.location && effect.location !== "here") {
    targetZone = effect.location as string;
  } else {
    targetZone = "base";
  }

  const registry = getGlobalCardRegistry();
  // Rule unl-160-219: chain-moves stamps ability-minted tokens with
  // definitionId `token-def-<slug>`; the snapshot builder resolves that
  // id, so mirror the manual addToken path and register the shared
  // definition once under the same key (instance ids are still
  // registered below for by-instance registry lookups).
  const tokenSlug = tokenDef.name.toLowerCase().replace(/\s+/g, "-");
  const tokenDefinitionId = `token-def-${tokenSlug}`;
  if (!registry.get(tokenDefinitionId)) {
    registry.register(tokenDefinitionId, {
      cardType: tokenDef.type === "gear" ? "gear" : "unit",
      id: tokenDefinitionId,
      keywords: tokenDef.keywords ? [...tokenDef.keywords] : undefined,
      might: tokenDef.might,
      name: tokenDef.name,
    });
  }
  // Rule sfd-171-221: a static EntersReady grant on a friendly board card
  // overrides rule 143.4 for every token this effect creates.
  const tokenEntersReady = tokenEntersReadyFromStaticGrant(ctx, tokenDef.type);
  for (let i = 0; i < count; i++) {
    const tokenId = `token-${tokenSlug}-${Date.now()}-${i}`;
    ctx.createCardInZone(tokenId, targetZone, ctx.playerId);
    // Rule 143.4 / 185.2.d: token units enter play exhausted; gear tokens
    // enter ready unless the effect says otherwise (sfd-004-221).
    if ((tokenDef.type !== "gear" || effect.ready === false) && !tokenEntersReady) {
      ctx.counters.setFlag(tokenId as CoreCardId, "exhausted", true);
    }
    // `effect` (and thus `tokenDef`) reaches here via the chain-state
    // Draft when resolving from passChainPriority, so any nested array
    // Is an immer proxy that will be revoked after this reducer's
    // Produce() returns. Copy arrays before storing them in the
    // Long-lived registry so later hasKeyword() reads don't throw.
    registry.register(tokenId, {
      cardType: tokenDef.type === "gear" ? "gear" : "unit",
      id: tokenId,
      keywords: tokenDef.keywords ? [...tokenDef.keywords] : undefined,
      might: tokenDef.might,
      name: tokenDef.name,
    });
  }
}
