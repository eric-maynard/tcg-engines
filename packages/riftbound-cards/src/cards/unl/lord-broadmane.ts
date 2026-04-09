import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const lordBroadmane: UnitCard = {
  cardNumber: 12,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("unl-012-219"),
  might: 5,
  name: "Lord Broadmane",
  rarity: "uncommon",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nWhen you play me, give your other units here [Assault] this turn. (+1 [Might] while they're attackers.)",
  setId: "UNL",
};
