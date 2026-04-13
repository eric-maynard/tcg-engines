import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Insightful Investigator — unl-135-219
 *
 * "When you play me, choose an opponent. They reveal their hand. You may
 *  pay 2 XP to choose a card from their hand. If you do, they discard that
 *  card and draw 1."
 *
 * Modeled as a `play-self` triggered ability that opens a `reveal-hand`
 * pending choice on the opponent with `onPicked: "discard"`. The follow-up
 * draw-1 is gated behind paying 2 XP via a conditional sequence. The
 * engine's `pay-cost` condition takes care of charging the XP only when
 * the active player opts to pay.
 *
 * FIXME: the XP cost should gate the *ability* to pick a card at all; the
 * closest legal shape is to gate the entire reveal-hand+draw sequence
 * behind the XP cost. Players who don't want to pay simply skip the
 * optional trigger.
 */
const abilities: Ability[] = [
  {
    effect: {
      condition: { cost: { xp: 2 }, type: "pay-cost" },
      then: {
        effects: [
          {
            onPicked: "discard",
            target: { type: "player", which: "opponent" },
            type: "reveal-hand",
          },
          { amount: 1, type: "draw" },
        ],
        type: "sequence",
      },
      type: "conditional",
    },
    optional: true,
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const insightfulInvestigator: UnitCard = {
  abilities,
  cardNumber: 135,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("unl-135-219"),
  might: 3,
  name: "Insightful Investigator",
  rarity: "uncommon",
  rulesText:
    "When you play me, choose an opponent. They reveal their hand. You may pay 2 XP to choose a card from their hand. If you do, they discard that card and draw 1.",
  setId: "UNL",
};
