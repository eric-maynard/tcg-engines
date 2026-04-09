import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const lilliaFaeFawn: UnitCard = {
  cardNumber: 82,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("unl-082-219"),
  isChampion: true,
  might: 3,
  name: "Lillia, Fae Fawn",
  rarity: "rare",
  rulesText:
    "[Accelerate] (You may pay [1][mind] as an additional cost to have me enter ready.)\nWhen I move from a location, play a 3 [Might] Sprite unit token with [Temporary] there. (Kill it at the start of its controller's Beginning Phase, before scoring.)",
  setId: "UNL",
  tags: ["Lillia"],
};
