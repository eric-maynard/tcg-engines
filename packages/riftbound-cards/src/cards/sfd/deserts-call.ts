import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const desertsCall: SpellCard = {
  cardNumber: 31,
  cardType: "spell",
  domain: "calm",
  energyCost: 2,
  id: createCardId("sfd-031-221"),
  name: "Desert's Call",
  rarity: "common",
  rulesText:
    "[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)\nPlay a 2 [Might] Sand Soldier unit token.",
  setId: "SFD",
  timing: "action",
};
