import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bladeDancer: LegendCard = {
  cardNumber: 195,
  cardType: "legend",
  championTag: "Irelia",
  domain: ["calm", "chaos"],
  id: createCardId("sfd-195-221"),
  name: "Blade Dancer",
  rarity: "rare",
  rulesText:
    "When you choose a friendly unit, you may exhaust me and pay [rainbow] to ready it.\nWhen you conquer, you may pay [1] to ready me.",
  setId: "SFD",
};
