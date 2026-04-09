import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const caitlynPatrolling: UnitCard = {
  cardNumber: 68,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("ogn-068-298"),
  isChampion: true,
  might: 3,
  name: "Caitlyn, Patrolling",
  rarity: "rare",
  rulesText:
    "I must be assigned combat damage last.\n[Exhaust]: Deal damage equal to my Might to a unit at a battlefield. Use this ability only while I'm at a battlefield.",
  setId: "OGN",
  tags: ["Caitlyn"],
};
