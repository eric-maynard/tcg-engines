import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const showstopper: SpellCard = {
  cardNumber: 270,
  cardType: "spell",
  domain: ["body", "order"],
  energyCost: 1,
  id: createCardId("ogn-270-298"),
  name: "Showstopper",
  rarity: "epic",
  rulesText:
    "Buff a friendly unit in your base, then move it to a battlefield. (If it doesn't have a buff, it gets a +1 [Might] buff.)",
  setId: "OGN",
  timing: "action",
};
