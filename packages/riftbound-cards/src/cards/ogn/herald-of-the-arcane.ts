import type { Ability } from "@tcg/riftbound-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";
import { TOKEN_PRESETS } from "@tcg/riftbound-types";

/**
 * Herald of the Arcane — ogn-265-298 (Legend, Viktor)
 *
 * [1], [Exhaust]: Play a 1 [Might] Recruit unit token.
 *
 * Rules 174.8 / 381: legends carry activated abilities that must be offered
 * as `activateAbility` in Open State on the controller's turn — the engine
 * only reads the `abilities` array, never `rulesText`, so the ability must
 * be declared here.
 */
const abilities: Ability[] = [
  {
    cost: { energy: 1, exhaust: true },
    effect: {
      token: TOKEN_PRESETS.RECRUIT,
      type: "create-token",
    },
    type: "activated",
  },
];

export const heraldOfTheArcane: LegendCard = {
  abilities,
  cardNumber: 265,
  cardType: "legend",
  championTag: "Viktor",
  domain: ["mind", "order"],
  id: createCardId("ogn-265-298"),
  name: "Herald of the Arcane",
  rarity: "rare",
  rulesText: "[1], [Exhaust]: Play a 1 [Might] Recruit unit token.",
  setId: "OGN",
};
