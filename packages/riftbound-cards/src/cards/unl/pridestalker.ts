import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const pridestalker: LegendCard = {
  cardNumber: 183,
  cardType: "legend",
  championTag: "Rengar",
  domain: ["fury", "body"],
  id: createCardId("unl-183-219"),
  name: "Pridestalker",
  rarity: "rare",
  rulesText: "When you play a unit, give a unit +1 [Might] this turn.",
  setId: "UNL",
};
