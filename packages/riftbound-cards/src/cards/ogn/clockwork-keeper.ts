import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const clockworkKeeper: UnitCard = {
  cardNumber: 44,
  cardType: "unit",
  domain: "calm",
  energyCost: 2,
  id: createCardId("ogn-044-298"),
  might: 2,
  name: "Clockwork Keeper",
  rarity: "common",
  rulesText:
    "You may pay [calm] as an additional cost to play me.\nWhen you play me, if you paid the additional cost, draw 1.",
  setId: "OGN",
};
