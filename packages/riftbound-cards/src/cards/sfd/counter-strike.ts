import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const counterStrike: SpellCard = {
  cardNumber: 194,
  cardType: "spell",
  domain: ["calm", "body"],
  energyCost: 2,
  id: createCardId("sfd-194-221"),
  name: "Counter Strike",
  rarity: "epic",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1.",
  setId: "SFD",
  timing: "reaction",
};
