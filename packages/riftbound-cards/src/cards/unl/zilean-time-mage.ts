import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const zileanTimeMage: UnitCard = {
  cardNumber: 86,
  cardType: "unit",
  domain: "mind",
  energyCost: 5,
  id: createCardId("unl-086-219"),
  isChampion: true,
  might: 5,
  name: "Zilean, Time Mage",
  rarity: "rare",
  rulesText:
    "Once each turn, if you would play a token unit while I'm at a battlefield, you may play that token and an additional copy of it instead.",
  setId: "UNL",
  tags: ["Zilean"],
};
