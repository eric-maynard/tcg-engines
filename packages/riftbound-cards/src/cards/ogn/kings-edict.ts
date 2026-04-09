import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const kingsEdict: SpellCard = {
  cardNumber: 237,
  cardType: "spell",
  domain: "order",
  energyCost: 6,
  id: createCardId("ogn-237-298"),
  name: "King's Edict",
  rarity: "rare",
  rulesText:
    "Starting with the next player, each other player chooses a unit you don't control that hasn't been chosen for this spell. Kill those units.",
  setId: "OGN",
  timing: "action",
};
