import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ancientHenge: GearCard = {
  cardNumber: 117,
  cardType: "gear",
  domain: "body",
  energyCost: 2,
  id: createCardId("sfd-117-221"),
  name: "Ancient Henge",
  rarity: "epic",
  rulesText:
    "[Exhaust]: [Reaction] — Pay any amount of Energy to [Add] that much [rainbow]. (Abilities that add resources can't be reacted to.)",
  setId: "SFD",
};
