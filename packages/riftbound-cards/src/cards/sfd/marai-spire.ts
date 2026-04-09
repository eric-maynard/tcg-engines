import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const maraiSpire: BattlefieldCard = {
  cardNumber: 211,
  cardType: "battlefield",
  id: createCardId("sfd-211-221"),
  name: "Marai Spire",
  rarity: "uncommon",
  rulesText: "While you control this battlefield, friendly [Repeat] costs cost [1] less.",
  setId: "SFD",
};
