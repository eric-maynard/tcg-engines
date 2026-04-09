import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mushroomPouch: GearCard = {
  cardNumber: 101,
  cardType: "gear",
  domain: "mind",
  energyCost: 2,
  id: createCardId("ogn-101-298"),
  name: "Mushroom Pouch",
  rarity: "uncommon",
  rulesText:
    "At the start of your Beginning Phase, if you control a facedown card at a battlefield, draw 1.",
  setId: "OGN",
};
