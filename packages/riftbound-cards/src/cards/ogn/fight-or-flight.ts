import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const fightOrFlight: SpellCard = {
  cardNumber: 168,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogn-168-298"),
  name: "Fight or Flight",
  rarity: "common",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nMove a unit from a battlefield to its base.",
  setId: "OGN",
  timing: "action",
};
