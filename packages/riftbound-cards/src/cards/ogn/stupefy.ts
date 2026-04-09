import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const stupefy: SpellCard = {
  cardNumber: 95,
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  id: createCardId("ogn-095-298"),
  name: "Stupefy",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nGive a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1.",
  setId: "OGN",
  timing: "reaction",
};
