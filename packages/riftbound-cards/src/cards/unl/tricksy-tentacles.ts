import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const tricksyTentacles: SpellCard = {
  cardNumber: 54,
  cardType: "spell",
  domain: "calm",
  energyCost: 4,
  id: createCardId("unl-054-219"),
  name: "Tricksy Tentacles",
  rarity: "rare",
  rulesText:
    "Move any number of enemy units with the same controller and a total Might of 8 or less to a single location.",
  setId: "UNL",
  timing: "action",
};
