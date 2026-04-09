import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const portalRescue: SpellCard = {
  cardNumber: 102,
  cardType: "spell",
  domain: "mind",
  energyCost: 3,
  id: createCardId("ogn-102-298"),
  name: "Portal Rescue",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nBanish a friendly unit, then its owner plays it to their base, ignoring its cost.",
  setId: "OGN",
  timing: "action",
};
