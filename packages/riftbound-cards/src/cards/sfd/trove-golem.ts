import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const troveGolem: UnitCard = {
  cardNumber: 174,
  cardType: "unit",
  domain: "order",
  energyCost: 8,
  id: createCardId("sfd-174-221"),
  might: 9,
  name: "Trove Golem",
  rarity: "rare",
  rulesText: "When you play me, play four Gold gear tokens exhausted.",
  setId: "SFD",
};
