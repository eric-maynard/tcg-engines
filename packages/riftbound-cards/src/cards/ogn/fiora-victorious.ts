import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const fioraVictorious: UnitCard = {
  cardNumber: 232,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("ogn-232-298"),
  isChampion: true,
  might: 4,
  name: "Fiora, Victorious",
  rarity: "rare",
  rulesText:
    "While I'm [Mighty], I have [Deflect], [Ganking], and [Shield]. (I'm Mighty while I have 5+ [Might].)",
  setId: "OGN",
  tags: ["Fiora"],
};
