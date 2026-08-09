/**
 * Riftbound Card Play Moves
 *
 * Moves for playing cards: units, gear, spells, and hidden cards.
 * Each move validates game rules before executing.
 */

import type { GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { withPostMoveCleanup } from "../../cleanup/post-move-cleanup";
import { hideCard, revealHidden } from "./play/hide";
import { playFromChampionZone } from "./play/play-champion";
import { playFromZone } from "./play/play-from-zone";
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
  // rule 319.6 / 319.8 — a Cleanup happens once objects enter the board and
  // once a play completes. Revealing a facedown gear puts it straight at the
  // battlefield without a chain resolution, so nothing else would run state
  // maintenance and the loose gear would linger there (rule 518 recall).
  ...withPostMoveCleanup({ revealHidden }),
  playFromChampionZone,
  // rule 366.1 / 419.1.a — plays a permission makes legal from another zone.
  playFromZone,
};
