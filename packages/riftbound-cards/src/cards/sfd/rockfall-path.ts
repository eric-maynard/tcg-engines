import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rockfallPath: BattlefieldCard = {
  cardNumber: 216,
  cardType: "battlefield",
  id: createCardId("sfd-216-221"),
  name: "Rockfall Path",
  rarity: "uncommon",
  rulesText: "Units can't be played here.",
  setId: "SFD",
};
