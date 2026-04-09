import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bondsOfStrength: SpellCard = {
  cardNumber: 151,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("sfd-151-221"),
  name: "Bonds of Strength",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\n[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)\nGive two friendly units each +1 [Might] this turn.",
  setId: "SFD",
  timing: "reaction",
};
