import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const vilemawsLair: BattlefieldCard = {
  cardNumber: 295,
  cardType: "battlefield",
  id: createCardId("ogn-295-298"),
  name: "Vilemaw's Lair",
  rarity: "uncommon",
  rulesText: "Units can't move from here to base.",
  setId: "OGN",
};
