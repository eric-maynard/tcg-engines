import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const flash: SpellCard = {
  cardNumber: 11,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogs-011-024"),
  name: "Flash",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nMove up to 2 friendly units to base.",
  setId: "OGS",
  timing: "reaction",
};
