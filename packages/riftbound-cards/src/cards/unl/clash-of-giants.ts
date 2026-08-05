import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Clash of Giants — unl-110-219 (Action spell)
 *
 * "Choose two units. They deal damage equal to their Mights to each other."
 *
 * Modelled as a `fight` effect so the engine registers a real spell effect
 * on the chain (rule 355.8) instead of `effect: undefined`, which was
 * skipping target selection entirely.
 */
// rule-id: unl-110-219-missing-abilities
// rule-id: unl-110-219-fight-targets-any — rules text imposes no controller restriction; both targets may be any unit
const abilities: Ability[] = [
  {
    effect: {
      attacker: { type: "unit" },
      defender: { type: "unit" },
      type: "fight",
    },
    timing: "action",
    type: "spell",
  },
];

export const clashOfGiants: SpellCard = {
  abilities,
  cardNumber: 110,
  cardType: "spell",
  domain: "body",
  energyCost: 6,
  id: createCardId("unl-110-219"),
  name: "Clash of Giants",
  rarity: "rare",
  rulesText: "Choose two units. They deal damage equal to their Mights to each other.",
  setId: "UNL",
  timing: "action",
};
