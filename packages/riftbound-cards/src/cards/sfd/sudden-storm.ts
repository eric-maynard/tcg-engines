import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const suddenStorm: SpellCard = {
  cardNumber: 17,
  cardType: "spell",
  domain: "fury",
  energyCost: 3,
  id: createCardId("sfd-017-221"),
  name: "Sudden Storm",
  rarity: "uncommon",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nDeal 2 to a unit at a battlefield. If it's attacking, deal 4 to it instead.",
  setId: "SFD",
  timing: "action",
};
