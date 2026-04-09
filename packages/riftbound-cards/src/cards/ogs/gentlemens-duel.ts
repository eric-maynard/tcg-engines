import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gentlemensDuel: SpellCard = {
  cardNumber: 8,
  cardType: "spell",
  domain: "body",
  energyCost: 6,
  id: createCardId("ogs-008-024"),
  name: "Gentlemen's Duel",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nGive a friendly unit +3 [Might] this turn. Then choose an enemy unit. They deal damage equal to their Mights to each other.",
  setId: "OGS",
  timing: "action",
};
