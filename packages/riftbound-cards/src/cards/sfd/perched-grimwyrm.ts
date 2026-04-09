import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const perchedGrimwyrm: UnitCard = {
  cardNumber: 15,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("sfd-015-221"),
  might: 5,
  name: "Perched Grimwyrm",
  rarity: "uncommon",
  rulesText:
    "Play me only to a battlefield you conquered this turn. (You can't play me anywhere else.)",
  setId: "SFD",
};
