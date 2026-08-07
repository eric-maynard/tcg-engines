import type { RiftboundGameState } from "../../../types/game-state";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";

/**
 * rule 812 / 366.1 (rule-id: unl-025-219 Undying Legion) — a card whose OWN
 * text grants "you may play me from your trash for <cost>" (a keyword ability
 * with `effect:{type:"play", from:"trash", cost}`). Unlike the board-wide
 * ven-022-166 grant this permission lives on the card in the trash itself, and
 * the printed cost is replaced by the permission's cost.
 *
 * [Legion] (812.1.b.1) requires ANOTHER card finalized by this player this
 * turn; the caller must also check the card is actually in that player's trash.
 * Returns `undefined` when the permission is absent or currently off.
 */
export function getSelfTrashPlayCost(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
): { energy?: number; power?: readonly string[] } | undefined {
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    const effect = (
      ability as {
        effect?: { type?: string; from?: string; cost?: { energy?: number; power?: readonly string[] } };
      }
    ).effect;
    if (effect?.type !== "play" || effect.from !== "trash") {
      continue;
    }
    const keyword = (ability as { keyword?: string }).keyword;
    if (keyword === "Legion" && (state.cardsPlayedThisTurn?.[playerId] ?? 0) < 1) {
      continue;
    }
    return effect.cost ?? { energy: 0 };
  }
  return undefined;
}
