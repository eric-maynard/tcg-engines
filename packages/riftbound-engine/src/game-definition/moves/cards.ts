/**
 * Riftbound Card Play Moves
 *
 * Moves for playing cards: units, gear, spells, and hidden cards.
 * Each move validates game rules before executing.
 */

import type { GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { hideCard, revealHidden } from "./play/hide";
import { playFromChampionZone } from "./play/play-champion";
import { playGear } from "./play/play-gear";
import { playSpell } from "./play/play-spell";
import { playUnit } from "./play/play-unit";

export { getPotentialRuneEnergy } from "./play/cost";
export { spellEffectHasLegalTargets } from "./play/targeting";
export type { SpellEffectTargetShape } from "./play/targeting";

/**
 * Card play move definitions
 */
export const cardPlayMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  playUnit,
  playGear,
  playSpell,
  hideCard,
  revealHidden,
  playFromChampionZone,
};
