import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gold: GearCard = {
  cardNumber: 5,
  cardType: "gear",
  id: createCardId("unl-t05"),
  name: "Gold",
  rarity: "common",
  rulesText:
    "[Reaction][&gt;] Kill this, [Exhaust]: [Add] [rainbow]. (Abilities that add resources can't be reacted to.)",
  setId: "UNL",
};
