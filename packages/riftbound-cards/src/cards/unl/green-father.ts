import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const greenFather: LegendCard = {
  cardNumber: 195,
  cardType: "legend",
  championTag: "Ivern",
  domain: ["calm", "order"],
  id: createCardId("unl-195-219"),
  name: "Green Father",
  rarity: "rare",
  rulesText:
    "When you conquer or hold, you may exhaust me to replace that battlefield with a Brush battlefield token. (Bird, Cat, Dog, Poro, and Ivern units have +1 [Might] in Brush. It can be swapped back when scored.)",
  setId: "UNL",
};
