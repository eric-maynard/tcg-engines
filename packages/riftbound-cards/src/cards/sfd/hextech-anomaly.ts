import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const hextechAnomaly: GearCard = {
  cardNumber: 83,
  cardType: "gear",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-083-221"),
  name: "Hextech Anomaly",
  rarity: "rare",
  rulesText:
    "[Exhaust]: [Reaction] — Pay any amount of [rainbow] to [Add] that much Energy. (Abilities that add resources can't be reacted to.)",
  setId: "SFD",
};
