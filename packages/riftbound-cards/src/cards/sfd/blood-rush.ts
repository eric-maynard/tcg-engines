import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bloodRush: SpellCard = {
  cardNumber: 3,
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  id: createCardId("sfd-003-221"),
  name: "Blood Rush",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\n[Repeat] [1] (You may pay the additional cost to repeat this spell's effect.)\nGive a unit [Assault 2] this turn. (+2 [Might] while it's an attacker.)",
  setId: "SFD",
  timing: "action",
};
