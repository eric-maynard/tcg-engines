import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const wujuApprentice: UnitCard = {
  cardNumber: 40,
  cardType: "unit",
  domain: "calm",
  energyCost: 2,
  id: createCardId("unl-040-219"),
  might: 2,
  name: "Wuju Apprentice",
  rarity: "common",
  rulesText:
    "[Hunt] (When I conquer or hold, gain 1 XP.)\n[Level 6][&gt;] When you play me, draw 1. (While you have 6+ XP, get the effect.)",
  setId: "UNL",
};
