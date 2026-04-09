import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const cardSharp: UnitCard = {
  cardNumber: 81,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-081-221"),
  might: 3,
  name: "Card Sharp",
  rarity: "rare",
  rulesText:
    "When you play me, you and each opponent may play a Gold gear token exhausted. For each opponent who did, you play a Gold gear token exhausted.",
  setId: "SFD",
};
