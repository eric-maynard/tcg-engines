import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const pickpocket: UnitCard = {
  cardNumber: 74,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-074-221"),
  might: 3,
  name: "Pickpocket",
  rarity: "uncommon",
  rulesText:
    "When you play me, you may kill a gear with Energy cost no more than [1]. If you do, play a Gold gear token exhausted.",
  setId: "SFD",
};
