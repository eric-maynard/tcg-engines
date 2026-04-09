import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const udyrWildman: UnitCard = {
  cardNumber: 157,
  cardType: "unit",
  domain: "body",
  energyCost: 6,
  id: createCardId("ogn-157-298"),
  isChampion: true,
  might: 6,
  name: "Udyr, Wildman",
  rarity: "rare",
  rulesText:
    "Spend my buff: Choose one you've not chosen this turn —Deal 2 to a unit at a battlefield.Stun a unit at a battlefield.Ready me.Give me [Ganking] this turn.",
  setId: "OGN",
  tags: ["Udyr"],
};
