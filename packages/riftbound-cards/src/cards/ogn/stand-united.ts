import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const standUnited: SpellCard = {
  cardNumber: 53,
  cardType: "spell",
  domain: "calm",
  energyCost: 3,
  id: createCardId("ogn-053-298"),
  name: "Stand United",
  rarity: "common",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Action] (Play on your turn or in showdowns.)\nBuff a friendly unit. Buffs give an additional +1 [Might] to friendly units this turn. (To buff a unit, give it a +1 [Might] buff if it doesn't already have one.)",
  setId: "OGN",
  timing: "action",
};
