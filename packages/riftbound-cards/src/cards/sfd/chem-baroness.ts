import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const chemBaroness: LegendCard = {
  cardNumber: 201,
  cardType: "legend",
  championTag: "Renata Glasc",
  domain: ["mind", "order"],
  id: createCardId("sfd-201-221"),
  name: "Chem-Baroness",
  rarity: "rare",
  rulesText:
    "When you or an ally hold, you may exhaust me to play a Gold gear token exhausted.\nWhile your score is within 3 points of the Victory Score, your Gold [ADD] an additional [1].",
  setId: "SFD",
};
