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
  const trash = ctx.zones.getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId);
  const match = trash.find((raw) => {
    const def = registry.get(raw as string);
    return def?.cardType === "unit" && def.isChampion === true && (def.tags?.includes(championTag) ?? false);
  });
  if (match === undefined) {
    return;
  }
  ctx.zones.moveCard({
    cardId: match as CoreCardId,
    targetZoneId: "championZone" as CoreZoneId,
  });
}
