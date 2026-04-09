import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sumpworksMap: GearCard = {
  cardNumber: 85,
  cardType: "gear",
  domain: "mind",
  energyCost: 2,
  id: createCardId("unl-085-219"),
  name: "Sumpworks Map",
  rarity: "rare",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\n[Temporary] (Kill this at the start of its controller's Beginning Phase, before scoring.)\nWhen an opponent scores, draw 1.",
  setId: "UNL",
};
