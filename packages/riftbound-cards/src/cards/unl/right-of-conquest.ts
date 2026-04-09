import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rightOfConquest: SpellCard = {
  cardNumber: 15,
  cardType: "spell",
  domain: "fury",
  energyCost: 3,
  id: createCardId("unl-015-219"),
  name: "Right of Conquest",
  rarity: "uncommon",
  rulesText: "Draw 1, then draw 1 for each battlefield you or allies control.",
  setId: "UNL",
  timing: "action",
};
