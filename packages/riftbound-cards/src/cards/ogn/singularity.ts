import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const singularity: SpellCard = {
  cardNumber: 105,
  cardType: "spell",
  domain: "mind",
  energyCost: 6,
  id: createCardId("ogn-105-298"),
  name: "Singularity",
  rarity: "uncommon",
  rulesText: "Deal 6 to each of up to two units.",
  setId: "OGN",
  timing: "action",
};
