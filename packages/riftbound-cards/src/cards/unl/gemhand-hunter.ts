import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gemhandHunter: UnitCard = {
  cardNumber: 94,
  cardType: "unit",
  domain: "body",
  energyCost: 2,
  id: createCardId("unl-094-219"),
  might: 2,
  name: "Gemhand Hunter",
  rarity: "common",
  rulesText:
    "[Hunt] (When I conquer or hold, gain 1 XP.)\n[Level 6][&gt;] I have +1 [Might]. (While you have 6+ XP, get the effect.)",
  setId: "UNL",
};
