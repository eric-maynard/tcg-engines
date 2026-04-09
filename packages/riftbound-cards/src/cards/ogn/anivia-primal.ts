import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const aniviaPrimal: UnitCard = {
  cardNumber: 148,
  cardType: "unit",
  domain: "body",
  energyCost: 7,
  id: createCardId("ogn-148-298"),
  isChampion: true,
  might: 8,
  name: "Anivia, Primal",
  rarity: "rare",
  rulesText: "When I attack, deal 3 to all enemy units here.",
  setId: "OGN",
  tags: ["Anivia"],
};
