import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const skywardStrike: SpellCard = {
  cardNumber: 38,
  cardType: "spell",
  domain: "calm",
  energyCost: 2,
  id: createCardId("unl-038-219"),
  name: "Skyward Strike",
  rarity: "common",
  rulesText:
    "Move an enemy unit.\n[Level 6][&gt;] [Stun] an enemy unit. (While you have 6+ XP, get the effect. A stunned unit doesn't deal combat damage this turn.)",
  setId: "UNL",
  timing: "action",
};
