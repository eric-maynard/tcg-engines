import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Baron Pit — unl-t01 (token battlefield)
 *
 * "Units can move here from anywhere."
 *
 * Modeled as a static ability that grants a "MoveAnywhere" keyword to the
 * battlefield. The engine reads this to bypass normal adjacency checks.
 */
const abilities: Ability[] = [
  {
    effect: {
      keyword: "AcceptsMoveFromAnywhere",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const baronPit: BattlefieldCard = {
  abilities,
  cardNumber: 1,
  cardType: "battlefield",
  id: createCardId("unl-t01"),
  name: "Baron Pit",
  rarity: "common",
  rulesText:
    "(You can't start the game with a token battlefield.)\nUnits can move here from anywhere.",
  setId: "UNL",
};
