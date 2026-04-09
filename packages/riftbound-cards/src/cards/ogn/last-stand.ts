import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const lastStand: SpellCard = {
  cardNumber: 69,
  cardType: "spell",
  domain: "calm",
  energyCost: 3,
  id: createCardId("ogn-069-298"),
  name: "Last Stand",
  rarity: "rare",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nDouble a friendly unit's Might this turn. Give it [Temporary]. (Kill it at the start of its controller's Beginning Phase, before scoring.)",
  setId: "OGN",
  timing: "action",
};
