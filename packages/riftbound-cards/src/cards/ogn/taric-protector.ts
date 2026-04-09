import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const taricProtector: UnitCard = {
  cardNumber: 74,
  cardType: "unit",
  domain: "calm",
  energyCost: 4,
  id: createCardId("ogn-074-298"),
  isChampion: true,
  might: 4,
  name: "Taric, Protector",
  rarity: "rare",
  rulesText:
    "[Shield] (+1 [Might] while I'm a defender.)\n[Tank] (I must be assigned combat damage first.)\nOther friendly units here have [Shield].",
  setId: "OGN",
  tags: ["Taric"],
};
