import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const discipline: SpellCard = {
  cardNumber: 58,
  cardType: "spell",
  domain: "calm",
  energyCost: 2,
  id: createCardId("ogn-058-298"),
  name: "Discipline",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nGive a unit +2 [Might] this turn. Draw 1.",
  setId: "OGN",
  timing: "reaction",
};
