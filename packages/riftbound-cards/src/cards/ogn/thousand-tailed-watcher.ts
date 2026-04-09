import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const thousandTailedWatcher: UnitCard = {
  cardNumber: 116,
  cardType: "unit",
  domain: "mind",
  energyCost: 7,
  id: createCardId("ogn-116-298"),
  might: 7,
  name: "Thousand-Tailed Watcher",
  rarity: "rare",
  rulesText:
    "[Accelerate] (You may pay [1][mind] as an additional cost to have me enter ready.)\nWhen you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might].",
  setId: "OGN",
};
