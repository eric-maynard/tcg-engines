import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const arenaKingpin: UnitCard = {
  cardNumber: 1,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("unl-001-219"),
  might: 3,
  name: "Arena Kingpin",
  rarity: "common",
  rulesText: "I enter ready.\n[Exhaust]: Give a unit +3 [Might] this turn.",
  setId: "UNL",
};
