import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * The "as you play me, add the Baron Pit … if you do, I enter there" clause is
 * unique to this card, so it is modelled explicitly rather than in the parser.
 * rule 135.2.b.3 (executes during the play) + rule 369.3 (an entry replacement,
 * not a play-location choice) — see moves/play/battlefield-token.ts.
 */
const abilities: Ability[] = [
  {
    effect: {
      battlefield: {
        defId: "unl-t01",
        keywords: ["AcceptsMoveFromAnywhere"],
        name: "Baron Pit",
      },
      enterThere: true,
      type: "add-battlefield-token",
    },
    type: "static",
  } as unknown as Ability,
  {
    effect: {
      amount: 2,
      target: { controller: "friendly", excludeSelf: true, type: "unit" },
      type: "modify-might",
    },
    type: "static",
  },
];

export const baronNashor: UnitCard = {
  abilities,
  cardNumber: 147,
  cardType: "unit",
  domain: "chaos",
  energyCost: 10,
  id: createCardId("unl-147-219"),
  might: 12,
  name: "Baron Nashor",
  rarity: "epic",
  rulesText:
    "As you play me, add the Baron Pit battlefield token to the board if it's not there already. If you do, I enter there. (It has &quot;Units can move here from anywhere.&quot;)\nI can't be chosen by enemy spells and abilities.\nOther friendly units have +2 [Might].",
  setId: "UNL",
};
