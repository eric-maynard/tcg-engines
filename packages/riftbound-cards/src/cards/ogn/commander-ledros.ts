import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const commanderLedros: UnitCard = {
  cardNumber: 231,
  cardType: "unit",
  domain: "order",
  energyCost: 6,
  id: createCardId("ogn-231-298"),
  might: 8,
  name: "Commander Ledros",
  rarity: "rare",
  rulesText:
    "As you play me, you may kill any number of friendly units as an additional cost. Reduce my cost by [order] for each killed this way.\n[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\n[Ganking] (I can move from battlefield to battlefield.)",
  setId: "OGN",
};
