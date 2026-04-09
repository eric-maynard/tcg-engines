import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const repulse: SpellCard = {
  cardNumber: 106,
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  id: createCardId("unl-106-219"),
  name: "Repulse",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a friendly unit at a battlefield. Counter an enemy spell or ability that chooses it and no other friendly unit.",
  setId: "UNL",
  timing: "reaction",
};
