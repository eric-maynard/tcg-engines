import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const breakneckMech: UnitCard = {
  cardNumber: 71,
  cardType: "unit",
  domain: "mind",
  energyCost: 8,
  id: createCardId("sfd-071-221"),
  might: 7,
  name: "Breakneck Mech",
  rarity: "uncommon",
  rulesText:
    "Your Mechs have [Deflect] and [Ganking]. (Opponents must pay [rainbow] to choose us with a spell or ability. We can move from battlefield to battlefield.)\nI enter ready if you control another Mech.",
  setId: "SFD",
};
