import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const altarOfBlood: BattlefieldCard = {
  cardNumber: 206,
  cardType: "battlefield",
  id: createCardId("unl-206-219"),
  name: "Altar of Blood",
  rarity: "uncommon",
  rulesText:
    "If a unit here would die during combat, its controller may pay [rainbow][rainbow][rainbow] to heal it, exhaust it, and recall it instead.",
  setId: "UNL",
};
