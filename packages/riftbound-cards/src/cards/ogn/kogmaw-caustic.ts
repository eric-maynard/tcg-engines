import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const kogmawCaustic: UnitCard = {
  cardNumber: 190,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("ogn-190-298"),
  isChampion: true,
  might: 1,
  name: "Kog'Maw, Caustic",
  rarity: "rare",
  rulesText: "[Deathknell] — Deal 4 to all units at my battlefield. (When I die, get the effect.)",
  setId: "OGN",
  tags: ["Kog'Maw"],
};
