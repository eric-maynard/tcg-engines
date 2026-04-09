import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const scorchclaw: UnitCard = {
  cardNumber: 16,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("unl-016-219"),
  might: 3,
  name: "Scorchclaw",
  rarity: "uncommon",
  rulesText:
    "[Hunt 2] (When I conquer or hold, gain 2 XP.)\n[Level 3][&gt;] I have +1 [Might] and enter ready. (While you have 3+ XP, get the effect.)",
  setId: "UNL",
};
