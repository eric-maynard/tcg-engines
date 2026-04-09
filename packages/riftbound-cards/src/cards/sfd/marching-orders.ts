import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const marchingOrders: SpellCard = {
  cardNumber: 114,
  cardType: "spell",
  domain: "body",
  energyCost: 3,
  id: createCardId("sfd-114-221"),
  name: "Marching Orders",
  rarity: "rare",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\n[Repeat] [3] (You may pay the additional cost to repeat this spell's effect.)\nChoose a friendly unit anywhere and an enemy unit at a battlefield. They deal damage equal to their Mights to each other.",
  setId: "SFD",
  timing: "action",
};
