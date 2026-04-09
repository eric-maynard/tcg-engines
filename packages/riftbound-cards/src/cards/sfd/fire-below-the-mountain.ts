import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const fireBelowTheMountain: LegendCard = {
  cardNumber: 189,
  cardType: "legend",
  championTag: "Ornn",
  domain: ["calm", "mind"],
  id: createCardId("sfd-189-221"),
  name: "Fire Below the Mountain",
  rarity: "rare",
  rulesText:
    "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play gear or use gear abilities. (Abilities that add resources can't be reacted to.)",
  setId: "SFD",
};
