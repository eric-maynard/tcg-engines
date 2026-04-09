import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const stalkingWolf: UnitCard = {
  cardNumber: 166,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("unl-166-219"),
  might: 6,
  name: "Stalking Wolf",
  rarity: "uncommon",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nAs an additional cost to play me, kill a Bird, Cat, Dog, or Poro you control. You may play me to its battlefield (even if you don't have other units there).",
  setId: "UNL",
};
