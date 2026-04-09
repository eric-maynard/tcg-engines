import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const luxCrownguard: UnitCard = {
  cardNumber: 14,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("ogs-014-024"),
  isChampion: true,
  might: 2,
  name: "Lux, Crownguard",
  rarity: "epic",
  rulesText:
    "[Exhaust]: [Reaction] — [Add] [2]. Use only to play spells. (Abilities that add resources can't be reacted to.)",
  setId: "OGS",
  tags: ["Lux"],
};
