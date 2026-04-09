import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bushwhack: SpellCard = {
  cardNumber: 4,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("sfd-004-221"),
  name: "Bushwhack",
  rarity: "common",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nFriendly units enter ready this turn. Play a Gold gear token exhausted.",
  setId: "SFD",
  timing: "action",
};
