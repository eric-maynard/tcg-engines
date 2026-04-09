import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const forbiddingWaste: BattlefieldCard = {
  cardNumber: 210,
  cardType: "battlefield",
  id: createCardId("unl-210-219"),
  name: "Forbidding Waste",
  rarity: "uncommon",
  rulesText:
    "While a unit here is defending alone, it has -2 [Might]. (It's alone if there are no other friendly units here.)",
  setId: "UNL",
};
