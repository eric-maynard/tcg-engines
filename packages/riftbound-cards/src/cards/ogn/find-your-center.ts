import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const findYourCenter: SpellCard = {
  cardNumber: 47,
  cardType: "spell",
  domain: "calm",
  energyCost: 3,
  id: createCardId("ogn-047-298"),
  name: "Find Your Center",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nIf an opponent's score is within 3 points of the Victory Score, this costs [2] less.\nDraw 1 and channel 1 rune exhausted.",
  setId: "OGN",
  timing: "action",
};
