import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bellowsBreath: SpellCard = {
  cardNumber: 80,
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  id: createCardId("sfd-080-221"),
  name: "Bellows Breath",
  rarity: "rare",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\n[Repeat] [1][mind] (You may pay the additional cost to repeat this spell's effect.)\nDeal 1 to up to three units at the same location.",
  setId: "SFD",
  timing: "action",
};
