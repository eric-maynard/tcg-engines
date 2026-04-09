import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const wizenedElder: UnitCard = {
  cardNumber: 65,
  cardType: "unit",
  domain: "calm",
  energyCost: 4,
  id: createCardId("ogn-065-298"),
  might: 4,
  name: "Wizened Elder",
  rarity: "uncommon",
  rulesText: "While I'm buffed, I have an additional +1 [Might].",
  setId: "OGN",
};
