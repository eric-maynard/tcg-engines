import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const callToBattle: SpellCard = {
  cardNumber: 101,
  cardType: "spell",
  domain: "body",
  energyCost: 3,
  id: createCardId("unl-101-219"),
  name: "Call to Battle",
  rarity: "uncommon",
  rulesText:
    "Move a unit you control to a battlefield you control. Then, choose an opponent. They move a unit they control to the same battlefield.",
  setId: "UNL",
  timing: "action",
};
