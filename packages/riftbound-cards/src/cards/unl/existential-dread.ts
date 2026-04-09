import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const existentialDread: SpellCard = {
  cardNumber: 134,
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  id: createCardId("unl-134-219"),
  name: "Existential Dread",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\n[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)\n[Stun] an attacking enemy unit. If it's already stunned, return it to its owner's hand instead. (A stunned unit doesn't deal combat damage this turn.)",
  setId: "UNL",
  timing: "action",
};
