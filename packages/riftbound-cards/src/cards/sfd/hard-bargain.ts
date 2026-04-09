import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const hardBargain: SpellCard = {
  cardNumber: 136,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("sfd-136-221"),
  name: "Hard Bargain",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\n[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)\nCounter a spell unless its controller pays [2].",
  setId: "SFD",
  timing: "reaction",
};
