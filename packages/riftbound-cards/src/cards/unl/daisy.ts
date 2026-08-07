import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Daisy! — unl-196-219
 *
 * rule-id: unl-196-219 — the parser only recognises "I enter ready"; the
 * tag-scaled self discount (rule 356.4) and the conditional attack trigger
 * (rule 383.4.e.2.b → 423 Stun) are spelled out here. Both read the same
 * DISTINCT-tag count as Friendship (unl-046-219): a listed tag counts once
 * however many of your units carry it, and enemy units never count.
 */
const TAGS = ["Bird", "Cat", "Dog", "Poro"] as const;

const abilities: Ability[] = [
  { effect: { target: "self", type: "enter-ready" }, type: "static" },
  {
    effect: {
      by: ":rb_energy_1:",
      distinctTags: [...TAGS],
      scope: "for each of the following tags among your units — Bird, Cat, Dog, and Poro",
      target: "self",
      type: "cost-reduction",
    },
    type: "static",
  },
  {
    condition: { amount: TAGS.length, tags: [...TAGS], type: "distinct-tags-at-least" },
    effect: {
      target: { controller: "enemy", location: "here", type: "unit" },
      type: "stun",
    },
    trigger: { event: "attack", on: "self" },
    type: "triggered",
  },
] as unknown as Ability[];

export const daisy: UnitCard = {
  abilities,
  cardNumber: 196,
  cardType: "unit",
  domain: ["calm", "order"],
  energyCost: 9,
  id: createCardId("unl-196-219"),
  might: 8,
  name: "Daisy!",
  rarity: "epic",
  rulesText:
    "I enter ready.\nReduce my cost by [1] for each of the following tags among your units — Bird, Cat, Dog, and Poro.\nWhen I attack while your units have all 4 tags, [Stun] an enemy unit here. (It doesn't deal combat damage this turn.)",
  setId: "UNL",
};
