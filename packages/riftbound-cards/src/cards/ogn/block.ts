import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const block: SpellCard = {
  cardNumber: 57,
  cardType: "spell",
  domain: "calm",
  energyCost: 2,
  id: createCardId("ogn-057-298"),
  name: "Block",
  rarity: "uncommon",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nGive a unit [Shield 3] and [Tank] this turn. (+3 [Might] while it's a defender. It must be assigned combat damage first.)",
  setId: "OGN",
  timing: "action",
};
