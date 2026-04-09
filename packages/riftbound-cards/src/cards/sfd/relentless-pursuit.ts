import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const relentlessPursuit: SpellCard = {
  cardNumber: 184,
  cardType: "spell",
  domain: ["fury", "body"],
  energyCost: 2,
  id: createCardId("sfd-184-221"),
  name: "Relentless Pursuit",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nMove a friendly unit. You may attach an Equipment with the same controller to it. This turn, that unit has &quot;When I conquer, you may move me to my base.&quot;",
  setId: "SFD",
  timing: "action",
};
