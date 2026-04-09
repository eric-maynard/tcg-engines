import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const foxFire: SpellCard = {
  cardNumber: 256,
  cardType: "spell",
  domain: ["calm", "mind"],
  energyCost: 3,
  id: createCardId("ogn-256-298"),
  name: "Fox-Fire",
  rarity: "epic",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nKill any number of units at a battlefield with total Might 4 or less.",
  setId: "OGN",
  timing: "action",
};
