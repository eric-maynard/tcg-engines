import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const arcaneShift: SpellCard = {
  cardNumber: 200,
  cardType: "spell",
  domain: ["mind", "chaos"],
  energyCost: 3,
  id: createCardId("sfd-200-221"),
  name: "Arcane Shift",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nBanish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 to an enemy unit at a battlefield. Banish this.",
  setId: "SFD",
  timing: "action",
};
