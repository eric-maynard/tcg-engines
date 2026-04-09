import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const solariShieldbearer: UnitCard = {
  cardNumber: 51,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("ogn-051-298"),
  might: 2,
  name: "Solari Shieldbearer",
  rarity: "common",
  rulesText: "When you play me, stun a unit. (It doesn't deal combat damage this turn.)",
  setId: "OGN",
};
