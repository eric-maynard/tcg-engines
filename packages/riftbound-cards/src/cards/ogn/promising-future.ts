import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Unique phrasing: a symmetric look/banish/recycle where each player then
 * plays their banished card ignoring its Energy cost (rule 356.1.b.1). One
 * `look` step per player; the second is deferred behind the first pick.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          amount: 5,
          from: "deck",
          ignoreEnergyCost: true,
          onPicked: "play",
          onRest: "recycle",
          type: "look",
        },
        {
          amount: 5,
          from: "deck",
          ignoreEnergyCost: true,
          onPicked: "play",
          onRest: "recycle",
          player: "opponent",
          type: "look",
        },
      ],
      type: "sequence",
    },
    type: "spell",
  },
] as unknown as Ability[];

export const promisingFuture: SpellCard = {
  abilities,
  cardNumber: 115,
  cardType: "spell",
  domain: "mind",
  energyCost: 5,
  id: createCardId("ogn-115-298"),
  name: "Promising Future",
  rarity: "rare",
  rulesText:
    "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest. Starting with the next player, each player plays those cards, ignoring Energy costs. (They must still pay Power costs.)",
  setId: "OGN",
  timing: "action",
};
