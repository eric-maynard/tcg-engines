import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const guerillaWarfare: SpellCard = {
  cardNumber: 264,
  cardType: "spell",
  domain: ["mind", "chaos"],
  energyCost: 2,
  id: createCardId("ogn-264-298"),
  name: "Guerilla Warfare",
  rarity: "epic",
  rulesText:
    "Return up to two cards with [Hidden] from your trash to your hand. You can hide cards ignoring costs this turn.",
  setId: "OGN",
  timing: "action",
};
