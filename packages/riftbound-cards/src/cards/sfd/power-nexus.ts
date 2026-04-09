import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const powerNexus: BattlefieldCard = {
  cardNumber: 214,
  cardType: "battlefield",
  id: createCardId("sfd-214-221"),
  name: "Power Nexus",
  rarity: "uncommon",
  rulesText:
    "When you hold here, you may pay [rainbow][rainbow][rainbow][rainbow] to score 1 point.",
  setId: "SFD",
};
