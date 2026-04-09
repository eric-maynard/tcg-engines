import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const uncheckedPower: SpellCard = {
  cardNumber: 123,
  cardType: "spell",
  domain: "mind",
  energyCost: 7,
  id: createCardId("ogn-123-298"),
  name: "Unchecked Power",
  rarity: "epic",
  rulesText: "Exhaust all friendly units, then deal 12 to ALL units at battlefields.",
  setId: "OGN",
  timing: "action",
};
