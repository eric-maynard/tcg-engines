import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dravenVanquisher: UnitCard = {
  cardNumber: 20,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("sfd-020-221"),
  isChampion: true,
  might: 4,
  name: "Draven, Vanquisher",
  rarity: "rare",
  rulesText:
    "When I win a combat, play a Gold gear token exhausted.\nWhen I attack or defend, you may pay [fury]. If you do, give me +2 [Might] this turn.",
  setId: "SFD",
  tags: ["Draven"],
};
