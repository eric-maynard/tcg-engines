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
    // rule 383.3.a / 402.1 — the leading "you may" is decided while the item is
    // FINALIZED (perform the ability or drop it: declined ⇒ no Chain item, no
    // reaction window). rule 205 / 444.2 (whose own example is this card) —
    // "pay [1]. If you do, …" is NOT a cost (no "[X] to [Y]" link): it is a Pay
    // game action performed as the ability RESOLVES, and its controller may
    // still choose not to pay then (444.2), in which case the linked "if you
    // do" instructions are not performed. Same shape the parser emits for the
    // phrasing (`optional` + a resolution-time pay question); contrast "you may
    // pay [1] TO …", which IS the trigger's base cost, paid at finalization
    // (383.3.b).
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
    optional: true,
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
