import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const theArenasGreatest: BattlefieldCard = {
  cardNumber: 290,
  cardType: "battlefield",
  id: createCardId("ogn-290-298"),
  name: "The Arena's Greatest",
  rarity: "uncommon",
  rulesText: "At the start of each player's first Beginning Phase, that player gains 1 point.",
  setId: "OGN",
};
