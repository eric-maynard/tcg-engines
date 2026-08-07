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
 * rule 356.1 — the REVEAL is unconditional: only the pick costs 2 XP. So the
 * trigger itself is not optional (no opt-in prompt gating the reveal); the
 * reveal-and-pick prompt carries `pickCost`, which the engine charges when a
 * card is actually picked. A prompter without 2 XP may only decline.
 *
 * rule 355.13 — "You may … choose a card from their hand": the pick is
 * optional, so the prompt is declinable after seeing the revealed hand, and
 * declining skips the discard AND the follow-up draw.
 */
const abilities: Ability[] = [
  {
    effect: {
      onPicked: "discard",
      optional: true,
      pickCost: { xp: 2 },
      target: { type: "player", which: "opponent" },
      // rule 359.3.e — "If you do, they discard that card AND draw 1": the
      // draw is part of the paid-for pick, so it rides on the prompt and never
      // runs when the pick is declined. `player: "opponent"` — THEY draw.
      then: { amount: 1, player: "opponent", type: "draw" },
      type: "reveal-hand",
    },
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
