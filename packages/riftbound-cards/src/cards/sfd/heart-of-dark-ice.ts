import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const heartOfDarkIce: GearCard = {
  cardNumber: 52,
  cardType: "gear",
  domain: "calm",
  energyCost: 3,
  id: createCardId("sfd-052-221"),
  name: "Heart of Dark Ice",
  rarity: "rare",
  rulesText: "[Exhaust]: Give a unit +3 [Might] this turn.",
  setId: "SFD",
};
