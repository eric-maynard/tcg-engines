import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dragonsRage: SpellCard = {
  cardNumber: 258,
  cardType: "spell",
  domain: ["calm", "body"],
  energyCost: 4,
  id: createCardId("ogn-258-298"),
  name: "Dragon's Rage",
  rarity: "epic",
  rulesText:
    "Move an enemy unit. Then do this: Choose another enemy unit at its destination. They deal damage equal to their Mights to each other.",
  setId: "OGN",
  timing: "action",
};
