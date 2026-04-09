import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const switcheroo: SpellCard = {
  cardNumber: 145,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("sfd-145-221"),
  name: "Switcheroo",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nSwap the Might of two units at the same battlefield this turn.",
  setId: "SFD",
  timing: "action",
};
