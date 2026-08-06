// Effect handler: "play"
import type { CardId as CoreCardId } from "@tcg/core";
import { addToChain, createInteractionState } from "../../chain";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_play(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // Rule 354.2: an effect that instructs a player to play a card adds that
  // card to the chain as a pending item; its play process pauses while the
  // enclosing effect finishes (rule 354.3). The pending item keeps the turn
  // in a closed state (rule 309.1) so cleanup step 4 does not strip
  // battlefield control (rule 323.6). When the pending item is later
  // finalized its owner chooses a location (rule 355.2) via the stored
  // move-choose effect and the card enters the board there (rule 337.2).
  const targets = getTargetIds(effect, ctx);
  const turnOrder = Object.keys(ctx.draft.players);
  // rule-id: ogn-102-298 — an explicit "to their base" destination overrides
  // the owner's free location choice.
  const toLocation = (effect as unknown as { toLocation?: unknown }).toLocation;
  const dest = toLocation === "base" ? "base" : "choose";
  for (const targetId of targets) {
    const owner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId;
    ctx.draft.interaction = addToChain(
      ctx.draft.interaction ?? createInteractionState(),
      {
        cardId: targetId,
        controller: owner,
        effect: { target: targetId, to: dest, type: "move" },
        triggered: true,
        type: "ability",
      },
      turnOrder,
    );
  }
}
