import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const malzaharFanatic: UnitCard = {
  cardNumber: 113,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("ogn-113-298"),
  isChampion: true,
  might: 3,
  name: "Malzahar, Fanatic",
  rarity: "rare",
  rulesText:
    "Kill a friendly unit or gear, [Exhaust]: [Action] — [Add] [rainbow][rainbow]. (Use on your turn or in showdowns. Abilities that add resources can't be reacted to.)",
  setId: "OGN",
  tags: ["Malzahar"],
};
