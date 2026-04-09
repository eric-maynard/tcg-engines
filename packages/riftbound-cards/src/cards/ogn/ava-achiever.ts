import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const avaAchiever: UnitCard = {
  cardNumber: 107,
  cardType: "unit",
  domain: "mind",
  energyCost: 5,
  id: createCardId("ogn-107-298"),
  might: 4,
  name: "Ava Achiever",
  rarity: "rare",
  rulesText:
    "When I attack, you may pay [mind] to play a card with [Hidden] from your hand, ignoring its cost. If it’s a unit, play it here.",
  setId: "OGN",
};
