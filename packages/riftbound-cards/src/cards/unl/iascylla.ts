import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Iascylla — unl-050-219
 *
 * "When I hold, at the start of your next Main Phase, you may move an enemy
 *  unit to this battlefield."
 *
 * rule 390.2 / 316.4: the hold trigger resolves in the Beginning Phase but only
 * parks the move; the "you may" choice belongs to the start of the controller's
 * next Main Phase, after channel + draw.
 */
const abilities: Ability[] = [
  {
    effect: {
      duration: "turn",
      // rule 390.2 / 316.4 — the hold trigger only INSTALLS the move; the
      // "you may" and its target belong to the start of the next Main Phase.
      effect: {
        target: { controller: "enemy", type: "unit" },
        to: "here",
        type: "move",
      },
      optional: true,
      // rule 359.3.f.3.b — installed on Iascylla so "this battlefield" still
      // resolves to the battlefield she held.
      target: "self",
      trigger: { event: "main-phase", on: "controller" },
      type: "delayed-trigger",
    } as unknown as Ability["effect"],
    trigger: { event: "hold", on: "self" },
    type: "triggered",
  },
];

export const iascylla: UnitCard = {
  abilities,
  cardNumber: 50,
  cardType: "unit",
  domain: "calm",
  energyCost: 7,
  id: createCardId("unl-050-219"),
  might: 6,
  name: "Iascylla",
  rarity: "rare",
  rulesText:
    "When I hold, at the start of your next Main Phase, you may move an enemy unit to this battlefield.",
  setId: "UNL",
};
