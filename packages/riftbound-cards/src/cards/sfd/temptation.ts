import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const temptation: SpellCard = {
  cardNumber: 129,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("sfd-129-221"),
  name: "Temptation",
  rarity: "common",
  rulesText:
    "[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)\nMove an enemy unit to a location where there's a unit with the same controller.",
  setId: "SFD",
  timing: "action",
};
