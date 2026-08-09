import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Tideturner — ogn-199-298
 *
 * [Hidden]
 * When you play me, you may choose a unit you control at another location.
 * Move me to its location and it to my original location.
 *
 * The chosen partner and I trade locations (`move` with `swap`). Rule 811.1.d.2:
 * played from Hidden the "another location" clause can never be met at my own
 * battlefield, so the Hidden targeting restriction does not apply here.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      partner: { controller: "friendly", type: "unit" },
      swap: true,
      type: "move",
    },
    optional: true,
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const tideturner: UnitCard = {
  abilities,
  cardNumber: 199,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogn-199-298"),
  might: 2,
  name: "Tideturner",
  rarity: "rare",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [0].)\nWhen you play me, you may choose a unit you control at another location. Move me to its location and it to my original location.",
  setId: "OGN",
};
