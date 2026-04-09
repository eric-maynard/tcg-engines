import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const curtainCall: SpellCard = {
  cardNumber: 182,
  cardType: "spell",
  domain: ["fury", "mind"],
  energyCost: 4,
  id: createCardId("unl-182-219"),
  name: "Curtain Call",
  rarity: "epic",
  rulesText:
    "[Repeat] — [1] / [rainbow] / [1][rainbow] (You may pay each additional cost to repeat this spell's effect.)\nChoose one you haven't already chosen —Draw 1.Deal 2 to a unit at a battlefield.Deal 3 to a unit at a base.Give a unit at a battlefield -4 [Might] this turn.",
  setId: "UNL",
  timing: "action",
};
