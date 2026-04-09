import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const noxusHopeful: UnitCard = {
  cardNumber: 12,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("ogn-012-298"),
  might: 4,
  name: "Noxus Hopeful",
  rarity: "common",
  rulesText:
    "[Legion] — I cost [2] less. (Get the effect if you've played another card this turn.)",
  setId: "OGN",
};
