// Effect handler: "channel"
import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

export function handle_channel(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule-id: ogn-071-298 — "you and that player each channel 1 rune":
  // `player: "each"` fans out to every player's rune deck.
  if (effect.player === "each" || effect.player === "opponent") {
    const pids = Object.keys(ctx.draft.players).filter(
      (p) => effect.player === "each" || p !== ctx.playerId,
    );
    for (const pid of pids) {
      handle_channel({ ...effect, player: "self" }, { ...ctx, playerId: pid }, _h);
    }
    return;
  }
  const count = resolveAmount(effect.amount ?? 1, ctx);
  // rule-id: ogn-155-298 — channeled runes live in `runePool` (the zone
  // exhaustRune/recycleRune and the channel move use), and "channel N rune(s)
  // exhausted" must set the exhausted flag on each channeled rune.
  const exhausted = (effect as { exhausted?: boolean }).exhausted === true;
  for (let i = 0; i < count; i++) {
    const runes = ctx.zones.getCardsInZone(
      "runeDeck" as CoreZoneId,
      ctx.playerId as CorePlayerId,
    );
    const runeId = runes[0];
    if (runeId) {
      ctx.zones.moveCard({
        cardId: runeId,
        targetZoneId: "runePool" as CoreZoneId,
      });
      if (exhausted) {
        ctx.counters.setFlag(runeId as unknown as CoreCardId, "exhausted", true);
      }
    }
  }
}
