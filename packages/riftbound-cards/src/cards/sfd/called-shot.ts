import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const calledShot: SpellCard = {
  cardNumber: 122,
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  id: createCardId("sfd-122-221"),
  name: "Called Shot",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\n[Repeat] [chaos] (You may pay the additional cost to repeat this spell's effect.)\nLook at the top 2 cards of your Main Deck. Draw one and recycle the other.",
  setId: "SFD",
  timing: "action",
};
