import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const misterRoot: UnitCard = {
  cardNumber: 127,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("unl-127-219"),
  might: 1,
  name: "Mister Root",
  rarity: "common",
  rulesText:
    "[Accelerate] (You may pay [1][chaos] as an additional cost to have me enter ready.)\nWhen I move to a battlefield, gain 2 XP.",
  setId: "UNL",
};
