import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const noxusSaboteur: UnitCard = {
  cardNumber: 18,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("ogn-018-298"),
  might: 3,
  name: "Noxus Saboteur",
  rarity: "uncommon",
  rulesText: "Your opponents' [Hidden] cards can't be revealed here.",
  setId: "OGN",
};
