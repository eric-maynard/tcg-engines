import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const albusFerros: UnitCard = {
  cardNumber: 230,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("ogn-230-298"),
  might: 3,
  name: "Albus Ferros",
  rarity: "rare",
  rulesText:
    "When you play me, spend any number of buffs. For each buff spent, channel 1 rune exhausted.",
  setId: "OGN",
};
