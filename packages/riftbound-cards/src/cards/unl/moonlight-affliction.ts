import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const moonlightAffliction: SpellCard = {
  cardNumber: 66,
  cardType: "spell",
  domain: "mind",
  energyCost: 7,
  id: createCardId("unl-066-219"),
  name: "Moonlight Affliction",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nGive a unit -10 [Might] this turn.",
  setId: "UNL",
  timing: "reaction",
};
