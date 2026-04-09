import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const emperorsDivide: SpellCard = {
  cardNumber: 43,
  cardType: "spell",
  domain: "calm",
  energyCost: 2,
  id: createCardId("sfd-043-221"),
  name: "Emperor's Divide",
  rarity: "uncommon",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nMove any number of friendly units at a battlefield to their base.",
  setId: "SFD",
  timing: "action",
};
