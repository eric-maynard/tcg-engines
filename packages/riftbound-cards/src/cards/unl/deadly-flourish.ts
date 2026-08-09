import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Deadly Flourish — unl-073-219
 *
 * "Deal 3 to an enemy unit. When it dies this turn, play a Gold gear token
 *  exhausted."
 *
 * rule 390.2 — the second sentence installs a turn-scoped delayed trigger on
 * the SAME unit the damage chose, so both steps share one target descriptor.
 * rule 392 — the delayed ability belongs to the caster: the Gold token is
 * played by (and controlled by) the player who cast the spell, not the
 * controller of the unit that died.
 */
const TARGET = { controller: "enemy", type: "unit" } as const;

const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { amount: 3, target: TARGET, type: "damage" },
        {
          duration: "turn",
          effect: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
          target: TARGET,
          trigger: { event: "die", on: "self" },
          type: "delayed-trigger",
        },
      ],
      type: "sequence",
    },
    timing: "standard",
    type: "spell",
  },
] as unknown as Ability[];

export const deadlyFlourish: SpellCard = {
  abilities,
  cardNumber: 73,
  cardType: "spell",
  domain: "mind",
  energyCost: 4,
  id: createCardId("unl-073-219"),
  name: "Deadly Flourish",
  rarity: "uncommon",
  rulesText:
    "Deal 3 to an enemy unit. When it dies this turn, play a Gold gear token exhausted. (It has \"[Reaction][>] Kill this, [Exhaust]: [Add] [rainbow].\")",
  setId: "UNL",
  timing: "standard",
};
