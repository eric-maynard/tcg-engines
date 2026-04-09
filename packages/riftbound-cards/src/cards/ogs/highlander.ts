import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const highlander: SpellCard = {
  cardNumber: 20,
  cardType: "spell",
  domain: ["calm", "body"],
  energyCost: 4,
  id: createCardId("ogs-020-024"),
  name: "Highlander",
  rarity: "epic",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a friendly unit. The next time it would die this turn, heal it, exhaust it, and recall it instead. (Send it to base. This isn't a move.)",
  setId: "OGS",
  timing: "reaction",
};
