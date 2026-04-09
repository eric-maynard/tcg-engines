import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ornnsForge: BattlefieldCard = {
  cardNumber: 213,
  cardType: "battlefield",
  id: createCardId("sfd-213-221"),
  name: "Ornn's Forge",
  rarity: "uncommon",
  rulesText:
    "While you control this battlefield, the first friendly non-token gear played each turn costs [1] less.",
  setId: "SFD",
};
