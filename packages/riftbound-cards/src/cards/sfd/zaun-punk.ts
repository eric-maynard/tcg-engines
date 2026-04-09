import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const zaunPunk: UnitCard = {
  cardNumber: 160,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("sfd-160-221"),
  might: 3,
  name: "Zaun Punk",
  rarity: "common",
  rulesText:
    "You may kill a friendly gear as an additional cost to play me.\nWhen you play me, if you paid the additional cost, kill a gear.",
  setId: "SFD",
};
