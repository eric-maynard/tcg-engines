import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const starSpring: BattlefieldCard = {
  cardNumber: 215,
  cardType: "battlefield",
  id: createCardId("unl-215-219"),
  name: "Star Spring",
  rarity: "uncommon",
  rulesText:
    "The first time a player plays a non-token unit here each turn, they may move another unit they control here to its base.",
  setId: "UNL",
};
