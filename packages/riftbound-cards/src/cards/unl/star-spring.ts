import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Star Spring — unl-215-219 (Battlefield)
 *
 * The first time a player plays a non-token unit here each turn, they may move
 * another unit they control here to its base.
 *
 * rule 190.6.c — "a player … they": the player who played the unit controls the
 * ability and makes its choices.
 * rule 359.2.c — both "here"s are this battlefield: the play must land here, and
 * only that player's units standing here can be sent home.
 * rule 355.9.c — "another" excludes the unit just played (`excludeTriggerSource`).
 * The parser drops the controller/here/base qualifiers ("move another unit →
 * choose"), so the ability is written out here.
 */
const abilities: Ability[] = [
  {
    effect: {
      target: {
        controller: "friendly",
        excludeSelf: true,
        excludeTriggerSource: true,
        location: "here",
        type: "unit",
      },
      to: "base",
      type: "move",
    },
    optional: true,
    trigger: {
      event: "play-unit",
      location: "here",
      on: "any-player",
      restrictions: [{ type: "first-time-each-turn" }, { type: "non-token" }],
    },
    type: "triggered",
  } as unknown as Ability,
];

export const starSpring: BattlefieldCard = {
  abilities,
  cardNumber: 215,
  cardType: "battlefield",
  id: createCardId("unl-215-219"),
  name: "Star Spring",
  rarity: "uncommon",
  rulesText:
    "The first time a player plays a non-token unit here each turn, they may move another unit they control here to its base.",
  setId: "UNL",
};
