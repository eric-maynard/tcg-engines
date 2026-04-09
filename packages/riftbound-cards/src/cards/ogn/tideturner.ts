import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const tideturner: UnitCard = {
  cardNumber: 199,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogn-199-298"),
  might: 2,
  name: "Tideturner",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nWhen you play me, you may choose a unit you control at another location. Move me to its location and it to my original location.",
  setId: "OGN",
};
