import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const shadowsCall: SpellCard = {
  cardNumber: 165,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("unl-165-219"),
  name: "Shadow's Call",
  rarity: "uncommon",
  rulesText:
    "Choose a friendly unit without [Temporary]. Give it [Temporary]. Draw 2. (Kill it at the start of its controller's Beginning Phase, before scoring.)",
  setId: "UNL",
  timing: "action",
};
