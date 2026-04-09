import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const shadowWatcher: UnitCard = {
  cardNumber: 37,
  cardType: "unit",
  domain: "calm",
  energyCost: 4,
  id: createCardId("unl-037-219"),
  might: 5,
  name: "Shadow Watcher",
  rarity: "common",
  rulesText: "If a friendly unit died during your Beginning Phase this turn, I enter ready.",
  setId: "UNL",
};
