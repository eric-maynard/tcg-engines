import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const convergentMutation: SpellCard = {
  cardNumber: 108,
  cardType: "spell",
  domain: "mind",
  energyCost: 2,
  id: createCardId("ogn-108-298"),
  name: "Convergent Mutation",
  rarity: "rare",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a friendly unit. This turn, increase its Might to the Might of another friendly unit.",
  setId: "OGN",
  timing: "reaction",
};
