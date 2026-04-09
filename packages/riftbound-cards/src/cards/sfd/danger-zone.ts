import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dangerZone: SpellCard = {
  cardNumber: 182,
  cardType: "spell",
  domain: ["fury", "mind"],
  energyCost: 1,
  id: createCardId("sfd-182-221"),
  name: "Danger Zone",
  rarity: "epic",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\n[Repeat] [1][rainbow] (You may pay the additional cost to repeat this spell's effect.)\nGive your Mechs +1 [Might] this turn.",
  setId: "SFD",
  timing: "reaction",
};
