import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const arise: SpellCard = {
  cardNumber: 198,
  cardType: "spell",
  domain: ["calm", "order"],
  energyCost: 6,
  id: createCardId("sfd-198-221"),
  name: "Arise!",
  rarity: "epic",
  rulesText:
    "Play a 2 [Might] Sand Soldier unit token for each Equipment you control. Then do this: Ready up to two of them.",
  setId: "SFD",
  timing: "action",
};
