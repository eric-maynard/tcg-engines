import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Rally the Troops — sfd-166-221
 *
 * "[Action] When a friendly unit is played this turn, buff it.
 *  Draw 1."
 *
 * Rule 390.2: sentence 2 installs a turn-scoped delayed triggered ability on
 * the controller (no permanent carries it), then draw 1.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          duration: "turn",
          effect: { target: { type: "trigger-source" }, type: "buff" },
          target: "controller",
          trigger: { event: "play-unit-or-play-token-unit", on: "friendly-units" },
          type: "delayed-trigger",
        },
        { amount: 1, type: "draw" },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const rallyTheTroops: SpellCard = {
  abilities,
  cardNumber: 166,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("sfd-166-221"),
  name: "Rally the Troops",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nWhen a friendly unit is played this turn, buff it. (If it doesn't have a buff, it gets a +1 [Might] buff.)\nDraw 1.",
  setId: "SFD",
  timing: "action",
};
