import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const leonaDetermined: UnitCard = {
  cardNumber: 238,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("ogn-238-298"),
  isChampion: true,
  might: 4,
  name: "Leona, Determined",
  rarity: "rare",
  rulesText:
    "[Shield] (+1 [Might] while I'm a defender.)\nWhen I attack, stun an enemy unit here. (It doesn't deal combat damage this turn.)",
  setId: "OGN",
  tags: ["Leona"],
};
