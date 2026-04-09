import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const karthusEternal: UnitCard = {
  cardNumber: 236,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("ogn-236-298"),
  isChampion: true,
  might: 3,
  name: "Karthus, Eternal",
  rarity: "rare",
  rulesText: "Your [Deathknell] effects trigger an additional time.",
  setId: "OGN",
  tags: ["Karthus"],
};
