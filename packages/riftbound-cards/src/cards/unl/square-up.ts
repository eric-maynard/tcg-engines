import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const squareUp: SpellCard = {
  cardNumber: 17,
  cardType: "spell",
  domain: "fury",
  energyCost: 4,
  id: createCardId("unl-017-219"),
  name: "Square Up",
  rarity: "uncommon",
  rulesText:
    "[Repeat] — Discard 1 (You may pay the additional cost to repeat this spell's effect.)\nGive a unit [Assault 4] this turn. (+4 [Might] while it's an attacker.)",
  setId: "UNL",
  timing: "action",
};
