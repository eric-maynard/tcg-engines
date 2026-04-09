import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const voidHatchling: UnitCard = {
  cardNumber: 18,
  cardType: "unit",
  domain: "fury",
  energyCost: 2,
  id: createCardId("sfd-018-221"),
  might: 2,
  name: "Void Hatchling",
  rarity: "uncommon",
  rulesText:
    "If you would reveal cards from a deck, look at the top card first. You may recycle it. Then reveal those cards.",
  setId: "SFD",
};
