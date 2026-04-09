import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const zenithBlade: SpellCard = {
  cardNumber: 262,
  cardType: "spell",
  domain: ["calm", "order"],
  energyCost: 3,
  id: createCardId("ogn-262-298"),
  name: "Zenith Blade",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nStun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield. (A stunned unit doesn't deal combat damage this turn.)",
  setId: "OGN",
  timing: "action",
};
