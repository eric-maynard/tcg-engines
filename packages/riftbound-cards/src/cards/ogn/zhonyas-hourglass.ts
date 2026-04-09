import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const zhonyasHourglass: GearCard = {
  cardNumber: 77,
  cardType: "gear",
  domain: "calm",
  energyCost: 2,
  id: createCardId("ogn-077-298"),
  name: "Zhonya's Hourglass",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nIf a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it. (Send it to base. This isn't a move.)",
  setId: "OGN",
};
