import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mosstomper: UnitCard = {
  cardNumber: 47,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("unl-047-219"),
  might: 3,
  name: "Mosstomper",
  rarity: "uncommon",
  rulesText:
    "[Hunt 2] (When I conquer or hold, gain 2 XP.)\n[Level 3][&gt;] I have +1 [Might] and [Deflect]. (While you have 3+ XP, get the effect. Opponents must pay [rainbow] to choose a [Deflect] unit with a spell or ability.)",
  setId: "UNL",
};
