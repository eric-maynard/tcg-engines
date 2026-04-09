import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const theBoss: LegendCard = {
  cardNumber: 269,
  cardType: "legend",
  championTag: "Sett",
  domain: ["body", "order"],
  id: createCardId("ogn-269-298"),
  name: "The Boss",
  rarity: "rare",
  rulesText:
    "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal it, exhaust it, and recall it instead. (Send it to base. This isn't a move.)\nWhen you conquer, ready me.",
  setId: "OGN",
};
