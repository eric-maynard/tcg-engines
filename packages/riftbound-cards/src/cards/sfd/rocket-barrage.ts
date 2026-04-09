import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rocketBarrage: SpellCard = {
  cardNumber: 77,
  cardType: "spell",
  domain: "mind",
  energyCost: 4,
  id: createCardId("sfd-077-221"),
  name: "Rocket Barrage",
  rarity: "uncommon",
  rulesText:
    "[Repeat] [4][mind] (You may pay the additional cost to repeat this spell's effect, and may make different choices.)\nChoose one —Deal 4 to a unit in a base.Kill a gear.",
  setId: "SFD",
  timing: "action",
};
