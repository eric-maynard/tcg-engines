import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sunDisc: GearCard = {
  cardNumber: 21,
  cardType: "gear",
  domain: "fury",
  energyCost: 2,
  id: createCardId("ogn-021-298"),
  name: "Sun Disc",
  rarity: "uncommon",
  rulesText:
    "[Exhaust]: [Legion] — The next unit you play this turn enters ready. (Get the effect if you've played another card this turn.)",
  setId: "OGN",
};
