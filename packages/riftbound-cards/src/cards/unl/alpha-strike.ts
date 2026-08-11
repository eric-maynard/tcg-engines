import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Alpha Strike — unl-192-219 (Action spell)
 *
 * "[Action] Choose a friendly unit. It deals damage equal to its Might
 *  split among enemy units at battlefields. Then for each unit this kills,
 *  do this: Gain 1 XP."
 *
 * Modeled as a sequence:
 *  1. `damage` effect — amount equal to the chosen friendly unit's Might,
 *     dealt split (`split: true`) across enemy units at battlefields.
 *     The engine lets the active player distribute the damage amongst
 *     legal targets.
 *  2. `for-each` over the units THIS spell's damage killed, granting 1 XP
 *     each. rule 359.3.f.2: those units have already left the board when the
 *     reflexive clause resolves, so the scope is `filter: "killed-by-this"` —
 *     the kill ledger the damage handler records as it deals lethal damage —
 *     not a board query for still-damaged units.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        {
          amount: {
            might: { controller: "friendly", type: "unit" },
          },
          split: true,
          target: {
            controller: "enemy",
            location: "battlefield",
            quantity: "all",
            type: "unit",
          },
          type: "damage",
        },
        {
          // rule 387.1 / 388.1 — "do this:" makes the rider a Reflexive Trigger:
          // one Chain Item per kill, not an inline gain during this resolution.
          effect: { effect: { amount: 1, type: "gain-xp" }, type: "reflexive" },
          target: {
            filter: "killed-by-this",
            type: "unit",
          },
          type: "for-each",
        },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const alphaStrike: SpellCard = {
  abilities,
  cardNumber: 192,
  cardType: "spell",
  domain: ["calm", "body"],
  energyCost: 3,
  id: createCardId("unl-192-219"),
  // rule 103.2.d: Signature card — legal only in a Master Yi Champion Legend
  // deck, and it shares the 3-card Signature cap with every other "Master Yi"
  // Signature card regardless of name.
  isSignature: true,
  name: "Alpha Strike",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nChoose a friendly unit. It deals damage equal to its Might split among enemy units at battlefields. Then for each unit this kills, do this: Gain 1 XP.",
  setId: "UNL",
  tags: ["Master Yi"],
  timing: "action",
};
