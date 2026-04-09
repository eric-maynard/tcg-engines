import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const diviningShells: GearCard = {
  cardNumber: 161,
  cardType: "gear",
  domain: "order",
  energyCost: 2,
  id: createCardId("unl-161-219"),
  name: "Divining Shells",
  rarity: "uncommon",
  rulesText:
    "[Vision] (When you play this, look at the top card of your Main Deck. You may recycle it.)\n[Action][&gt;] Kill this, [Exhaust]: Give a unit +2 [Might] this turn.",
  setId: "UNL",
};
