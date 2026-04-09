import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const trevorSnoozebottom: UnitCard = {
  cardNumber: 48,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("unl-048-219"),
  might: 3,
  name: "Trevor Snoozebottom",
  rarity: "uncommon",
  rulesText:
    "[Shield] (+1 [Might] while I'm a defender.)\nWhen I hold, play a ready 3 [Might] Sprite unit token with [Temporary] here. (Kill it at the start of its controller's next Beginning Phase, before scoring.)",
  setId: "UNL",
};
