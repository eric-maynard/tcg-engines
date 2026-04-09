import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const spriteBurst: SpellCard = {
  cardNumber: 69,
  cardType: "spell",
  domain: "mind",
  energyCost: 5,
  id: createCardId("unl-069-219"),
  name: "Sprite Burst",
  rarity: "common",
  rulesText:
    "Play two ready 3 [Might] Sprite unit tokens with [Temporary]. (Kill each at the start of its controller's Beginning Phase, before scoring.)",
  setId: "UNL",
  timing: "action",
};
