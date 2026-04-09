import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const turnToDust: SpellCard = {
  cardNumber: 70,
  cardType: "spell",
  domain: "mind",
  energyCost: 2,
  id: createCardId("unl-070-219"),
  name: "Turn to Dust",
  rarity: "common",
  rulesText:
    "Give a gear [Temporary]. (Kill it at the start of its controller's Beginning Phase, before scoring.)",
  setId: "UNL",
  timing: "action",
};
