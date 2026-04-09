import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const nidaleeCatForm: UnitCard = {
  cardNumber: 114,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("unl-114-219"),
  isChampion: true,
  might: 4,
  name: "Nidalee, Cat Form",
  rarity: "rare",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nWhen I win a combat, draw 1. (I win if I remain after combat.)",
  setId: "UNL",
  tags: ["Nidalee"],
};
