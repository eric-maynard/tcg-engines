import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rellMagnetic: UnitCard = {
  cardNumber: 24,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("sfd-024-221"),
  isChampion: true,
  might: 4,
  name: "Rell, Magnetic",
  rarity: "rare",
  rulesText:
    "[Tank] (I must be assigned combat damage first.)\nWhen I attack, you may play an Equipment with Energy cost no more than [2], ignoring its cost. If you do, then do this: Attach it to me.",
  setId: "SFD",
  tags: ["Rell"],
};
