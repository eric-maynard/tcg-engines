import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mageseekerWarden: UnitCard = {
  cardNumber: 70,
  cardType: "unit",
  domain: "calm",
  energyCost: 6,
  id: createCardId("ogn-070-298"),
  might: 5,
  name: "Mageseeker Warden",
  rarity: "rare",
  rulesText:
    "While I'm at a battlefield, opponents can only play units to their base.\nWhile I'm at a battlefield, spells and abilities can't ready enemy units and gear.",
  setId: "OGN",
};
