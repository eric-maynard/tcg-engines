import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Card Sharp — sfd-081-221
 *
 * "When you play me, you and each opponent may play a Gold gear token
 *  exhausted. For each opponent who did, you play a Gold gear token
 *  exhausted."
 *
 * rule 355.13 / 115: three independent "may"s. The controller's own token is
 * the ability's opt-in (`optional`); each opponent then answers for themselves
 * and every acceptance also plays a Gold for the controller.
 */
const abilities: Ability[] = [
  {
    effect: {
      ready: false,
      then: {
        bonus: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
        effect: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
        type: "each-opponent-may",
      },
      token: { name: "Gold", type: "gear" },
      type: "create-token",
    },
    optional: true,
    trigger: { event: "play-self" },
    type: "triggered",
  },
] as unknown as Ability[];

export const cardSharp: UnitCard = {
  abilities,
  cardNumber: 81,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-081-221"),
  might: 3,
  name: "Card Sharp",
  rarity: "rare",
  rulesText:
    "When you play me, you and each opponent may play a Gold gear token exhausted. For each opponent who did, you play a Gold gear token exhausted.",
  setId: "SFD",
};
