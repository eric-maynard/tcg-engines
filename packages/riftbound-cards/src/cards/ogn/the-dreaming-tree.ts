import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * The Dreaming Tree — ogn-292-298 (Battlefield)
 *
 * When a player chooses a friendly unit here with a spell for the first time
 * each turn, they draw 1.
 *
 * rule 383.4.b.2 — a Targeting Effect fires when the choosing SPELL is
 * finalized on the chain (`event: "choose"`, `filter: "spell"`), so the draw
 * item sits above the spell and resolves first.
 * rule 190.6.c / 740.1.a — "a player … a friendly unit … they": symmetric.
 * `controller: "actor"` judges "friendly" from the CHOOSER (not from whoever
 * holds the battlefield), `actor: "any"` lets either player fire it, and
 * `controllerFromEvent` hands the item — and its draw — to that same player.
 * rule 359.2.c — "here" is this battlefield only.
 * rule 383.3.e — "for the first time each turn" is tallied per chooser.
 */
const abilities: Ability[] = [
  {
    effect: { amount: 1, type: "draw" },
    trigger: {
      controllerFromEvent: true,
      event: "choose",
      on: {
        actor: "any",
        controller: "actor",
        filter: ["spell"],
        location: "here",
        type: "unit",
      },
      restrictions: [{ type: "first-time-each-turn" }],
    },
    type: "triggered",
  } as unknown as Ability,
];

export const theDreamingTree: BattlefieldCard = {
  abilities,
  cardNumber: 292,
  cardType: "battlefield",
  id: createCardId("ogn-292-298"),
  name: "The Dreaming Tree",
  rarity: "uncommon",
  rulesText:
    "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1.",
  setId: "OGN",
};
