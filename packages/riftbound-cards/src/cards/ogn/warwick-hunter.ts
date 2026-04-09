import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const warwickHunter: UnitCard = {
  cardNumber: 159,
  cardType: "unit",
  domain: "body",
  energyCost: 6,
  id: createCardId("ogn-159-298"),
  isChampion: true,
  might: 5,
  name: "Warwick, Hunter",
  rarity: "rare",
  rulesText: "I enter ready.\nWhen I attack, kill all damaged enemy units here.",
  setId: "OGN",
  tags: ["Warwick"],
};
