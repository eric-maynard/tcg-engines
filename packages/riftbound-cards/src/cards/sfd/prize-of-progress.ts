import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const prizeOfProgress: UnitCard = {
  cardNumber: 75,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("sfd-075-221"),
  might: 3,
  name: "Prize of Progress",
  rarity: "uncommon",
  rulesText: "When you use an activated ability of a gear, give me +1 [Might] this turn.",
  setId: "SFD",
};
