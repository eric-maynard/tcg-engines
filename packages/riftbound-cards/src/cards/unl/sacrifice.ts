import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sacrifice: SpellCard = {
  cardNumber: 173,
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  id: createCardId("unl-173-219"),
  name: "Sacrifice",
  rarity: "rare",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nAs an additional cost to play this, kill a friendly [Mighty] unit. (A unit is Mighty while it has 5+ [Might].)\nDraw 2 and channel 1 rune exhausted.",
  setId: "UNL",
  timing: "reaction",
};
