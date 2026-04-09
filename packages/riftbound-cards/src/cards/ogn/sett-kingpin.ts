import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const settKingpin: UnitCard = {
  cardNumber: 240,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("ogn-240-298"),
  isChampion: true,
  might: 5,
  name: "Sett, Kingpin",
  rarity: "rare",
  rulesText:
    "[Tank] (I must be assigned combat damage first.)\nI get +1 [Might] for each buffed friendly unit at my battlefield.",
  setId: "OGN",
  tags: ["Sett"],
};
