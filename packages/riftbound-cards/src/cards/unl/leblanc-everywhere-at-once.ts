import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const leblancEverywhereAtOnce: UnitCard = {
  cardNumber: 90,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("unl-090-219"),
  isChampion: true,
  might: 4,
  name: "LeBlanc, Everywhere at Once",
  rarity: "epic",
  rulesText:
    "[Backline] (I must be assigned combat damage last.)\nYour [Temporary] effects at my battlefield don't trigger.",
  setId: "UNL",
  tags: ["LeBlanc"],
};
