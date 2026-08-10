// Effect handler: "create-token"
import type { CardId as CoreCardId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { RiftboundGameState } from "../../types";
import {
  consumeEntersReadyReplacement,
  getGrantedAcceleratePlayCost,
} from "../../game-definition/moves/play/cost";
import { offerWeaponmasterEquip } from "../../game-definition/moves/play/weaponmaster";
import { arriveByEffect } from "./move";
import { battlefieldForbidsUnitPlays } from "../play-restrictions";
import { buildConsumedKey, findAllReplacements } from "../replacement-effects";
import { type EffectHelpers, resolveAmount, tokenEntersReadyFromStaticGrant } from "./_helpers";

/**
 * The next token id for this GAME (rule 186.1): the counter lives on the game
 * state, so undo → re-issue of the same move and a seeded replay mint exactly
 * the same token ids. A wall clock or a process-wide sequence would not.
 */
function nextTokenId(draft: RiftboundGameState | undefined, slug: string): string {
  const n = (draft?.tokensCreated ?? 0) + 1;
  if (draft) {
    draft.tokensCreated = n;
  }
  return `token-${slug}-${n}`;
}

/**
 * rule 187.5: named tokens are defined by the rules, not by the card that plays
 * them — a Gold gear token always has "[Reaction] Kill this, [Exhaust]: [Add]
 * [rainbow]", whatever minted it. Keyed by token slug.
 */
const NAMED_TOKEN_ABILITIES: Record<string, readonly unknown[]> = {
  // rule 187.11 (ven-144-166): a Shadow Clone token always has "When I attack,
  // you may banish a unit from your trash. If you do, give me [Assault 4] this
  // turn." — only units in the controller's own trash qualify.
  "shadow-clone": [
    {
      effect: {
        effects: [
          { target: { location: "trash", type: "unit" }, type: "banish" },
          {
            duration: "turn",
            keyword: "Assault",
            target: "self",
            type: "grant-keyword",
            value: 4,
          },
        ],
        type: "sequence",
      },
      // rule 402.1 / 583: "you may" is the chain item's opt-in, asked as the
      // trigger finalizes — declining banishes nothing and grants nothing.
      optional: true,
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    },
  ],
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
 * rule 187: a rules-defined token whose tag is NOT its own name — the tag is
 * fixed by the rules, not by the card that plays it. Keyed by token slug.
 * rule 187.2 Sprite → Fae. (Sand Soldier / Tentacle keep their name as tag:
 * cards printed as "Your Sand Soldiers …" address them by that tag.)
 */
const NAMED_TOKEN_TAGS: Record<string, readonly string[]> = {
  sprite: ["Fae"],
};

/**
 * rule 187.1: a unit token carries its name as a tag (a Recruit token has the
 * Recruit tag), so "non-Recruit unit" filters can exclude it — unless rule 187
 * fixes a different tag for that named token.
 */
function tokenTags(tokenDef: { name: string; tags?: readonly string[] }): string[] {
  if (tokenDef.tags) {
    return [...tokenDef.tags];
  }
  const named = NAMED_TOKEN_TAGS[tokenDef.name.toLowerCase().replace(/\s+/g, "-")];
  return named ? [...named] : [tokenDef.name];
}

/**
 * Rule unl-086-219 (Zilean, Time Mage): "Once each turn, if you would play a
 * token unit while I'm at a battlefield, you may play that token and an
 * additional copy of it instead." Scans the creating player's board for an
 * unconsumed `play-token` replacement whose `while-at-battlefield` condition
 * holds and returns its consumed-key, or undefined when none applies.
 * rule 355.13: "you may" — the key is only marked consumed once the
 * controller accepts, so declining leaves the once-each-turn use available.
 */
function findPlayTokenReplacement(ctx: EffectContext): string | undefined {
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
    return key;
  }
  return undefined;
}

/** Every card on the board (base / legend zone / battlefields) controlled by `playerId`. */
function friendlyBoardIds(ctx: EffectContext, playerId: string): string[] {
  const ids: string[] = [
    ...ctx.zones.getCardsInZone("base" as never, playerId as never),
    ...ctx.zones.getCardsInZone("legendZone" as never, playerId as never),
  ] as string[];
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    for (const id of ctx.zones.getCardsInZone(`battlefield-${bfId}` as never)) {
      if (ctx.cards.getCardOwner(id) === playerId) {
        ids.push(id as string);
      }
    }
  }
  return ids;
}

/**
 * rule 805.1.a / 805.2 (sfd-029-221 Rek'Sai) — a board static granting
 * [Accelerate] to "units played from anywhere other than a player's hand"
 * licenses a unit TOKEN's play too (rule 185.2.a: playing a token IS playing a
 * unit), so its controller may pay the optional additional cost as the token is
 * played. rule 805.1.a.2 / 185.3.b: a domainless token's pip is ANY domain, so
 * the price is [1] plus one Power pip from any Domain in the pool.
 * Returns undefined when unlicensed or unpayable (rule 404.2 — an unaffordable
 * optional cost is never offered).
 */
function tokenAccelerateCost(
  ctx: EffectContext,
  tokenDefinitionId: string,
  controller: string,
  pledged = 0,
): { energy: number } | undefined {
  const board = friendlyBoardIds(ctx, controller).map((cardId) => ({ cardId, controller }));
  const granted = getGrantedAcceleratePlayCost(tokenDefinitionId, controller, board, false);
  if (!granted) {
    return undefined;
  }
  const pool = ctx.draft.runePools[controller];
  const pips = pool
    ? Object.values(pool.power as Partial<Record<string, number>>).reduce<number>(
        (a, b) => a + (b ?? 0),
        0,
      )
    : 0;
  // rule 404.2: "play three tokens" elects each token's Accelerate separately,
  // but all of them are paid together as the effect finishes — an election the
  // pool can no longer cover once the earlier ones are counted is not offered.
  if (!pool || pool.energy < granted.energy * (pledged + 1) || pips < pledged + 1) {
    return undefined;
  }
  return { energy: granted.energy };
}

/** rule 805.6 — pay each elected Accelerate: [1] plus one pip of any Domain. */
function payTokenAccelerate(ctx: EffectContext, controller: string, energy: number): void {
  const pool = ctx.draft.runePools[controller];
  if (!pool) {
    return;
  }
  pool.energy = Math.max(0, pool.energy - energy);
  const power = pool.power as Partial<Record<string, number>>;
  const key = Object.entries(power)
    .filter(([, v]) => (v ?? 0) > 0)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0];
  if (key !== undefined) {
    power[key] = (power[key] ?? 0) - 1;
  }
}

/** Marks a `play-token` replacement used for the turn (rule: once each turn). */
function consumePlayTokenReplacement(ctx: EffectContext, key: string): void {
  if (!ctx.draft.consumedNextReplacements) {
    (ctx.draft as { consumedNextReplacements?: Record<string, true> }).consumedNextReplacements = {};
  }
  (ctx.draft.consumedNextReplacements as Record<string, true>)[key] = true;
}

export function handle_createToken(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  if (!ctx.createCardInZone) {
    return;
  }
  const tokenDef = effect.token;
  if (!tokenDef) {
    return;
  }
  // rule-id: unl-130-219 (rules 182–185, 411.4) — "choose an opponent. THEY
  // play a … token" is a real choice whenever more than one opponent exists;
  // the named seat is threaded back as `ownerId`.
  if (effect.player === "opponent" && (effect as { ownerId?: string }).ownerId === undefined) {
    const opponents = Object.keys(ctx.draft.players).filter((p) => p !== ctx.playerId);
    if (opponents.length > 1 && !ctx.draft.pendingChoice) {
      ctx.draft.pendingChoice = {
        effect,
        options: opponents,
        playerId: ctx.playerId,
        prompt: "Choose an opponent",
        sourceCardId: ctx.sourceCardId,
        type: "choose-player",
      } as typeof ctx.draft.pendingChoice;
      return;
    }
  }
  const tokenReplacement = effect as {
    extraTokenCopies?: number;
    replacementKey?: string;
    skipTokenReplacement?: boolean;
  };
  const count = resolveAmount(effect.amount ?? 1, ctx);
  // Rule unl-086-219: this execution IS the accepted additional copy — the
  // once-each-turn use is spent only now, never by a declined offer.
  if (count > 0 && tokenReplacement.replacementKey) {
    consumePlayTokenReplacement(ctx, tokenReplacement.replacementKey);
  }
  // rule 811.1.d.3: a hidden spell / hidden permanent's play effect that plays
  // a unit must play it at the battlefield the card was facedown at.
  const hiddenUnitZone = tokenDef.type !== "gear" && !effect.location ? ctx.hiddenZone : undefined;
  let targetZone: string;
  if (hiddenUnitZone) {
    targetZone = hiddenUnitZone;
  } else if (effect.location === "origin") {
    // rule 359.3.f.3 (unl-082-219) — "when I move from a location, play … THERE":
    // "there" is the origin, snapshotted when the move happened, so the token
    // lands where the mover left even if it has since moved again or been bounced.
    targetZone = ctx.triggerFrom ?? ctx.sourceZone ?? "base";
  } else if (effect.location === "here" && ctx.sourceZone) {
    targetZone = ctx.sourceZone;
  } else if (effect.location && effect.location !== "here") {
    targetZone = effect.location as string;
  } else {
    targetZone = "base";
  }
  // The Accelerate election below re-enters this handler from a prompt, where
  // the source-zone context ("here") is gone: the location resolved on the
  // first pass rides along so the token still lands where it was headed.
  const carriedZone = (effect as { resolvedTokenZone?: string }).resolvedTokenZone;
  if (carriedZone !== undefined) {
    targetZone = carriedZone;
  }
  // rule 054 / 359.3.e.6 (rule-id: sfd-216-221) — "play a … token HERE" names
  // one location: when that battlefield forbids unit plays the instruction
  // can't be followed, so it is ignored entirely (never redirected to base).
  if (
    tokenDef.type !== "gear" &&
    targetZone.startsWith("battlefield-") &&
    battlefieldForbidsUnitPlays(targetZone.slice("battlefield-".length))
  ) {
    return;
  }

  // rule-id: sfd-081-221 — a token an effect plays "for" another player (the
  // source's controller while an opponent's prompt resolves) names its owner.
  // rule-id: unl-130-219 (rules 182–185, 411.4) — "choose an opponent. THEY
  // play a … token": `player: "opponent"` makes the chosen opponent play it,
  // so the token enters under that opponent's control in their base.
  const opponentOwner =
    effect.player === "opponent"
      ? Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId)
      : undefined;
  const ownerId = ((effect as { ownerId?: string }).ownerId ??
    opponentOwner ??
    ctx.playerId) as typeof ctx.playerId;
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
  // Registered unconditionally (not first-writer-wins): the shared id is
  // process-global, so a stale registration from the sandbox `addToken`
  // catalog or an earlier game would otherwise make the app snapshot report
  // the wrong Might/keywords for a token this effect mints.
  {
    registry.register(tokenDefinitionId, {
      abilities: namedAbilities ? ([...namedAbilities] as never) : undefined,
      cardType: tokenDef.type === "gear" ? "gear" : "unit",
      id: tokenDefinitionId,
      isToken: true,
      keywords: tokenDef.keywords ? [...tokenDef.keywords] : undefined,
      might: tokenDef.might,
      name: tokenDef.name,
      tags: tokenTags(tokenDef),
    });
  }
  // Rule sfd-171-221: a static EntersReady grant on a board card friendly to
  // the token's CONTROLLER (`ownerId`, which is not the effect's controller
  // when an opponent plays the token) overrides rule 143.4 for it.
  // rule 184.1: "Play a ready … unit token" — the effect may state the
  // token's state, overriding the rule 143.4 default.
  const tokenEntersReady =
    effect.ready === true || tokenEntersReadyFromStaticGrant(ctx, tokenDef.type, ownerId);
  // rule 419.3.b / 805.2 — the Accelerate election belongs to THIS token's play
  // steps: it is offered before the token enters, once per token, and the pool
  // is only drained when the controller accepts (rule 805.6 → enters ready).
  const accel = effect as {
    acceleratePaid?: boolean;
    accelerateAsked?: number;
    acceleratePaidCount?: number;
    skipAccelerateOffer?: boolean;
    resolvedTokenZone?: string;
  };
  // rule 185.2.a: "play three … tokens" is three plays, so each token gets its
  // own election — `accelerateAsked` counts the offers already answered and
  // `acceleratePaidCount` how many were accepted (the first N tokens minted).
  const asked = accel.accelerateAsked ?? 0;
  const paidAccelerateCount = accel.acceleratePaidCount ?? (accel.acceleratePaid === true ? 1 : 0);
  if (
    tokenDef.type !== "gear" &&
    asked < count &&
    !tokenEntersReady &&
    accel.skipAccelerateOffer !== true &&
    !ctx.draft.pendingChoice
  ) {
    const price = tokenAccelerateCost(ctx, tokenDefinitionId, ownerId, paidAccelerateCount);
    if (price) {
      const carry = {
        ...effect,
        accelerateAsked: asked + 1,
        resolvedTokenZone: targetZone,
      } as Record<string, unknown>;
      ctx.draft.pendingChoice = {
        declineEffect: { ...carry, acceleratePaidCount: paidAccelerateCount },
        effect: { ...carry, acceleratePaidCount: paidAccelerateCount + 1 },
        playerId: ownerId,
        prompt: `Pay [${price.energy}][any] to Accelerate ${tokenDef.name}?`,
        sourceCardId: ctx.sourceCardId,
        type: "confirm",
        ...(ctx.boundTargets && ctx.boundTargets.length > 0
          ? { boundTargets: [...ctx.boundTargets] }
          : {}),
      } as typeof ctx.draft.pendingChoice;
      return;
    }
  }
  for (let paid = 0; paid < paidAccelerateCount; paid++) {
    payTokenAccelerate(ctx, ownerId, 1);
  }
  // rule 805.6: a paid Accelerate overrides the rule 143.4 exhausted default —
  // for exactly the tokens whose election was accepted.
  const entersReadyAt = (index: number) => tokenEntersReady || index < paidAccelerateCount;
  // Rule unl-081-219 (Keeper of Masks): "They become copies of me." A token
  // spec carrying the `CopyOnPlay` marker registers each instance with the
  // source card's definition (name, Might, keywords, abilities) instead of
  // the literal token stats, so engine reads treat it as a copy.
  // rule-id: unl-200-219 (rule 477.1.b.1) — Mirror Image style "Choose a unit
  // … it becomes a copy of that unit": the caster-chosen unit (bound to the
  // effect's own `target` descriptor) is the copy source. With no such
  // descriptor the marker means "copies of me" (Keeper of Masks).
  // rule 359.3.e.5 / 359.3.e.12 (unl-200-219) — when the effect names its own
  // copy source and that unit is gone on resolution, only the "becomes a copy"
  // instruction is skipped: the token is still played, as its bare printed
  // self. Never fall back to the source card there (that would copy the spell).
  const declaresCopySource = (effect as { target?: unknown }).target !== undefined;
  const copyTargetId = declaresCopySource ? ctx.boundTargets?.[0] : undefined;
  const copySourceId = declaresCopySource ? copyTargetId : ctx.sourceCardId;
  const copySource =
    tokenDef.keywords?.includes("CopyOnPlay") && copySourceId
      ? registry.get(copySourceId)
      : undefined;
  // rule 477.2.a: keywords the effect grants the token separately are NOT part
  // of the copied traits — they survive on top of the copy (e.g. [Temporary]).
  const grantedTokenKeywords = (tokenDef.keywords ?? []).filter((k) => k !== "CopyOnPlay");
  const createdIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const tokenId = nextTokenId(ctx.draft, tokenSlug);
    ctx.createCardInZone(tokenId, targetZone, ownerId);
    createdIds.push(tokenId);
    // Rule 143.4 / 185.2.d: token units enter play exhausted; gear tokens
    // enter ready unless the effect says otherwise (sfd-004-221).
    if ((tokenDef.type !== "gear" || effect.ready === false) && !entersReadyAt(i)) {
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
        isToken: true,
        // rule 477.2.a / 477.1.b.1.a — the effect's own keywords are GRANTED
        // (layer 2, recorded below as `grantedKeywords`), never baked into the
        // copied sheet: an object that later copies this token takes only the
        // copyable traits, so a granted [Temporary] is not conferred on it.
        keywords: [...new Set(copySource.keywords ?? [])],
        powerCost: copySource.powerCost ? [...copySource.powerCost] : undefined,
        tags: copySource.tags ? [...copySource.tags] : undefined,
      });
      // rule 477.1.b.1: the token instance keeps the shared `token-def-<slug>`
      // definitionId, which still carries the literal (0-Might "Reflection")
      // stats — record which card it copies so readers that resolve a card
      // through its definition (app snapshot name/art) show the copy.
      if (copySourceId) {
        ctx.cards.updateCardMeta?.(tokenId as CoreCardId, {
          copyOfCardId: copySourceId,
        } as unknown as Record<string, unknown>);
        // rule 477.1.b.1.b — the token's copyable traits are the ones it copies
        // (so something copying IT is priced as the copied card, not as a bare
        // costless token, 185.3.a.1).
        registry.noteCopySource?.(tokenId, copySourceId);
      }
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
        isToken: true,
        keywords: tokenDef.keywords ? [...tokenDef.keywords] : undefined,
        might: tokenDef.might,
        name: tokenDef.name,
        tags: tokenTags(tokenDef),
      });
    }
    // rule 350.2 / 185.2.a (unl-052-219) — playing a unit token IS "you play a
    // unit", so a one-shot "the next unit you play enters ready and [Buff] it"
    // replacement is consumed by the token exactly like a play from hand.
    if (tokenDef.type !== "gear") {
      const replacedReady = consumeEntersReadyReplacement(ctx.draft, ownerId, {
        cardId: tokenId,
        ctx,
      });
      if (replacedReady) {
        ctx.counters.setFlag(tokenId as CoreCardId, "exhausted", false);
      }
    }
    // Rule unl-058-219: creating a unit token is "playing a token unit" —
    // fire after registry registration so trigger effects can resolve it.
    if (tokenDef.type !== "gear") {
      ctx.fireTriggers?.({ cardId: tokenId, playerId: ownerId, type: "play-token-unit" });
      // rule 185.2.a / 821 (sfd-197-221): playing a unit token IS playing a
      // unit, so a token with [Weaponmaster] — printed or granted by a static,
      // which the `play-token-unit` recalc above has already applied — gets the
      // same "you may Equip for [rainbow] less" offer as a play from hand.
      offerWeaponmasterEquip(
        ctx.draft as never,
        ctx.zones as never,
        ownerId,
        tokenId,
        ctx.cards as never,
      );
    } else {
      // rule 187 / 383.4 (ogn-091-298 Pit Crew) — a gear token is a gear and
      // playing one is "playing a gear"; the trigger doesn't say "non-token".
      ctx.fireTriggers?.({ cardId: tokenId, playerId: ownerId, type: "play-token-gear" });
    }
  }
  // rule 190.3.a.1 — unit tokens played to a battlefield their controller does
  // not control ("play a Recruit here" while attacking) contest it / join the
  // combat there like any other arrival.
  if (tokenDef.type !== "gear") {
    arriveByEffect(ctx, createdIds, targetZone, "play");
  }
  // rule-id: ogs-015-024 (rule 439.2.b.1) — with no zone specified, a unit
  // token may enter at base or any battlefield its controller controls. The
  // tokens are minted in base; when a controlled battlefield exists the
  // controller is prompted per token via a `created` choose-destination.
  // rule 355.13 / unl-086-219 (Zilean): "you may play that token and an
  // additional copy of it instead" — the extra copy is OPTIONAL, so its
  // controller is asked instead of it being applied silently. Accepting
  // re-enters this handler for the one extra token (and only then spends the
  // once-each-turn use); declining leaves the use available.
  // rule 373 — the offer belongs to the play-token EVENT, so it must still be
  // made when the tokens additionally park a choose-destination prompt: it then
  // rides behind those prompts as the destination choice's `thenChoice`.
  const buildTokenReplacementOffer = (): typeof ctx.draft.pendingChoice | undefined => {
    if (
      tokenReplacement.skipTokenReplacement ||
      tokenDef.type === "gear" ||
      count <= 0 ||
      createdIds.length === 0
    ) {
      return undefined;
    }
    const key = findPlayTokenReplacement(ctx);
    if (key === undefined) {
      return undefined;
    }
    return {
      effect: {
        ...effect,
        amount: 1,
        replacementKey: key,
        skipTokenReplacement: true,
        then: undefined,
      },
      playerId: ctx.playerId,
      prompt: "Play an additional copy of the token?",
      sourceCardId: ctx.sourceCardId,
      type: "confirm",
      // rule 375 — the replacing event inherits the generating effect's
      // modifications and its linked follow-ups: "It becomes a copy of that
      // unit" names the SAME chosen unit for the additional token, so the
      // copy-source binding must ride along into the re-entry.
      ...(ctx.boundTargets && ctx.boundTargets.length > 0
        ? { boundTargets: [...ctx.boundTargets] }
        : {}),
    } as typeof ctx.draft.pendingChoice;
  };
  if (!effect.location && !hiddenUnitZone && tokenDef.type !== "gear" && !ctx.draft.pendingChoice) {
    // rule 185.2.a → 349: a token is played by the player PLAYING it, so that
    // player picks the destination among their own base / battlefields they
    // control — with "choose an opponent, they play a token" that is `ownerId`,
    // not the controller of the creating effect.
    // rule 186 / 355.2 (rule-id: sfd-216-221 Rockfall Path) — a token unit IS
    // played, so a battlefield forbidding unit plays is not a legal destination.
    const controlled = Object.entries(ctx.draft.battlefields ?? {})
      .filter(([bfId, bf]) => bf.controller === ownerId && !battlefieldForbidsUnitPlays(bfId))
      .map(([bfId]) => `battlefield-${bfId}`);
    const [first, ...rest] = createdIds;
    if (controlled.length > 0 && first !== undefined) {
      const offer = buildTokenReplacementOffer();
      ctx.draft.pendingChoice = {
        cardId: first,
        created: true,
        options: ["base", ...controlled],
        playerId: ownerId,
        queue: rest,
        type: "choose-destination",
        ...(offer ? { thenChoice: offer } : {}),
      } as typeof ctx.draft.pendingChoice;
    }
  }
  // rule 354.2 (sfd-154-221) — the tokens this step minted are the sequence's
  // pending value ("Play a … token. You may pay [order] to ready IT"), so a
  // later `pending-value` step binds them instead of scanning the board.
  const sink = (ctx as { playedSink?: { ids: string[] } }).playedSink;
  if (sink && createdIds.length > 0) {
    sink.ids.push(...createdIds);
  }
  // rule-id: sfd-081-221 — a follow-up instruction printed on the same
  // sentence ("… and each opponent may …") rides along as `then`, and waits
  // when this effect itself parked a prompt.
  const then = (effect as { then?: ExecutableEffect }).then;
  if (then && !ctx.draft.pendingChoice) {
    // rule-id: sfd-154-221 — a rider that acts on the token ("… to ready it")
    // names the ids this effect just minted, so bind them for the rider.
    h.executeEffect(then, createdIds.length > 0 ? { ...ctx, boundTargets: createdIds } : ctx);
  }
  if (!ctx.draft.pendingChoice) {
    const offer = buildTokenReplacementOffer();
    if (offer) {
      ctx.draft.pendingChoice = offer;
    }
  }
}
