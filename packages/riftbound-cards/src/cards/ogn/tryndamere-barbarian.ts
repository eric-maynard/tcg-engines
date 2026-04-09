import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const tryndamereBarbarian: UnitCard = {
  cardNumber: 34,
  cardType: "unit",
  domain: "fury",
  energyCost: 7,
  id: createCardId("ogn-034-298"),
  isChampion: true,
  might: 8,
  name: "Tryndamere, Barbarian",
  rarity: "rare",
  rulesText:
    "When I conquer after an attack, if you assigned 5 or more excess damage to enemy units, you score 1 point.",
  setId: "OGN",
  tags: ["Tryndamere"],
};
