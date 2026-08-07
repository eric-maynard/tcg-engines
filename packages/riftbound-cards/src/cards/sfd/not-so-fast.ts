import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * rule 355.9.b — "Counter an enemy spell or ability that chooses a friendly
 * unit or gear": both qualifiers are relative to Not So Fast's controller, and
 * "spell or ability" admits triggered/activated abilities on the chain too.
 */
const abilities: Ability[] = [
  {
    effect: {
      target: {
        controller: "enemy",
        filter: { chooses: { controller: "friendly", types: ["unit", "gear"] } },
        type: "spell-or-ability",
      },
      type: "counter",
    },
    timing: "reaction",
    type: "spell",
  },
] as unknown as Ability[];

export const notSoFast: SpellCard = {
  abilities,
  cardNumber: 45,
  cardType: "spell",
  domain: "calm",
  energyCost: 2,
  id: createCardId("sfd-045-221"),
  name: "Not So Fast",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nCounter an enemy spell or ability that chooses a friendly unit or gear.",
  setId: "SFD",
  timing: "reaction",
};
