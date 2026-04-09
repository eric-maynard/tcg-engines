import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const fadingMemories: SpellCard = {
  cardNumber: 180,
  cardType: "spell",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("ogn-180-298"),
  name: "Fading Memories",
  rarity: "uncommon",
  rulesText:
    "Give a unit at a battlefield or a gear [Temporary]. (Kill it at the start of its controller's Beginning Phase, before scoring.)",
  setId: "OGN",
  timing: "action",
};
