import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const guards: SpellCard = {
  cardNumber: 154,
  cardType: "spell",
  domain: "order",
  energyCost: 3,
  id: createCardId("sfd-154-221"),
  name: "Guards!",
  rarity: "common",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nPlay a 2 [Might] Sand Soldier unit token. You may pay [order] to ready it.",
  setId: "SFD",
  timing: "action",
};
