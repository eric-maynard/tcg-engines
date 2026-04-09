import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const strikeDown: SpellCard = {
  cardNumber: 107,
  cardType: "spell",
  domain: "body",
  energyCost: 3,
  id: createCardId("sfd-107-221"),
  name: "Strike Down",
  rarity: "uncommon",
  rulesText:
    "Choose an equipped friendly unit. It deals damage equal to its Might to an enemy unit. Then detach an Equipment from it.",
  setId: "SFD",
  timing: "action",
};
