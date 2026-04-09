import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gold: GearCard = {
  cardNumber: 3,
  cardType: "gear",
  id: createCardId("sfd-t03"),
  name: "Gold",
  rarity: "common",
  rulesText:
    "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]. (Abilities that add resources can't be reacted to.)",
  setId: "SFD",
};
