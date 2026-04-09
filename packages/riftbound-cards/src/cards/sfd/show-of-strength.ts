import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const showOfStrength: SpellCard = {
  cardNumber: 106,
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  id: createCardId("sfd-106-221"),
  name: "Show of Strength",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nDraw 1 for each of your [Mighty] units. (A unit is Mighty while it has 5+ [Might].)",
  setId: "SFD",
  timing: "reaction",
};
