import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const liltingLullaby: SpellCard = {
  cardNumber: 190,
  cardType: "spell",
  domain: ["calm", "mind"],
  energyCost: 2,
  id: createCardId("unl-190-219"),
  name: "Lilting Lullaby",
  rarity: "epic",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nCounter a spell. Its controller can't play spells this turn.",
  setId: "UNL",
  timing: "reaction",
};
