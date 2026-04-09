import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const annieFiery: UnitCard = {
  cardNumber: 1,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("ogs-001-024"),
  isChampion: true,
  might: 4,
  name: "Annie, Fiery",
  rarity: "epic",
  rulesText:
    "Your spells and abilities deal 1 Bonus Damage. (Each instance of damage the spell deals is increased by 1.)",
  setId: "OGS",
  tags: ["Annie"],
};
