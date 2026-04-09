import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const piltoverEnforcer: LegendCard = {
  cardNumber: 187,
  cardType: "legend",
  championTag: "Vi",
  domain: ["fury", "order"],
  id: createCardId("unl-187-219"),
  name: "Piltover Enforcer",
  rarity: "rare",
  rulesText:
    "When you conquer, if you assigned 3 or more excess damage, you may exhaust me to ready a unit.",
  setId: "UNL",
};
