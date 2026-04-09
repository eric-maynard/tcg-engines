import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const garbageGrabber: GearCard = {
  cardNumber: 99,
  cardType: "gear",
  domain: "mind",
  energyCost: 2,
  id: createCardId("ogn-099-298"),
  name: "Garbage Grabber",
  rarity: "uncommon",
  rulesText: "Recycle 3 from your trash, [1], [Exhaust]: Draw 1.",
  setId: "OGN",
};
