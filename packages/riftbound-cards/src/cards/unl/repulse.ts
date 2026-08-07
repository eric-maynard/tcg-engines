import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * rule 355.9.b — "Choose a friendly unit at a battlefield. Counter an enemy
 * spell or ability that chooses it and no other friendly unit": both
 * qualifiers are read relative to Repulse's controller, "spell or ability"
 * admits chain abilities, the protected unit must be AT A BATTLEFIELD
 * (rule 355.8 — otherwise the first choice does not exist), and
 * rule 359.3.e.9.a makes an item that chose a SECOND friendly unit illegal.
 */
const abilities: Ability[] = [
  {
    effect: {
      target: {
        controller: "enemy",
        filter: {
          chooses: {
            controller: "friendly",
            exclusive: true,
            location: "battlefield",
            types: ["unit"],
          },
        },
        type: "spell-or-ability",
      },
      type: "counter",
    },
    timing: "reaction",
    type: "spell",
  },
] as unknown as Ability[];

export const repulse: SpellCard = {
  abilities,
  cardNumber: 106,
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  id: createCardId("unl-106-219"),
  name: "Repulse",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a friendly unit at a battlefield. Counter an enemy spell or ability that chooses it and no other friendly unit.",
  setId: "UNL",
  timing: "reaction",
};
