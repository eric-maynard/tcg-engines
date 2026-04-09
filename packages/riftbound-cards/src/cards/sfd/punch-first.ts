import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const punchFirst: SpellCard = {
  cardNumber: 97,
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  id: createCardId("sfd-097-221"),
  name: "Punch First",
  rarity: "common",
  rulesText: "[Action] (Play on your turn or in showdowns.)\nGive a unit +5 [Might] this turn.",
  setId: "SFD",
  timing: "action",
};
