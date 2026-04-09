import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const faePorter: UnitCard = {
  cardNumber: 125,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("sfd-125-221"),
  might: 4,
  name: "Fae Porter",
  rarity: "common",
  rulesText:
    "When I move to a battlefield, you may pay [chaos] to move a unit you control to the same battlefield.",
  setId: "SFD",
};
