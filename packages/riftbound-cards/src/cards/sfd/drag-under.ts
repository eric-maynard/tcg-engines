import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dragUnder: SpellCard = {
  cardNumber: 164,
  cardType: "spell",
  domain: "order",
  energyCost: 5,
  id: createCardId("sfd-164-221"),
  name: "Drag Under",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nI cost [2] less to play from anywhere other than your hand.\nKill a unit at a battlefield.",
  setId: "SFD",
  timing: "action",
};
