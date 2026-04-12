import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Aphelios, Exalted — sfd-049-221
 *
 * When you attach an Equipment to me, choose one that hasn't been chosen
 * this turn:
 *  - Ready 2 runes.
 *  - Channel 1 rune exhausted.
 *  - Buff a friendly unit.
 *
 * Trigger: equipment attached to self
 * Effect: choice with "notChosenThisTurn" modal flag
 */
const abilities: Ability[] = [
  {
    effect: {
      notChosenThisTurn: true,
      options: [
        {
          effect: {
            target: {
              controller: "friendly",
              filter: "exhausted",
              quantity: 2,
              type: "rune",
            },
            type: "ready",
          },
          label: "Ready 2 runes",
        },
        {
          effect: { amount: 1, exhausted: true, type: "channel" },
          label: "Channel 1 rune exhausted",
        },
        {
          effect: {
            target: { controller: "friendly", type: "unit" },
            type: "buff",
          },
          label: "Buff a friendly unit",
        },
      ],
      type: "choice",
    },
    trigger: { event: "attach-equipment", on: "self" },
    type: "triggered",
  },
];

export const apheliosExalted: UnitCard = {
  abilities,
  cardNumber: 49,
  cardType: "unit",
  domain: "calm",
  energyCost: 4,
  id: createCardId("sfd-049-221"),
  isChampion: true,
  might: 4,
  name: "Aphelios, Exalted",
  rarity: "rare",
  rulesText:
    "When you attach an Equipment to me, choose one that hasn't been chosen this turn —Ready 2 runes.Channel 1 rune exhausted.Buff a friendly unit.",
  setId: "SFD",
  tags: ["Aphelios"],
};
