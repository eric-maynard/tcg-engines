import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const daughterOfTheVoid: LegendCard = {
  cardNumber: 247,
  cardType: "legend",
  championTag: "Kai'Sa",
  domain: ["fury", "mind"],
  id: createCardId("ogn-247-298"),
  name: "Daughter of the Void",
  rarity: "rare",
  rulesText:
    "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells. (Abilities that add resources can't be reacted to.)",
  setId: "OGN",
};
