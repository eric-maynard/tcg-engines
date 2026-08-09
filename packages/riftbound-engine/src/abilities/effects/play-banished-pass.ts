// Effect handlers: "play-banished-pass" / "play-banished-card"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { addToChain, createInteractionState } from "../../chain";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
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
 * rule-id: ogn-115-298 (rule 337.1.b) — "Starting with the next player, each
 * player plays those cards, ignoring Energy costs." The banish pass is public
 * and finished before any of the picks is played, so the plays are queued as
 * their own chain items (rule 354.2/354.3) in player order beginning with the
 * player after the turn player. The chain resolves newest-first (rule 340.1),
 * so they are pushed in reverse: the next player's card is finalized first.
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
  for (const record of [...queued].reverse()) {
    ctx.draft.interaction = addToChain(
      ctx.draft.interaction ?? createInteractionState(),
      {
        cardId: record.cardId,
        controller: record.playerId,
        effect: {
          ignoreEnergyCost,
          target: record.cardId,
          type: "play-banished-card",
        } as unknown as ExecutableEffect,
        triggered: true,
        type: "ability",
      },
      seats,
    );
  }
}

/**
 * rule-id: ogn-115-298 × ogn-064-298 (rules 337.1.b, 340.1) — "each player
 * plays those cards" is ONE instruction: every play in the pass happens before
 * any of the played cards resolves. The pass is modelled as one queued item per
 * play, so a card put on the chain by an earlier play must be slotted BENEATH
 * the play items still waiting — otherwise it would resolve before the later
 * players have played at all, and a counterspell played last could never see it.
 */
function slotBeneathPendingPlays(
  interaction: NonNullable<EffectContext["draft"]["interaction"]>,
): typeof interaction {
  const chain = interaction.chain;
  if (!chain) {
    return interaction;
  }
  const items = chain.items;
  const newest = items[items.length - 1];
  if (!newest) {
    return interaction;
  }
  const firstPlayIdx = items.findIndex(
    (it) => (it.effect as { type?: string } | undefined)?.type === "play-banished-card",
  );
  if (firstPlayIdx < 0 || firstPlayIdx >= items.length - 1) {
    return interaction;
  }
  const reordered = [...items.slice(0, items.length - 1)];
  reordered.splice(firstPlayIdx, 0, newest);
  return { ...interaction, chain: { ...chain, items: reordered } };
}

/**
 * rule-id: ogn-115-298 (rule 356.1.b) — finalizing one instructed play out of
 * banishment: the Energy cost is ignored, the Power cost is not. rule 358.3.a:
 * if the remaining cost cannot be paid the play is impossible and is skipped —
 * the card simply stays banished.
 */
export function handle_playBanishedCard(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const cardId = (effect as { target?: unknown }).target;
  if (typeof cardId !== "string") {
    return;
  }
  const owner = (ctx.cards.getCardOwner(cardId as CoreCardId) as string | undefined) ?? ctx.playerId;
  if (ctx.zones.getCardZone(cardId as CoreCardId) !== "banishment") {
    return;
  }
  // rule 419.3 / 356.1.b — its OWNER plays it through the ONE play pipeline
  // (Energy ignored, Power still paid; a spell needs a legal target — 355.8;
  // an unpayable / impossible play leaves the card banished — 358.3.a).
  beginPlay(
    ctx as unknown as PlayIO,
    {
      cardId,
      costMode:
        (effect as { ignoreEnergyCost?: boolean }).ignoreEnergyCost === false
          ? { kind: "full" }
          : { kind: "ignore-energy" },
      location: "prompt",
      playerId: owner,
      sourceCardId: ctx.sourceCardId,
      via: "effect",
    },
    { immediate: true },
  );
  // rule 337.1.b / 340.1 — a spell it put on the Chain slots beneath the play
  // items still waiting, so a later player's play (or counterspell) sees it.
  if (ctx.draft.interaction) {
    ctx.draft.interaction = slotBeneathPendingPlays(ctx.draft.interaction);
  }
}
