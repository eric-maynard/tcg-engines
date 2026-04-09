import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const defiantDance: SpellCard = {
  cardNumber: 196,
  cardType: "spell",
  domain: ["calm", "chaos"],
  energyCost: 1,
  id: createCardId("sfd-196-221"),
  name: "Defiant Dance",
  rarity: "epic",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nGive a unit +2 [Might] this turn and another unit -2 [Might] this turn.",
  setId: "SFD",
  timing: "reaction",
};
