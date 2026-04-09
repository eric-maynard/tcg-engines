import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const fioraWorthy: UnitCard = {
  cardNumber: 180,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("sfd-180-221"),
  isChampion: true,
  might: 3,
  name: "Fiora, Worthy",
  rarity: "epic",
  rulesText:
    "When a unit you control becomes [Mighty], you may pay [order] to ready it. (A unit is Mighty while it has 5+ [Might].)",
  setId: "SFD",
  tags: ["Fiora"],
};
