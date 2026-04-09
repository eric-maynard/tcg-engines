import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const spectralMatron: UnitCard = {
  cardNumber: 226,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("ogn-226-298"),
  might: 4,
  name: "Spectral Matron",
  rarity: "uncommon",
  rulesText:
    "When you play me, you may play a unit costing no more than [3] and no more than [rainbow] from your trash, ignoring its cost.",
  setId: "OGN",
};
