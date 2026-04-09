import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bird: UnitCard = {
  cardNumber: 2,
  cardType: "unit",
  id: createCardId("unl-t02"),
  might: 1,
  name: "Bird",
  rarity: "common",
  rulesText: "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)",
  setId: "UNL",
};
