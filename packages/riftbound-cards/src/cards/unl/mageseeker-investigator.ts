import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mageseekerInvestigator: UnitCard = {
  cardNumber: 163,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("unl-163-219"),
  might: 4,
  name: "Mageseeker Investigator",
  rarity: "uncommon",
  rulesText:
    "Opponents must pay [rainbow] for each unit beyond the first to move multiple units to my battlefield at the same time.",
  setId: "UNL",
};
