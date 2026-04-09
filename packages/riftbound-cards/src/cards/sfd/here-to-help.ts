import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const hereToHelp: SpellCard = {
  cardNumber: 111,
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  id: createCardId("sfd-111-221"),
  name: "Here to Help",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nYou may play a unit from hand to a battlefield you control, reducing its cost by [3].",
  setId: "SFD",
  timing: "action",
};
