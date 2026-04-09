import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const getExcited: SpellCard = {
  cardNumber: 8,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("ogn-008-298"),
  name: "Get Excited!",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nDiscard 1. Deal its Energy cost as damage to a unit at a battlefield. (Ignore its Power cost.)",
  setId: "OGN",
  timing: "action",
};
