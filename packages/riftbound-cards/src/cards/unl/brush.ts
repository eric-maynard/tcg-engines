import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const brush: BattlefieldCard = {
  cardNumber: 3,
  cardType: "battlefield",
  id: createCardId("unl-t03"),
  name: "Brush",
  rarity: "common",
  rulesText:
    "Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might].\nWhen you score here, you may replace this with the battlefield it replaced.",
  setId: "UNL",
};
