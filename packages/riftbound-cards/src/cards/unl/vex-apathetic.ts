import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const vexApathetic: UnitCard = {
  cardNumber: 150,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("unl-150-219"),
  isChampion: true,
  might: 4,
  name: "Vex, Apathetic",
  rarity: "epic",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\nWhen an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn. (It doesn't deal combat damage this turn.)",
  setId: "UNL",
  tags: ["Vex"],
};
