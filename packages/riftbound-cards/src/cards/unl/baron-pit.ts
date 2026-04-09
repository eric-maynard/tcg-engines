import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const baronPit: BattlefieldCard = {
  cardNumber: 1,
  cardType: "battlefield",
  id: createCardId("unl-t01"),
  name: "Baron Pit",
  rarity: "common",
  rulesText:
    "(You can't start the game with a token battlefield.)\nUnits can move here from anywhere.",
  setId: "UNL",
};
