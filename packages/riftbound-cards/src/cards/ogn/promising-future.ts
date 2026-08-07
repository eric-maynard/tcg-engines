import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Unique phrasing: a symmetric look/banish/recycle where each player then
 * plays their banished card ignoring its Energy cost (rule 356.1.b.1). One
 * `look` step per player; the second is deferred behind the first pick.
 *
 * rule 337.1.b (ruling 23c9277d071cd1f7) — banishing is a PUBLIC first pass
 * that finishes before anyone plays: both picks are only banished here, and the
 * separate `play-banished-pass` step then plays them starting with the player
 * after the turn player. Playing at pick time would let the turn player's
 * counterspell see nothing to counter.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          amount: 5,
          from: "deck",
          onPicked: "banish",
          onRest: "recycle",
          type: "look",
        },
        {
          amount: 5,
          from: "deck",
          onPicked: "banish",
          onRest: "recycle",
          player: "opponent",
          type: "look",
        },
        {
          ignoreEnergyCost: true,
          type: "play-banished-pass",
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
