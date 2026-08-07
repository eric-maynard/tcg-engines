import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Mageseeker Investigator — unl-163-219 (Unit)
 *
 * "Opponents must pay [rainbow] for each unit beyond the first to move
 *  multiple units to my battlefield at the same time."
 *
 * Engine primitive: the `moveEscalation: true` marker on this unit instructs
 * the `standardMove` validator and reducer to apply an applied cost (rule
 * 204.4) to an opponent's Standard Move whose DESTINATION is the battlefield
 * this unit is currently at. The cost is [rainbow] per unit beyond the first
 * in that single move (rule 445–447: separate single-unit moves are separate
 * actions and cost nothing), paid from POWER of any domain and never energy
 * (rule 135.2.e.5.a); an unpayable cost makes the move illegal (rule 203).
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
