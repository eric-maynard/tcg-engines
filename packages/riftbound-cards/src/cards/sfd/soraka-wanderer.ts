import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sorakaWanderer: UnitCard = {
  cardNumber: 173,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("sfd-173-221"),
  isChampion: true,
  might: 4,
  name: "Soraka, Wanderer",
  rarity: "rare",
  rulesText:
    "I must be assigned combat damage last.\nIf another unit you control here would die, if it has less Might than me, instead heal it, exhaust it, and recall it. (Send it to base. This isn't a move.)",
  setId: "SFD",
  tags: ["Soraka"],
};
