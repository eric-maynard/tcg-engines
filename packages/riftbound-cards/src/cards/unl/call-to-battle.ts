import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * "Move a unit you control to a battlefield you control. …"
 *
 * rule 355.4 / 355.4.a — the caster CHOOSES the destination, so it must be a
 * location other than the unit's current one; a unit with no such destination
 * cannot be chosen at all. That is the `{ battlefield: "controlled" }`
 * destination shape (a real destination choice restricted to controlled
 * battlefields), not the parser's bare `to: "battlefield"` (not a zone id).
 */
const abilities: Ability[] = [
  {
    effect: {
      target: { controller: "friendly", type: "unit" },
      // rule 387 / 355.10 — "Then, choose an opponent. They move a unit they
      // control to the same battlefield": the follow-up is anchored at the
      // first move's destination and is answered by the opponent.
      then: {
        chosenBy: "opponent",
        target: { controller: "enemy", type: "unit" },
        to: "target-battlefield",
        type: "move",
      },
      to: { battlefield: "controlled" },
      type: "move",
    },
    timing: "action",
    type: "spell",
  },
];

export const callToBattle: SpellCard = {
  abilities,
  cardNumber: 101,
  cardType: "spell",
  domain: "body",
  energyCost: 3,
  id: createCardId("unl-101-219"),
  name: "Call to Battle",
  rarity: "uncommon",
  rulesText:
    "Move a unit you control to a battlefield you control. Then, choose an opponent. They move a unit they control to the same battlefield.",
  setId: "UNL",
  timing: "action",
};
