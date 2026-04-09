import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const premonition: SpellCard = {
  cardNumber: 87,
  cardType: "spell",
  domain: "mind",
  energyCost: 2,
  id: createCardId("sfd-087-221"),
  name: "Premonition",
  rarity: "epic",
  rulesText: "[Reaction] (Play any time, even before spells and abilities resolve.)\nDraw 3.",
  setId: "SFD",
  timing: "reaction",
};
