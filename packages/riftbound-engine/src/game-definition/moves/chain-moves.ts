/**
 * Chain & Showdown Moves
 *
 * Moves for interacting with the chain (spell stack) and showdown (combat window).
 * Includes activated ability support and spell effect execution on resolution.
 */

import type { GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { activateAbility } from "./chain/activate-ability";
import { counterSpell } from "./chain/counter";
import { invitePlayer } from "./chain/invite-player";
import { passChainPriority, resolveChain } from "./chain/resolve";
import { endShowdown, passShowdownFocus, startShowdown } from "./chain/showdown";

export { buildEffectContext } from "./chain/effect-context";
export { executeResolvedItem, settleResolvedSpellCard } from "./chain/resolve";

export const chainMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  passChainPriority,
  resolveChain,
  activateAbility,
  passShowdownFocus,
  startShowdown,
  endShowdown,
  invitePlayer,
  counterSpell,
};
