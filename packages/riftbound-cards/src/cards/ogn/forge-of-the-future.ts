import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const forgeOfTheFuture: GearCard = {
  cardNumber: 212,
  cardType: "gear",
  domain: "order",
  energyCost: 2,
  id: createCardId("ogn-212-298"),
  name: "Forge of the Future",
  rarity: "common",
  rulesText:
    "When you play this, play a 1 [Might] Recruit unit token at your base.\nKill this: Recycle up to 4 cards from trashes.",
  setId: "OGN",
};
