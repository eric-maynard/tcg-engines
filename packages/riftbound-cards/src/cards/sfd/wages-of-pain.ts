import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const wagesOfPain: SpellCard = {
  cardNumber: 70,
  cardType: "spell",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-070-221"),
  name: "Wages of Pain",
  rarity: "common",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nDeal 3 to a unit at a battlefield. Play a Gold gear token exhausted.",
  setId: "SFD",
  timing: "action",
};
