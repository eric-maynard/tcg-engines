import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const yiMeditative: UnitCard = {
  cardNumber: 4,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("ogs-004-024"),
  isChampion: true,
  might: 4,
  name: "Yi, Meditative",
  rarity: "rare",
  rulesText: "While you have 8+ runes, I have +4 [Might].",
  setId: "OGS",
  tags: ["Yi"],
};
