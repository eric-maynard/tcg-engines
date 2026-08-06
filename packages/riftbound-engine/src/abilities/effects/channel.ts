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
  // rule-id: ogn-104-298 (rule 127.1) — "ITS OWNER channels …": the channeling
  // player is the OWNER of the effect's chosen card, which is not the caster
  // once control has changed hands (Possession). Ownership is inherent, so this
  // still reads correctly after the card has left the board.
  if (effect.player === "target-owner") {
    const targetId = ctx.boundTargets?.[0];
    const ownerId = targetId
      ? ctx.cards.getCardOwner(targetId as CoreCardId)
      : undefined;
    if (!ownerId) {
      return;
    }
    if (ownerId !== ctx.playerId) {
      const { player: _p, ...rest } = effect as Record<string, unknown>;
      handle_channel(rest as ExecutableEffect, { ...ctx, playerId: ownerId }, _h);
      return;
    }
  }
  const count = resolveAmount(effect.amount ?? 1, ctx);
  // rule-id: ogn-155-298 — channeled runes live in `runePool` (the zone
  // exhaustRune/recycleRune and the channel move use), and "channel N rune(s)
  // exhausted" must set the exhausted flag on each channeled rune.
  const exhausted = (effect as { exhausted?: boolean }).exhausted === true;
  let channeled = 0;
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
      channeled++;
    }
  }
  // rule 430.3 — channel as many as the Rune Deck allows; record how many
  // actually moved so a sibling "if you couldn't channel N this way" condition
  // (`channeled-fewer-than`) can see the shortfall.
  const record = (ctx.draft as { lastChanneledCount?: Record<string, number> });
  record.lastChanneledCount = { ...(record.lastChanneledCount ?? {}), [ctx.playerId]: channeled };
}
