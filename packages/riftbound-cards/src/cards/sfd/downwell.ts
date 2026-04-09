import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const downwell: SpellCard = {
  cardNumber: 147,
  cardType: "spell",
  domain: "chaos",
  energyCost: 8,
  id: createCardId("sfd-147-221"),
  name: "Downwell",
  rarity: "epic",
  rulesText: "Return all units and gear to their owners' hands.",
  setId: "SFD",
  timing: "action",
};
