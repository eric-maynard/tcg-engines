import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const feralStrength: SpellCard = {
  cardNumber: 34,
  cardType: "spell",
  domain: "calm",
  energyCost: 2,
  id: createCardId("sfd-034-221"),
  name: "Feral Strength",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\n[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)\nGive a unit +2 [Might] this turn.",
  setId: "SFD",
  timing: "reaction",
};
