import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Scuttle Crab — unl-053-219
 *
 * When you play me, draw 1.
 * [Deathknell][>] Choose an opponent. They reveal their hand. You can look at
 * their facedown cards this turn. Gain 1 XP.
 *
 * The parenthetical 0-[Might] reminder and the reveal/peek information effects
 * carry no engine state today; the XP is the part that changes the game.
 */
const abilities: Ability[] = [
  {
    effect: { amount: 1, type: "draw" },
    trigger: { event: "play-self" },
    type: "triggered",
  },
  // rule 808.1: Deathknell is a triggered ability that fires on death for the
  // dying unit's controller, whoever killed it and on whosever turn.
  // rule 127: both halves are information effects, but their lifetimes differ.
  // rule 424.1 / 424.1.a.3 — "They reveal their hand" is a one-shot Reveal:
  // public to every player while the Deathknell resolves, redacted again after
  // (and rule 424.3.a.1 — a card drawn later was never revealed). Only "look at
  // their facedown cards THIS TURN" is a turn-scoped private grant for me.
  {
    effect: {
      effects: [
        { player: "opponent", type: "reveal-zone", zone: "hand" },
        {
          duration: "turn",
          player: "opponent",
          type: "grant-visibility",
          zones: ["facedown"],
        },
        { amount: 1, type: "gain-xp" },
      ],
      type: "sequence",
    },
    keyword: "Deathknell",
    type: "keyword",
  },
];

export const scuttleCrab: UnitCard = {
  abilities,
  cardNumber: 53,
  cardType: "unit",
  domain: "calm",
  energyCost: 2,
  id: createCardId("unl-053-219"),
  might: 0,
  name: "Scuttle Crab",
  rarity: "rare",
  rulesText:
    "(Units with 0 [Might] can conquer and hold.)\nWhen you play me, draw 1.\n[Deathknell][>] Choose an opponent. They reveal their hand. You can look at their facedown cards this turn. Gain 1 XP. (When I die, get the effects.)",
  setId: "UNL",
};
