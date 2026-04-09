import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ragingSoul: UnitCard = {
  cardNumber: 19,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("ogn-019-298"),
  might: 4,
  name: "Raging Soul",
  rarity: "uncommon",
  rulesText:
    "If you've discarded a card this turn, I have [Assault] and [Ganking]. (+1 [Might] while I'm an attacker. I can move from battlefield to battlefield.)",
  setId: "OGN",
};
