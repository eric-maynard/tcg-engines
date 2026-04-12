import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Lotus Trap — unl-013-219 (Reaction spell)
 *
 * [Hidden]
 * Choose a unit. Double all damage that would be dealt to it this turn.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      duration: "turn",
      keyword: "DoubleIncomingDamage",
      target: { type: "unit" },
      type: "grant-keyword",
    },
    timing: "reaction",
    type: "spell",
  },
];

export const lotusTrap: SpellCard = {
  abilities,
  cardNumber: 13,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("unl-013-219"),
  name: "Lotus Trap",
  rarity: "uncommon",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a unit. Double all damage that would be dealt to it this turn.",
  setId: "UNL",
  timing: "action",
};
