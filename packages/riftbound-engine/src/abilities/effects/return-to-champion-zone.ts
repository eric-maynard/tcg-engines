// Effect handler: "return-to-champion-zone"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { EffectHelpers } from "./_helpers";

/**
 * rule 103.2.a.3 / rule-id: ogn-281-298 (Hallowed Tomb) — "return your Chosen
 * Champion from your trash to your Champion Zone if it is empty."
 *
 * The Chosen Champion is the champion unit whose tag matches the player's
 * Legend `championTag` — never the Legend itself, which never leaves the
 * Legend Zone. rule 419.1.a: a card back in the Champion Zone may be played
 * from there again. "If it is empty" is a hard gate: a champion still sitting
 * unplayed in the zone makes the whole effect a no-op.
 */
/**
 * rule 103.2.a.3 — the name of the player's Chosen Champion. The state keeps no
 * record of the card set aside at deck building, so recover its name from a
 * copy the player still has on the board (the set-aside card itself, once
 * played, or another copy of it). `undefined` = no copy visible, so the caller
 * falls back to the Legend's champion tag.
 */
function chosenChampionName(ctx: EffectContext, championTag: string): string | undefined {
  const registry = getGlobalCardRegistry();
  const playerId = ctx.playerId;
  const named = (raw: CoreCardId): string | undefined => {
    const owner = ctx.cards.getCardOwner(raw);
    if (owner !== playerId) {
      return undefined;
    }
    const def = registry.get(raw as string);
    if (def?.cardType !== "unit" || def.isChampion !== true) {
      return undefined;
    }
    return (def.tags?.includes(championTag) ?? false) ? def.name : undefined;
  };
  for (const raw of ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId)) {
    const name = named(raw);
    if (name !== undefined) {
      return name;
    }
  }
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    for (const raw of ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)) {
      const name = named(raw);
      if (name !== undefined) {
        return name;
      }
    }
  }
  return undefined;
}

export function handle_returnToChampionZone(
  _effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const playerId = ctx.playerId;
  // "if it is empty" — rule 419.1.a: only one champion card lives here.
  const zoneCards = ctx.zones.getCardsInZone("championZone" as CoreZoneId, playerId as CorePlayerId);
  if (zoneCards.length > 0) {
    return;
  }
  const registry = getGlobalCardRegistry();
  const [legendId] = ctx.zones.getCardsInZone("legendZone" as CoreZoneId, playerId as CorePlayerId);
  const championTag = legendId === undefined ? undefined : registry.get(legendId as string)?.championTag;
  if (championTag === undefined) {
    return;
  }
  const chosenName = chosenChampionName(ctx, championTag);
  const trash = ctx.zones.getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId);
  const match = trash.find((raw) => {
    const def = registry.get(raw as string);
    if (def?.cardType !== "unit" || def.isChampion !== true) {
      return false;
    }
    // rule 103.2.a.3: identity is the NAME of the card chosen at deck building
    // — a different Champion that merely shares the Legend's tag (another Ahri)
    // is not "your Chosen Champion". Only when no copy of the chosen card is
    // visible does the tag remain the sole usable identity.
    if (chosenName !== undefined) {
      return def.name === chosenName;
    }
    return def.tags?.includes(championTag) ?? false;
  });
  if (match === undefined) {
    return;
  }
  ctx.zones.moveCard({
    cardId: match as CoreCardId,
    targetZoneId: "championZone" as CoreZoneId,
  });
}
