// Effect handler: "play-banished-pass"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { EffectHelpers } from "./_helpers";
import { beginPlay, type PlayIO } from "../../game-definition/moves/play/play-pipeline";

/** Cards a `look` with `onPicked: "banish"` put into banishment, per source card. */
export interface LookBanishRecord {
  readonly cardId: string;
  readonly playerId: string;
  readonly sourceCardId?: string;
}

type DraftWithLookBanish = {
  lookBanishedCards?: LookBanishRecord[];
};

/**
 * rule-id: ogn-115-298 (rules 354.2 / 354.3 / 337.1) — "Starting with the next
 * player, each player plays those cards, ignoring Energy costs." The banish
 * pass is public and finished before any of the picks is played. Each play the
 * instruction makes is a PLAY (419.3): its card becomes a Pending Item on the
 * Chain now — in the order the effect names, beginning with the player after
 * the turn player — and, once the resolving spell has finished (354.3; its own
 * "when you play a spell" triggers are appended after them, 383.2.c), the
 * finalization pass has each performer finish their play oldest-first
 * (337.1.b: location, targets, remaining Power cost — 356.1.b) with nobody
 * receiving Priority in between (337.1.a / 337.4). A permanent enters at once
 * (337.2); a spell keeps its slot as a Finalized item and resolves LIFO (340.1).
 * A card its owner cannot play right now simply stays banished (419.2.a):
 * RULING-CONFLICT — riftjudge 95688f6f6f4b0da4 says an unaffordable pick is
 * recycled, but rulings 23c9277d071cd1f7 and 012ae43c41524a98 (and 358.2 /
 * 358.5) both keep it in banishment, so the engine follows the majority.
 */
export function handle_playBanishedPass(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const draft = ctx.draft as unknown as DraftWithLookBanish;
  const all = draft.lookBanishedCards ?? [];
  const source = ctx.sourceCardId;
  const mine = all.filter((r) => r.sourceCardId === undefined || r.sourceCardId === source);
  if (mine.length === 0) {
    return;
  }
  draft.lookBanishedCards = all.filter((r) => !mine.includes(r));

  const seats = Object.keys(ctx.draft.players);
  const turnPlayer = ctx.draft.turn?.activePlayer ?? ctx.playerId;
  const start = Math.max(0, seats.indexOf(turnPlayer as string));
  // "Starting with the NEXT player": rotate so the seat after the turn player leads.
  const order = seats.map((_, i) => seats[(start + 1 + i) % seats.length] as string);

  const queued = order
    .flatMap((seat) => mine.filter((r) => r.playerId === seat))
    .concat(mine.filter((r) => !order.includes(r.playerId)));

  const ignoreEnergyCost = (effect as { ignoreEnergyCost?: boolean }).ignoreEnergyCost !== false;
  for (const record of queued) {
    if (ctx.zones.getCardZone(record.cardId as never) !== "banishment") {
      continue;
    }
    // rule 419.3 / 356.1.b — its OWNER plays it through the ONE play pipeline
    // (Energy ignored, Power still paid; a spell needs a legal target — 355.8).
    beginPlay(ctx as unknown as PlayIO, {
      cardId: record.cardId,
      costMode: ignoreEnergyCost ? { kind: "ignore-energy" } : { kind: "full" },
      location: "prompt",
      playerId: record.playerId,
      sourceCardId: ctx.sourceCardId,
      via: "effect",
    });
  }
}
