import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sunkenTemple: BattlefieldCard = {
  cardNumber: 218,
  cardType: "battlefield",
  id: createCardId("sfd-218-221"),
  name: "Sunken Temple",
  rarity: "uncommon",
  rulesText:
    "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1. (A unit is Mighty while it has 5+ [Might].)",
  setId: "SFD",
};
