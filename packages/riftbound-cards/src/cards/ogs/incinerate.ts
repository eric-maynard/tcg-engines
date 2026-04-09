import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const incinerate: SpellCard = {
  cardNumber: 3,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("ogs-003-024"),
  name: "Incinerate",
  rarity: "common",
  rulesText: "[Action] (Play on your turn or in showdowns.)\nDeal 2 to a unit at a battlefield.",
  setId: "OGS",
  timing: "action",
};
