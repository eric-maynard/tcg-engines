import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const lastBreath: SpellCard = {
  cardNumber: 260,
  cardType: "spell",
  domain: ["calm", "chaos"],
  energyCost: 3,
  id: createCardId("ogn-260-298"),
  name: "Last Breath",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nReady a friendly unit. It deals damage equal to its Might to an enemy unit at a battlefield.",
  setId: "OGN",
  timing: "action",
};
