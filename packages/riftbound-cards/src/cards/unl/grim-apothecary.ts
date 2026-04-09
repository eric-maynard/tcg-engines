import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const grimApothecary: UnitCard = {
  cardNumber: 21,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("unl-021-219"),
  might: 3,
  name: "Grim Apothecary",
  rarity: "rare",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nWhen you play me, you may return a friendly unit at a battlefield to its owner's hand.",
  setId: "UNL",
};
