import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const teemoScout: UnitCard = {
  cardNumber: 197,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogn-197-298"),
  isChampion: true,
  might: 1,
  name: "Teemo, Scout",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nWhen you play me, give me +3 [Might] this turn.",
  setId: "OGN",
  tags: ["Teemo"],
};
