import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mirrorImage: SpellCard = {
  cardNumber: 200,
  cardType: "spell",
  domain: ["mind", "order"],
  energyCost: 3,
  id: createCardId("unl-200-219"),
  name: "Mirror Image",
  rarity: "epic",
  rulesText:
    "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit. Give it [Temporary]. (Kill it at the start of its controller's Beginning Phase, before scoring.)",
  setId: "UNL",
  timing: "action",
};
