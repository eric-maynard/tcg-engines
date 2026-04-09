import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const smokeScreen: SpellCard = {
  cardNumber: 93,
  cardType: "spell",
  domain: "mind",
  energyCost: 2,
  id: createCardId("ogn-093-298"),
  name: "Smoke Screen",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nGive a unit -4 [Might] this turn, to a minimum of 1 [Might].",
  setId: "OGN",
  timing: "reaction",
};
