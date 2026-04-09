import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const notSoFast: SpellCard = {
  cardNumber: 45,
  cardType: "spell",
  domain: "calm",
  energyCost: 2,
  id: createCardId("sfd-045-221"),
  name: "Not So Fast",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nCounter an enemy spell or ability that chooses a friendly unit or gear.",
  setId: "SFD",
  timing: "reaction",
};
