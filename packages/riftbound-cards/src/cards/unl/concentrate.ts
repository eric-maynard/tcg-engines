import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const concentrate: SpellCard = {
  cardNumber: 91,
  cardType: "spell",
  domain: "body",
  energyCost: 5,
  id: createCardId("unl-091-219"),
  name: "Concentrate",
  rarity: "common",
  rulesText:
    "Draw 2.\n[Level 6][&gt;] This costs [2] less. (While you have 6+ XP, get the effect.)\n[Level 11][&gt;] This costs [4] less instead.",
  setId: "UNL",
  timing: "action",
};
