import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const stareDown: SpellCard = {
  cardNumber: 107,
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  id: createCardId("unl-107-219"),
  name: "Stare Down",
  rarity: "uncommon",
  rulesText:
    "Choose a friendly unit and a battlefield. Move all enemy units at that battlefield with less Might than the chosen unit to their base. Gain 1 XP.",
  setId: "UNL",
  timing: "action",
};
