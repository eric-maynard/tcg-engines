import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const againstTheOdds: SpellCard = {
  cardNumber: 1,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("sfd-001-221"),
  name: "Against the Odds",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nGive a friendly unit at a battlefield +2 [Might] this turn for each enemy unit there.",
  setId: "SFD",
  timing: "reaction",
};
