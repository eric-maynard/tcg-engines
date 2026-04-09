import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const blastCone: GearCard = {
  cardNumber: 133,
  cardType: "gear",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("unl-133-219"),
  name: "Blast Cone",
  rarity: "uncommon",
  rulesText:
    "When you play this, you may move an enemy unit.\nWhen you move an enemy unit, you may exhaust this to [Stun] it. (It doesn't deal combat damage this turn.)",
  setId: "UNL",
};
