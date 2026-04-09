import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const disintegrate: SpellCard = {
  cardNumber: 5,
  cardType: "spell",
  domain: "fury",
  energyCost: 4,
  id: createCardId("ogn-005-298"),
  name: "Disintegrate",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nDeal 3 to a unit at a battlefield. If this kills it, do this: draw 1.",
  setId: "OGN",
  timing: "action",
};
