import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const spriteMother: UnitCard = {
  cardNumber: 106,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("ogn-106-298"),
  might: 3,
  name: "Sprite Mother",
  rarity: "uncommon",
  rulesText:
    "When you play me, play a ready 3 [Might] Sprite unit token with [Temporary] here. (Kill it at the start of its controller's Beginning Phase, before scoring.)",
  setId: "OGN",
};
