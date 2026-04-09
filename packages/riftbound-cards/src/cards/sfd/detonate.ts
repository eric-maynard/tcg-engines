import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const detonate: SpellCard = {
  cardNumber: 5,
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  id: createCardId("sfd-005-221"),
  name: "Detonate",
  rarity: "common",
  rulesText: "Kill a gear. Its controller draws 2.",
  setId: "SFD",
  timing: "action",
};
