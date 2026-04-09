import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dunebreaker: UnitCard = {
  cardNumber: 27,
  cardType: "unit",
  domain: "fury",
  energyCost: 7,
  id: createCardId("sfd-027-221"),
  might: 7,
  name: "Dunebreaker",
  rarity: "epic",
  rulesText: "If you have two or fewer cards in your hand, I enter ready.\nWhen I hold, draw 2.",
  setId: "SFD",
};
