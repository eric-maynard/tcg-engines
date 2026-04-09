import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rebuke: SpellCard = {
  cardNumber: 172,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogn-172-298"),
  name: "Rebuke",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nReturn a unit at a battlefield to its owner's hand.",
  setId: "OGN",
  timing: "action",
};
