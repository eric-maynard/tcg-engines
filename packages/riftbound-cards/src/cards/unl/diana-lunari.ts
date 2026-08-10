import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Diana, Lunari — unl-079-219
 *
 * "When a showdown begins here, you may pay [1]. If you do, [Predict], then
 *  reveal the top card of your Main Deck. If it's a spell, draw it."
 */
const abilities: Ability[] = [
  {
    // rule 444.2 (whose own example is this card) / 383.3.b — "you may pay [1].
    // If you do, …" is a payment written INSIDE the instructions, not the
    // trigger's base cost: the item goes on the Chain charging and asking
    // nothing, and its controller decides only as it RESOLVES (so a response
    // that bounces Diana first still leaves the choice intact). This is the
    // same shape the parser emits for the phrasing; contrast "you may pay [1]
    // TO …", which IS the trigger's base cost and is settled at finalization.
    effect: {
      condition: { cost: { energy: 1 }, type: "pay-cost" },
      then: {
        effects: [
          { amount: 1, type: "predict" },
          {
            amount: 1,
            from: "deck",
            then: { draw: 1 },
            type: "reveal",
            until: "spell",
          },
        ],
        type: "sequence",
      },
      type: "conditional",
    },
    // rule-id: unl-079-219 — "When a showdown begins here" covers non-combat
    // showdowns too, so key off the engine's showdown-begin event (not attack).
    trigger: {
      event: "showdown-begin",
      on: { location: "here" },
    },
    type: "triggered",
  },
];

export const dianaLunari: UnitCard = {
  abilities,
  cardNumber: 79,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("unl-079-219"),
  isChampion: true,
  might: 3,
  name: "Diana, Lunari",
  rarity: "rare",
  rulesText:
    "When a showdown begins here, you may pay [1]. If you do, [Predict], then reveal the top card of your Main Deck. If it's a spell, draw it. (To Predict, look at the top card of your Main Deck. You may recycle it.)",
  setId: "UNL",
  tags: ["Diana"],
};
