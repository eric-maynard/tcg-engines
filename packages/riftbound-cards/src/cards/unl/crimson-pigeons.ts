import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const crimsonPigeons: UnitCard = {
  cardNumber: 154,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("unl-154-219"),
  might: 3,
  name: "Crimson Pigeons",
  rarity: "common",
  rulesText: "I have +2 [Might] while I'm attacking with another unit.",
  setId: "UNL",
};
