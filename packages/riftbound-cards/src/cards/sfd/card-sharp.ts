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
 * rule 355.13 / 115: three independent "may"s. rule 383.3.a.3 — the "may" is
 * distributed over "you AND each opponent", so it is a per-player optional
 * instruction decided as the ability resolves, NOT the whole trigger's 383.3.a
 * opt-in: the controller is simply the first prompt of the same loop
 * (`includeSelf`), and declining it must still leave every opponent asked.
 * Only an OPPONENT's acceptance pays the controller a bonus Gold.
 */
const abilities: Ability[] = [
  {
    effect: {
      bonus: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
      effect: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
      includeSelf: true,
      type: "each-opponent-may",
    },
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
