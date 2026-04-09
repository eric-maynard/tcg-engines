import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const deathgrip: SpellCard = {
  cardNumber: 163,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("sfd-163-221"),
  name: "Deathgrip",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nKill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this turn.\nDraw 1.",
  setId: "SFD",
  timing: "reaction",
};
