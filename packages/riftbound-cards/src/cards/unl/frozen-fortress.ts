import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const frozenFortress: BattlefieldCard = {
  cardNumber: 212,
  cardType: "battlefield",
  id: createCardId("unl-212-219"),
  name: "Frozen Fortress",
  rarity: "uncommon",
  rulesText:
    "At the start of each player's Beginning Phase, deal 1 to each unit here. (This happens before scoring.)",
  setId: "UNL",
};
