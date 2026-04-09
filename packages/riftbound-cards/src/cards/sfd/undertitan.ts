import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const undertitan: UnitCard = {
  cardNumber: 175,
  cardType: "unit",
  domain: "order",
  energyCost: 6,
  id: createCardId("sfd-175-221"),
  might: 5,
  name: "Undertitan",
  rarity: "rare",
  rulesText:
    "When you play me, give your other units +2 [Might] this turn.\nAs I'm revealed from your deck, [Add] [2].",
  setId: "SFD",
};
