import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const frostcoatCub: UnitCard = {
  cardNumber: 67,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-067-221"),
  might: 3,
  name: "Frostcoat Cub",
  rarity: "common",
  rulesText:
    "You may pay [mind] as an additional cost to play me.\nWhen you play me, if you paid the additional cost, give a unit -2 [Might] this turn.",
  setId: "SFD",
};
