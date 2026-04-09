import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gentleGemdragon: UnitCard = {
  cardNumber: 104,
  cardType: "unit",
  domain: "body",
  energyCost: 8,
  id: createCardId("unl-104-219"),
  might: 8,
  name: "Gentle Gemdragon",
  rarity: "uncommon",
  rulesText: "When you play me or another Dragon, ready up to 2 runes.",
  setId: "UNL",
};
