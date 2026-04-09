import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const honeyfruit: GearCard = {
  cardNumber: 49,
  cardType: "gear",
  domain: "calm",
  energyCost: 2,
  id: createCardId("unl-049-219"),
  name: "Honeyfruit",
  rarity: "rare",
  rulesText:
    "This enters exhausted.\n[Reaction][&gt;] [Exhaust]: [Add] [rainbow]. (Abilities that add resources can't be reacted to.)\n[Level 6][&gt;] [&gt;&gt;][Reaction][&gt;] [Exhaust]: [Add] [1][rainbow]. (Use this ability only while you have 6+ XP.)",
  setId: "UNL",
};
