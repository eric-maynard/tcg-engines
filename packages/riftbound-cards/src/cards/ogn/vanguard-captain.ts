import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";
import { TOKEN_PRESETS } from "@tcg/riftbound-types";

/**
 * Vanguard Captain — ogn-218-298
 *
 * [Legion] — When you play me, play two 1 [Might] Recruit unit tokens here.
 *
 * Rule-id ogn-218-298: the parser emits Legion as a bare keyword ability,
 * which the trigger runner never fires. Hand-author it as a play-self
 * triggered ability gated by the rule-724 `legion` condition.
 */
const abilities: Ability[] = [
  {
    condition: { type: "legion" },
    effect: {
      amount: 2,
      location: "here",
      token: TOKEN_PRESETS.RECRUIT,
      type: "create-token",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
];

export const vanguardCaptain: UnitCard = {
  abilities,
  cardNumber: 218,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("ogn-218-298"),
  might: 3,
  name: "Vanguard Captain",
  rarity: "common",
  rulesText:
    "[Legion] — When you play me, play two 1 [Might] Recruit unit tokens here. (Get the effect if you've played another card this turn.)",
  setId: "OGN",
};
