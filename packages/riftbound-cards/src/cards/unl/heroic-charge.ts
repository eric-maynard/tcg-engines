import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const heroicCharge: SpellCard = {
  cardNumber: 155,
  cardType: "spell",
  domain: "order",
  energyCost: 3,
  id: createCardId("unl-155-219"),
  name: "Heroic Charge",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nGive a friendly unit +1 [Might] this turn and [Stun] an enemy unit at its location. (A stunned unit doesn't deal combat damage this turn.)",
  setId: "UNL",
  timing: "action",
};
