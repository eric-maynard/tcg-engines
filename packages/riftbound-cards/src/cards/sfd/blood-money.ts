import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bloodMoney: SpellCard = {
  cardNumber: 162,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("sfd-162-221"),
  name: "Blood Money",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nKill a unit at a battlefield with 2 [Might] or less. If it was an enemy unit, play a Gold gear token exhausted. If it was a friendly unit, play two Gold gear tokens exhausted.",
  setId: "SFD",
  timing: "action",
};
