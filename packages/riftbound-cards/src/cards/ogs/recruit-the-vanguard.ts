import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const recruitTheVanguard: SpellCard = {
  cardNumber: 15,
  cardType: "spell",
  domain: "order",
  energyCost: 6,
  id: createCardId("ogs-015-024"),
  name: "Recruit the Vanguard",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nPlay four 1 [Might] Recruit unit tokens. (They can be played to your base or to battlefields you control.)",
  setId: "OGS",
  timing: "action",
};
