import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const keeperOfMasks: UnitCard = {
  cardNumber: 81,
  cardType: "unit",
  domain: "mind",
  energyCost: 2,
  id: createCardId("unl-081-219"),
  might: 1,
  name: "Keeper of Masks",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Temporary] (Kill me at the start of my controller's Beginning Phase, before scoring.)\nWhen you play me, play two Reflection unit tokens here. They become copies of me.",
  setId: "UNL",
};
