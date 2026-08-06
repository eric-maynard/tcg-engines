import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Noxian Guillotine — ogn-254-298 (Action spell)
 *
 * Choose a unit. Kill it the next time it takes damage this turn.
 * [Legion] — Kill it now instead.
 */
// rule-id: ogn-254-298 — the parser drops the trailing [Legion] clause, so
// hand-author a rule-724 conditional: kill now if Legion is satisfied,
// otherwise install the "kill on next damage" replacement.
const abilities: Ability[] = [
  {
    effect: {
      condition: { type: "legion" },
      else: {
        duration: "next",
        replacement: { target: { type: "unit" }, type: "kill" },
        replaces: "take-damage",
        type: "replacement",
      },
      target: { type: "unit" },
      then: { target: { type: "unit" }, type: "kill" },
      type: "conditional",
    },
    timing: "action",
    type: "spell",
  },
] as unknown as Ability[];

export const noxianGuillotine: SpellCard = {
  abilities,
  cardNumber: 254,
  cardType: "spell",
  domain: ["fury", "order"],
  energyCost: 4,
  id: createCardId("ogn-254-298"),
  name: "Noxian Guillotine",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nChoose a unit. Kill it the next time it takes damage this turn.\n[Legion] — Kill it now instead. (Get the effect if you've played another card this turn.)",
  setId: "OGN",
  timing: "action",
};
