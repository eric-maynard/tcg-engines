import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * rule 355.10.d — the unit Vex stuns is determined automatically ("it" = the unit
 * the opponent just played), so nobody CHOOSES it and it is not a target. Hence
 * "can't be chosen by enemy spells and abilities" is no defence and Deflect
 * (rule 809.1.d, which taxes only choosing) never applies. The parser's generic
 * `{type:"unit"}` target would instead raise a choose-target prompt.
 */
const abilities: Ability[] = [
  { keyword: "Deflect", type: "keyword", value: 1 },
  {
    // rule 350.1 — "They can't move it this turn" is a movement restriction on
    // the stunned unit, modelled as a turn-duration granted `NoMove` keyword
    // that the movement moves consult (same shape as `NoMoveToBase`).
    effect: {
      effects: [
        { target: { type: "trigger-source" }, type: "stun" },
        {
          duration: "turn",
          keyword: "NoMove",
          target: { type: "trigger-source" },
          type: "grant-keyword",
        },
      ],
      type: "sequence",
    },
    trigger: {
      event: "play-unit",
      on: "opponent",
      restrictions: [{ type: "self-at-battlefield" }],
    },
    type: "triggered",
  },
];

export const vexApathetic: UnitCard = {
  abilities,
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
