import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Jayce, Man of Progress — sfd-084-221
 *
 * "When you play me, you may kill a friendly gear. If you do, you may play a
 * gear with Energy cost no more than [7] from hand this turn, ignoring its
 * Energy cost. (You must still pay its Power cost.)"
 *
 * The parser only derives the optional kill and drops the "If you do" rider, so
 * the abilities are hand-authored: rule 359.3.e — the rider is a linked
 * instruction, expressed as the `paid-additional-cost` conditional the sequence
 * handler feeds from whether the kill step actually had a gear to kill.
 *
 * rule 356.1.b / 356.4.b — the permission is a single-fire `play-cost`
 * replacement scoped to the controller's next gear this turn; `ignoreEnergyCost`
 * waives that gear's whole Energy cost (never its Power cost) and
 * `maxEnergyCost` bounds which gear qualify. rule 317.2.c — `duration: "next"`
 * entries are swept at end of turn, so an unused permission lapses.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { target: { controller: "friendly", type: "gear" }, type: "kill" },
        {
          condition: { type: "paid-additional-cost" },
          then: {
            duration: "next",
            ignoreEnergyCost: true,
            maxEnergyCost: 7,
            replaces: "play-cost",
            target: { controller: "friendly", type: "gear" },
            type: "replacement",
          },
          type: "conditional",
        },
      ],
      type: "sequence",
    } as unknown as Effect,
    optional: true,
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const jayceManOfProgress: UnitCard = {
  abilities,
  cardNumber: 84,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("sfd-084-221"),
  isChampion: true,
  might: 4,
  name: "Jayce, Man of Progress",
  rarity: "rare",
  rulesText:
    "When you play me, you may kill a friendly gear. If you do, you may play a gear with Energy cost no more than [7] from hand this turn, ignoring its Energy cost. (You must still pay its Power cost.)",
  setId: "SFD",
  tags: ["Jayce"],
};
