import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const garenCommander: UnitCard = {
  cardNumber: 13,
  cardType: "unit",
  domain: "order",
  energyCost: 6,
  id: createCardId("ogs-013-024"),
  isChampion: true,
  might: 5,
  name: "Garen, Commander",
  rarity: "epic",
  rulesText: "Other friendly units have +1 [Might] here.",
  setId: "OGS",
  tags: ["Garen"],
};
