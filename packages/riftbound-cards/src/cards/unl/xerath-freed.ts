import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const xerathFreed: UnitCard = {
  cardNumber: 26,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("unl-026-219"),
  isChampion: true,
  might: 5,
  name: "Xerath, Freed",
  rarity: "rare",
  rulesText:
    "[fury], [Exhaust]: Deal 3 to a unit. Use this ability only while I'm at a battlefield.",
  setId: "UNL",
  tags: ["Xerath"],
};
