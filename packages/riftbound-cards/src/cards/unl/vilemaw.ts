import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const vilemaw: UnitCard = {
  cardNumber: 60,
  cardType: "unit",
  domain: "calm",
  energyCost: 8,
  id: createCardId("unl-060-219"),
  might: 8,
  name: "Vilemaw",
  rarity: "epic",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nEnemy units here with less Might than me don't deal combat damage.\nWhen I hold, draw 1.",
  setId: "UNL",
};
