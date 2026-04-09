import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const viPeacekeeper: UnitCard = {
  cardNumber: 176,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("unl-176-219"),
  isChampion: true,
  might: 5,
  name: "Vi, Peacekeeper",
  rarity: "rare",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nWhen I attack, [Stun] an enemy unit here. (It doesn't deal combat damage this turn.)",
  setId: "UNL",
  tags: ["Vi"],
};
