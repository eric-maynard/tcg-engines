import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const seaMonkey: UnitCard = {
  cardNumber: 98,
  cardType: "unit",
  domain: "body",
  energyCost: 2,
  id: createCardId("sfd-098-221"),
  might: 2,
  name: "Sea Monkey",
  rarity: "common",
  rulesText:
    "You may pay [1] as an additional cost to play me.\nWhen you play me, if you paid the additional cost, buff me. (Give me a +1 [Might] buff if I don't already have one.)",
  setId: "SFD",
};
