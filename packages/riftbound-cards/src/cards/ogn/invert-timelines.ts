import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const invertTimelines: SpellCard = {
  cardNumber: 201,
  cardType: "spell",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("ogn-201-298"),
  name: "Invert Timelines",
  rarity: "epic",
  rulesText: "Each player discards their hand, then draws 4.",
  setId: "OGN",
  timing: "action",
};
