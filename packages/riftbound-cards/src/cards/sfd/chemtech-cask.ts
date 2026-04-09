import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const chemtechCask: GearCard = {
  cardNumber: 63,
  cardType: "gear",
  domain: "mind",
  energyCost: 1,
  id: createCardId("sfd-063-221"),
  name: "Chemtech Cask",
  rarity: "common",
  rulesText:
    "When you play a spell on an opponent's turn, you may exhaust me to play a Gold gear token exhausted.",
  setId: "SFD",
};
