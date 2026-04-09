import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const wujuMaster: LegendCard = {
  cardNumber: 191,
  cardType: "legend",
  championTag: "Master Yi",
  domain: ["calm", "body"],
  id: createCardId("unl-191-219"),
  name: "Wuju Master",
  rarity: "rare",
  rulesText:
    "[Level 6][&gt;] Your units have +1 [Might]. (While you have 6+ XP, get the effect.)\n[Level 11][&gt;] Your units enter ready.",
  setId: "UNL",
};
