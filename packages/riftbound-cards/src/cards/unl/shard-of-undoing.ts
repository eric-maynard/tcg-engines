import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const shardOfUndoing: GearCard = {
  cardNumber: 174,
  cardType: "gear",
  domain: "order",
  energyCost: 6,
  id: createCardId("unl-174-219"),
  name: "Shard of Undoing",
  rarity: "rare",
  rulesText:
    "The first time a friendly unit dies during your Beginning Phase each turn, each opponent must kill one of their units.",
  setId: "UNL",
};
