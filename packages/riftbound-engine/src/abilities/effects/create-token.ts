// Effect handler: "create-token"
import type { CardId as CoreCardId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { buildConsumedKey, findAllReplacements } from "../replacement-effects";
import { type EffectHelpers, resolveAmount, tokenEntersReadyFromStaticGrant } from "./_helpers";

let tokenSeq = 0;

/**
 * rule 187.5: named tokens are defined by the rules, not by the card that plays
 * them — a Gold gear token always has "[Reaction] Kill this, [Exhaust]: [Add]
 * [rainbow]", whatever minted it. Keyed by token slug.
 */
const NAMED_TOKEN_ABILITIES: Record<string, readonly unknown[]> = {
  gold: [
    {
      cost: { exhaust: true, kill: "self" },
      effect: { power: ["rainbow"], type: "add-resource" },
      timing: "reaction",
      type: "activated",
    },
  ],
};

/**
 * rule 187.1: a unit token carries its name as a tag (a Recruit token has the
 * Recruit tag), so "non-Recruit unit" filters can exclude it.
 */
function tokenTags(tokenDef: { name: string; tags?: readonly string[] }): string[] {
  return tokenDef.tags ? [...tokenDef.tags] : [tokenDef.name];
}

/**
 * Rule unl-086-219 (Zilean, Time Mage): "Once each turn, if you would play a
 * token unit while I'm at a battlefield, you may play that token and an
 * additional copy of it instead." Scans the creating player's board for an
 * unconsumed `play-token` replacement whose `while-at-battlefield` condition
 * holds, marks it consumed for the turn, and returns the number of extra
 * copies to create (0 or 1).
 */
function applyPlayTokenReplacement(ctx: EffectContext): number {
  const matches = findAllReplacements(
    { owner: ctx.playerId, playerId: ctx.playerId, type: "play-token" },
    {
      cards: {
        getCardMeta: (ctx.cards.getCardMeta ?? (() => undefined)) as never,
        getCardOwner: ctx.cards.getCardOwner,
      },
      draft: ctx.draft,
      zones: { getCardsInZone: ctx.zones.getCardsInZone },
    },
  );
  const consumed = ctx.draft.consumedNextReplacements ?? {};
  for (const m of matches) {
    // "if *you* would play" — only the token's controller benefits.
    if (m.sourceOwner !== ctx.playerId) {
      continue;
    }
    const key = buildConsumedKey(m.sourceCardId, m.abilityIndex);
    // "Once each turn" — consumedNextReplacements is cleared at end of turn.
    if (consumed[key]) {
      continue;
    }
    const condType = (m.condition as { type?: string } | undefined)?.type;
    if (condType === "while-at-battlefield") {
      const zone = ctx.zones.getCardZone(m.sourceCardId as CoreCardId);
      if (!zone?.startsWith("battlefield-")) {
        continue;
      }
    }
    if (!ctx.draft.consumedNextReplacements) {
      (ctx.draft as { consumedNextReplacements?: Record<string, true> }).consumedNextReplacements =
        {};
    }
    (ctx.draft.consumedNextReplacements as Record<string, true>)[key] = true;
    return 1;
  }
  return 0;
}

export function handle_createToken(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  if (!ctx.createCardInZone) {
    return;
  }
  const tokenDef = effect.token;
  if (!tokenDef) {
    return;
  }
  let count = resolveAmount(effect.amount ?? 1, ctx);
  // Rule unl-086-219: a play-token replacement adds one additional copy.
  if (count > 0 && tokenDef.type !== "gear") {
    count += applyPlayTokenReplacement(ctx);
  }
  // rule 811.1.d.3: a hidden spell / hidden permanent's play effect that plays
  // a unit must play it at the battlefield the card was facedown at.
  const hiddenUnitZone = tokenDef.type !== "gear" && !effect.location ? ctx.hiddenZone : undefined;
  let targetZone: string;
  if (hiddenUnitZone) {
    targetZone = hiddenUnitZone;
  } else if (effect.location === "here" && ctx.sourceZone) {
    targetZone = ctx.sourceZone;
  } else if (effect.location && effect.location !== "here") {
    targetZone = effect.location as string;
  } else {
    targetZone = "base";
  }

  // rule-id: sfd-081-221 — a token an effect plays "for" another player (the
  // source's controller while an opponent's prompt resolves) names its owner.
  const ownerId = ((effect as { ownerId?: string }).ownerId ?? ctx.playerId) as typeof ctx.playerId;
  const registry = getGlobalCardRegistry();
  // Rule unl-160-219: chain-moves stamps ability-minted tokens with
  // definitionId `token-def-<slug>`; the snapshot builder resolves that
  // id, so mirror the manual addToken path and register the shared
  // definition once under the same key (instance ids are still
  // registered below for by-instance registry lookups).
  const tokenSlug = tokenDef.name.toLowerCase().replace(/\s+/g, "-");
  const tokenDefinitionId = `token-def-${tokenSlug}`;
  // rule 187.5: a rules-defined token (Gold, …) carries its printed abilities.
  const namedAbilities = NAMED_TOKEN_ABILITIES[tokenSlug];
  if (!registry.get(tokenDefinitionId)) {
    registry.register(tokenDefinitionId, {
      abilities: namedAbilities ? ([...namedAbilities] as never) : undefined,
      cardType: tokenDef.type === "gear" ? "gear" : "unit",
      id: tokenDefinitionId,
      keywords: tokenDef.keywords ? [...tokenDef.keywords] : undefined,
      might: tokenDef.might,
      name: tokenDef.name,
      tags: tokenTags(tokenDef),
    });
  }
  // Rule sfd-171-221: a static EntersReady grant on a friendly board card
  // overrides rule 143.4 for every token this effect creates.
  // rule 184.1: "Play a ready … unit token" — the effect may state the
  // token's state, overriding the rule 143.4 default.
  const tokenEntersReady =
    effect.ready === true || tokenEntersReadyFromStaticGrant(ctx, tokenDef.type);
  // Rule unl-081-219 (Keeper of Masks): "They become copies of me." A token
  // spec carrying the `CopyOnPlay` marker registers each instance with the
  // source card's definition (name, Might, keywords, abilities) instead of
  // the literal token stats, so engine reads treat it as a copy.
  // rule-id: unl-200-219 (rule 477.1.b.1) — Mirror Image style "Choose a unit
  // … it becomes a copy of that unit": the caster-chosen unit (bound to the
  // effect's own `target` descriptor) is the copy source. With no such
  // descriptor the marker means "copies of me" (Keeper of Masks).
  const copyTargetId =
    (effect as { target?: unknown }).target !== undefined ? ctx.boundTargets?.[0] : undefined;
  const copySourceId = copyTargetId ?? ctx.sourceCardId;
  const copySource =
    tokenDef.keywords?.includes("CopyOnPlay") && copySourceId
      ? registry.get(copySourceId)
      : undefined;
  // rule 477.2.a: keywords the effect grants the token separately are NOT part
  // of the copied traits — they survive on top of the copy (e.g. [Temporary]).
  const grantedTokenKeywords = (tokenDef.keywords ?? []).filter((k) => k !== "CopyOnPlay");
  const createdIds: string[] = [];
  for (let i = 0; i < count; i++) {
    // A process-wide sequence keeps ids unique when two create-token effects
    // resolve within the same millisecond (e.g. a [Repeat]ed spell).
    const tokenId = `token-${tokenSlug}-${Date.now()}-${tokenSeq++}`;
    ctx.createCardInZone(tokenId, targetZone, ownerId);
    createdIds.push(tokenId);
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
    if (copySource) {
      registry.register(tokenId, {
        ...copySource,
        abilities: copySource.abilities ? [...copySource.abilities] : undefined,
        id: tokenId,
        keywords: [...new Set([...(copySource.keywords ?? []), ...grantedTokenKeywords])],
        powerCost: copySource.powerCost ? [...copySource.powerCost] : undefined,
        tags: copySource.tags ? [...copySource.tags] : undefined,
      });
      // rule 477.2 / 477.2.a: the effect's own keywords are GRANTED on top of
      // the copied traits (ability layer), so they survive a later copy of the
      // token. Record them as grants as well as on the copy's keyword line.
      if (grantedTokenKeywords.length > 0) {
        const meta = ctx.cards.getCardMeta?.(tokenId as CoreCardId) as
          | { grantedKeywords?: { duration: string; keyword: string }[] }
          | undefined;
        const existing = meta?.grantedKeywords ?? [];
        ctx.cards.updateCardMeta?.(
          tokenId as CoreCardId,
          {
            grantedKeywords: [
              ...existing,
              ...grantedTokenKeywords.map((keyword) => ({ duration: "permanent", keyword })),
            ],
          } as unknown as Record<string, unknown>,
        );
      }
    } else {
      registry.register(tokenId, {
        abilities: namedAbilities ? ([...namedAbilities] as never) : undefined,
        cardType: tokenDef.type === "gear" ? "gear" : "unit",
        id: tokenId,
        keywords: tokenDef.keywords ? [...tokenDef.keywords] : undefined,
        might: tokenDef.might,
        name: tokenDef.name,
        tags: tokenTags(tokenDef),
      });
    }
    // Rule unl-058-219: creating a unit token is "playing a token unit" —
    // fire after registry registration so trigger effects can resolve it.
    if (tokenDef.type !== "gear") {
      ctx.fireTriggers?.({ cardId: tokenId, playerId: ownerId, type: "play-token-unit" });
    }
  }
  // rule-id: ogs-015-024 (rule 439.2.b.1) — with no zone specified, a unit
  // token may enter at base or any battlefield its controller controls. The
  // tokens are minted in base; when a controlled battlefield exists the
  // controller is prompted per token via a `created` choose-destination.
  if (!effect.location && !hiddenUnitZone && tokenDef.type !== "gear" && !ctx.draft.pendingChoice) {
    const controlled = Object.entries(ctx.draft.battlefields ?? {})
      .filter(([, bf]) => bf.controller === ctx.playerId)
      .map(([bfId]) => `battlefield-${bfId}`);
    const [first, ...rest] = createdIds;
    if (controlled.length > 0 && first !== undefined) {
      ctx.draft.pendingChoice = {
        cardId: first,
        created: true,
        options: ["base", ...controlled],
        playerId: ctx.playerId,
        queue: rest,
        type: "choose-destination",
      };
    }
  }
  // rule-id: sfd-081-221 — a follow-up instruction printed on the same
  // sentence ("… and each opponent may …") rides along as `then`, and waits
  // when this effect itself parked a prompt.
  const then = (effect as { then?: ExecutableEffect }).then;
  if (then && !ctx.draft.pendingChoice) {
    h.executeEffect(then, ctx);
  }
}
