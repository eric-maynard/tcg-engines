import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Katarina, Reckless — unl-023-219
 *
 * When you hide a card, ready me.
 * When you play a card from face down, deal 2 to an enemy unit.
 */
const abilities: Ability[] = [
  {
    type: "triggered",
    trigger: { event: "reveal", on: { controller: "friendly" } },
    // "hide" isn't a distinct engine event yet; approximate using reveal
    // As a placeholder until a "hide-card" event is added.
    effect: { target: "self", type: "ready" },
  },
  {
    effect: {
      amount: 2,
      target: { controller: "enemy", type: "unit" },
      type: "damage",
    },
    trigger: { event: "play-from-hidden", on: { controller: "friendly" } },
    type: "triggered",
  },
];

export const katarinaReckless: UnitCard = {
  abilities,
  cardNumber: 23,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("unl-023-219"),
  isChampion: true,
  might: 5,
  name: "Katarina, Reckless",
  rarity: "rare",
  rulesText:
    "When you hide a card, ready me.\nWhen you play a card from face down, deal 2 to an enemy unit.",
  setId: "UNL",
  tags: ["Katarina"],
};
