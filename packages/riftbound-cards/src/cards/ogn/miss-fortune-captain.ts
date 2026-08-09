import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// "something ELSE that's EXHAUSTED" — never herself, and only exhausted permanents.
const abilities: Ability[] = [
  { cost: { energy: 1, power: ["body"] }, keyword: "Accelerate", type: "keyword" },
  { keyword: "Ganking", type: "keyword" },
  {
    effect: {
      target: { excludeSelf: true, filter: "exhausted", location: "anywhere", type: "unit" },
      type: "ready",
    },
    // rule 383.3.a — the leading "you may" is decided at FINALIZATION, before
    // the ability sits on the chain: its controller is asked yes/no first and
    // only then names the exhausted permanent to ready.
    optional: true,
    trigger: { event: "move", on: "self", restrictions: [{ type: "first-time-each-turn" }] },
    type: "triggered",
  },
];

export const missFortuneCaptain: UnitCard = {
  abilities,
  cardNumber: 162,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("ogn-162-298"),
  isChampion: true,
  might: 5,
  name: "Miss Fortune, Captain",
  rarity: "epic",
  rulesText:
    "[Accelerate] (You may pay [1][body] as an additional cost to have me enter ready.)\n[Ganking] (I can move from battlefield to battlefield.)\nThe first time I move each turn, you may ready something else that's exhausted.",
  setId: "OGN",
  tags: ["Miss Fortune"],
};
