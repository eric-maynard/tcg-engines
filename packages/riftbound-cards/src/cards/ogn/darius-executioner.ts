import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dariusExecutioner: UnitCard = {
  cardNumber: 243,
  cardType: "unit",
  domain: "order",
  energyCost: 6,
  id: createCardId("ogn-243-298"),
  isChampion: true,
  might: 6,
  name: "Darius, Executioner",
  rarity: "epic",
  rulesText:
    "[Legion] — When you play me, ready me. (Get the effect if you've played another card this turn)\nOther friendly units have +1 [Might] here.",
  setId: "OGN",
  tags: ["Darius"],
};
