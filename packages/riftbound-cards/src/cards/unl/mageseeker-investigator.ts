import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Mageseeker Investigator — unl-163-219 (Unit)
 *
 * "Opponents must pay [rainbow] for each unit beyond the first to move
 *  multiple units to my battlefield at the same time."
 *
 * Engine primitive: the `moveEscalation: true` marker on this unit instructs
 * the `standardMove` validator and reducer to apply a per-turn surcharge to
 * the active player's moves while Mageseeker Investigator is enemy-controlled
 * on the board. The surcharge is 1 rainbow energy per unit moved beyond the
 * first in a given turn, tracked via `state.unitsMovedThisTurn[playerId]`,
 * which resets at the start of each turn.
 *
 * The engine does not need an ability object for this effect; the rule is
 * applied directly from the `moveEscalation` flag on the card definition.
 * An empty abilities array is intentional — it opts the card out of the
 * parser so the hand-authored marker is the sole source of truth.
 */
export const mageseekerInvestigator: UnitCard = {
  abilities: [],
  cardNumber: 163,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("unl-163-219"),
  might: 4,
  moveEscalation: true,
  name: "Mageseeker Investigator",
  rarity: "uncommon",
  rulesText:
    "Opponents must pay [rainbow] for each unit beyond the first to move multiple units to my battlefield at the same time.",
  setId: "UNL",
};
