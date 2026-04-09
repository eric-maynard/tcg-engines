import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const smite: SpellCard = {
  cardNumber: 7,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("unl-007-219"),
  name: "Smite",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nDeal 3 to a unit at a battlefield. If it would die this turn, banish it instead.",
  setId: "UNL",
  timing: "action",
};
