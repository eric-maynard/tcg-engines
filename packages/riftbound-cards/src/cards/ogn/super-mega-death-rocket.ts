import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const superMegaDeathRocket: SpellCard = {
  cardNumber: 252,
  cardType: "spell",
  domain: ["fury", "chaos"],
  energyCost: 4,
  id: createCardId("ogn-252-298"),
  name: "Super Mega Death Rocket!",
  rarity: "epic",
  rulesText:
    "Deal 5 to a unit.\nWhen you conquer, you may discard 1 to return this from your trash to your hand.",
  setId: "OGN",
  timing: "action",
};
