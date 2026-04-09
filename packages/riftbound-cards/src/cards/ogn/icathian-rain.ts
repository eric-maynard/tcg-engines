import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const icathianRain: SpellCard = {
  cardNumber: 248,
  cardType: "spell",
  domain: ["fury", "mind"],
  energyCost: 7,
  id: createCardId("ogn-248-298"),
  name: "Icathian Rain",
  rarity: "epic",
  rulesText:
    "Deal 2 to a unit.\nDeal 2 to a unit.\nDeal 2 to a unit.\nDeal 2 to a unit.\nDeal 2 to a unit.\nDeal 2 to a unit.",
  setId: "OGN",
  timing: "action",
};
