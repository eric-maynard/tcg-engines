import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const blastOfPower: SpellCard = {
  cardNumber: 12,
  cardType: "spell",
  domain: "order",
  energyCost: 6,
  id: createCardId("ogs-012-024"),
  name: "Blast of Power",
  rarity: "common",
  rulesText: "[Action] (Play on your turn or in showdowns.)\nKill a unit at a battlefield.",
  setId: "OGS",
  timing: "action",
};
