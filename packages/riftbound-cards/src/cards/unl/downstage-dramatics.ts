import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const downstageDramatics: SpellCard = {
  cardNumber: 61,
  cardType: "spell",
  domain: "mind",
  energyCost: 2,
  id: createCardId("unl-061-219"),
  name: "Downstage Dramatics",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\n[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)\nDraw 1.",
  setId: "UNL",
  timing: "reaction",
};
