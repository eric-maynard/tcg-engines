import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rallyTheTroops: SpellCard = {
  cardNumber: 166,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("sfd-166-221"),
  name: "Rally the Troops",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nWhen a friendly unit is played this turn, buff it. (If it doesn't have a buff, it gets a +1 [Might] buff.)\nDraw 1.",
  setId: "SFD",
  timing: "action",
};
