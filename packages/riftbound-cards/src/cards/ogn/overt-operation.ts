import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const overtOperation: SpellCard = {
  cardNumber: 153,
  cardType: "spell",
  domain: "body",
  energyCost: 5,
  id: createCardId("ogn-153-298"),
  name: "Overt Operation",
  rarity: "rare",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nFor each friendly unit, you may spend its buff to ready it. Then buff all friendly units. (Each one that doesn't have a buff gets a +1 [Might] buff.)",
  setId: "OGN",
  timing: "action",
};
