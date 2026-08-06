import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Vilemaw — unl-060-219
 *
 * [Ambush]
 * Enemy units here with less Might than me don't deal combat damage.
 * When I hold, draw 1.
 *
 * rule-id: unl-060-219 — the combat-damage prevention is a self-granted
 * marker keyword the combat resolver reads (PreventWeakerEnemyCombatDamage).
 */
const abilities: Ability[] = [
  { keyword: "Ambush", type: "keyword" },
  {
    effect: {
      keyword: "PreventWeakerEnemyCombatDamage",
      target: "self",
      type: "grant-keyword",
    },
    type: "static",
  },
  {
    effect: { amount: 1, type: "draw" },
    trigger: { event: "hold", on: "self" },
    type: "triggered",
  },
];

export const vilemaw: UnitCard = {
  abilities,
  cardNumber: 60,
  cardType: "unit",
  domain: "calm",
  energyCost: 8,
  id: createCardId("unl-060-219"),
  might: 8,
  name: "Vilemaw",
  rarity: "epic",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nEnemy units here with less Might than me don't deal combat damage.\nWhen I hold, draw 1.",
  setId: "UNL",
};
