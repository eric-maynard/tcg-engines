import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Three clauses that all hang off the ONE unit the caster moves, so they ride
 * on the move's destination prompt (`then`) rather than on sibling sequence
 * steps: the moved unit is only known once the destination is answered.
 * rule 434: the attach pays no Equip cost and is optional (355.13).
 * rule 364.3: clause 3 installs a turn-scoped triggered ability on that unit.
 */
const abilities: Ability[] = [
  {
    effect: {
      target: { controller: "friendly", type: "unit" },
      then: {
        effects: [
          {
            equipment: { controller: "friendly", type: "equipment" },
            holder: "bound",
            optional: true,
            type: "attach",
          },
          {
            duration: "turn",
            effect: { target: "self", to: "base", type: "move" },
            optional: true,
            // rule 469.1 — "When I conquer" has no "after an attack" rider:
            // taking an EMPTY battlefield is a conquer too, so the offer must
            // appear for a unit that simply walked onto an open battlefield.
            trigger: { event: "conquer", on: "self" },
            type: "delayed-trigger",
          },
        ],
        type: "sequence",
      },
      to: "choose",
      type: "move",
    },
    timing: "action",
    type: "spell",
  },
] as unknown as Ability[];

export const relentlessPursuit: SpellCard = {
  abilities,
  cardNumber: 184,
  cardType: "spell",
  domain: ["fury", "body"],
  energyCost: 2,
  id: createCardId("sfd-184-221"),
  name: "Relentless Pursuit",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nMove a friendly unit. You may attach an Equipment with the same controller to it. This turn, that unit has &quot;When I conquer, you may move me to my base.&quot;",
  setId: "SFD",
  timing: "action",
};
