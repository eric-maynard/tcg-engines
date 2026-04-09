import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const vexMocking: UnitCard = {
  cardNumber: 55,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("unl-055-219"),
  isChampion: true,
  might: 5,
  name: "Vex, Mocking",
  rarity: "rare",
  rulesText:
    "[Shield] (+1 [Might] while I'm a defender.)\n[Tank] (I must be assigned combat damage first.)\nWhen you [Stun] an enemy unit at a battlefield, you may move me to that battlefield.",
  setId: "UNL",
  tags: ["Vex"],
};
