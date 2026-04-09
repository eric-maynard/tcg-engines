import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const masterYiUnstoppable: UnitCard = {
  cardNumber: 59,
  cardType: "unit",
  domain: "calm",
  energyCost: 12,
  id: createCardId("unl-059-219"),
  isChampion: true,
  might: 12,
  name: "Master Yi, Unstoppable",
  rarity: "epic",
  rulesText:
    "[Level 3][&gt;] I cost [2][calm] less. (While you have 3+ XP, get the effect.)\n[Level 6][&gt;] I cost [4][calm][calm] less instead.\n[Level 11][&gt;] I cost [6][calm][calm][calm] less instead.\n[Level 16][&gt;] I can't be chosen by enemy spells and abilities.",
  setId: "UNL",
  tags: ["Master Yi"],
};
