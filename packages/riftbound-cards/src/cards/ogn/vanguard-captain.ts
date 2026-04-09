import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const vanguardCaptain: UnitCard = {
  cardNumber: 218,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("ogn-218-298"),
  might: 3,
  name: "Vanguard Captain",
  rarity: "common",
  rulesText:
    "[Legion] — When you play me, play two 1 [Might] Recruit unit tokens here. (Get the effect if you've played another card this turn.)",
  setId: "OGN",
};
