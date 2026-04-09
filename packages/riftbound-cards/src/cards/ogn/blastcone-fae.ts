import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const blastconeFae: UnitCard = {
  cardNumber: 97,
  cardType: "unit",
  domain: "mind",
  energyCost: 2,
  id: createCardId("ogn-097-298"),
  might: 2,
  name: "Blastcone Fae",
  rarity: "uncommon",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nWhen you play me, give a unit -2 [Might] this turn, to a minimum of 1 [Might].",
  setId: "OGN",
};
