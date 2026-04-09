import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const stormbringer: SpellCard = {
  cardNumber: 250,
  cardType: "spell",
  domain: ["fury", "body"],
  energyCost: 6,
  id: createCardId("ogn-250-298"),
  name: "Stormbringer",
  rarity: "epic",
  rulesText:
    "Choose a friendly unit in your base. Deal damage equal to its Might to all enemy units at a battlefield, then move your unit there.",
  setId: "OGN",
  timing: "action",
};
