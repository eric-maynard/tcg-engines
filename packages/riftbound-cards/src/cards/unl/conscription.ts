import type { Ability, Effect } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule-id: unl-140-219 — Rule 355.8 / 560: the parser only derives the
// optional-additional-cost static and drops the "Choose an enemy unit… Take
// control of it, exhaust it, and recall it" sentence, so no `spell` ability
// existed and the card resolved as a no-op. Hand-author the spell as a
// sequence whose three steps share one caster-chosen enemy unit at a
// battlefield (bound at play time as targets[0] via the sequence lead target,
// so every step acts on the same unit even after control changes).
// rule 356.2.b — "If you paid the additional cost, choose any enemy unit at a
// battlefield instead": `paidTarget` is the descriptor that replaces the
// printed one on a play that paid the 5 XP, read by play-time enumeration,
// target validation and the chain item's stored effect.
const conscriptTarget = {
  controller: "enemy",
  filter: { might: { lte: 3 } },
  location: "battlefield",
  type: "unit",
} as const;

const paidTarget = {
  controller: "enemy",
  location: "battlefield",
  type: "unit",
} as const;

const abilities: Ability[] = [
  {
    effect: {
      additionalCost: { xp: 5 },
      optional: true,
      type: "additional-cost-option",
    } as unknown as Effect,
    type: "static",
  } as unknown as Ability,
  {
    effect: {
      effects: [
        { duration: "permanent", target: conscriptTarget, type: "take-control" },
        { target: conscriptTarget, type: "exhaust" },
        { target: conscriptTarget, type: "recall" },
      ],
      paidTarget,
      type: "sequence",
    } as unknown as Effect,
    timing: "action",
    type: "spell",
  },
];

export const conscription: SpellCard = {
  abilities,
  cardNumber: 140,
  cardType: "spell",
  domain: "chaos",
  energyCost: 5,
  id: createCardId("unl-140-219"),
  name: "Conscription",
  rarity: "rare",
  rulesText:
    "You may spend 5 XP as an additional cost to play this.\nChoose an enemy unit at a battlefield with 3 [Might] or less. If you paid the additional cost, choose any enemy unit at a battlefield instead. Take control of it, exhaust it, and recall it.",
  setId: "UNL",
  timing: "action",
};
