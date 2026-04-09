import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const spriteQueen: UnitCard = {
  cardNumber: 84,
  cardType: "unit",
  domain: "mind",
  energyCost: 7,
  id: createCardId("unl-084-219"),
  might: 6,
  name: "Sprite Queen",
  rarity: "rare",
  rulesText:
    "When you play me or at the start of your Beginning Phase, play a ready 3 [Might] Sprite unit token with [Temporary] to your base. (Kill them at the start of their controller's next Beginning Phase, before scoring.)",
  setId: "UNL",
};
