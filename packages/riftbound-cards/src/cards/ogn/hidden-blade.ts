import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const hiddenBlade: SpellCard = {
  cardNumber: 213,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("ogn-213-298"),
  name: "Hidden Blade",
  rarity: "common",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nKill a unit at a battlefield. Its controller draws 2.",
  setId: "OGN",
  timing: "action",
};
