import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const upstageComedy: SpellCard = {
  cardNumber: 9,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("unl-009-219"),
  name: "Upstage Comedy",
  rarity: "common",
  rulesText:
    "[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)\nReady a unit.",
  setId: "UNL",
  timing: "action",
};
