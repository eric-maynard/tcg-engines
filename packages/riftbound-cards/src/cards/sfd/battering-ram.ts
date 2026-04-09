import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const batteringRam: UnitCard = {
  cardNumber: 12,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("sfd-012-221"),
  might: 5,
  name: "Battering Ram",
  rarity: "uncommon",
  rulesText: "I cost [1] less for each card you've played this turn, to a minimum of [1].",
  setId: "SFD",
};
