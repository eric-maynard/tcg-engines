import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const arenaBar: GearCard = {
  cardNumber: 124,
  cardType: "gear",
  domain: "body",
  energyCost: 3,
  id: createCardId("ogn-124-298"),
  name: "Arena Bar",
  rarity: "common",
  rulesText:
    "[Exhaust]: Buff an exhausted friendly unit. (If it doesn't have a buff, it gets a +1 [Might] buff.)",
  setId: "OGN",
};
