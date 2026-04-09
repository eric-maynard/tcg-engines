import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const conscription: SpellCard = {
  cardNumber: 140,
  cardType: "spell",
  domain: "chaos",
  energyCost: 5,
  id: createCardId("unl-140-219"),
  name: "Conscription",
  rarity: "rare",
  rulesText:
    "You may spend 5 XP as an additional cost to play this.\nChoose an enemy unit at a battlefield with 3 [Might] or less. If you paid the additional cost, choose any enemy unit at a battlefield instead. Take control of it, exhaust it, and recall it.",
  setId: "UNL",
  timing: "action",
};
