import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * rule 560 / 422.1.a — the XP is an OPTIONAL additional cost; paying it exempts
 * its payer from the mass kill, so the play-self trigger branches on whether the
 * cost was paid. `player: "each"` / `"each-other"` with a `friendly` target makes
 * every player choose among the units THEY control.
 */
const abilities: Ability[] = [
  {
    effect: { additionalCost: { xp: 3 }, optional: true, type: "additional-cost-option" },
    type: "static",
  },
  {
    effect: {
      condition: { type: "paid-additional-cost" },
      else: { player: "each", target: { controller: "friendly", type: "unit" }, type: "kill" },
      // Paid: the controller is exempt, so only the other players choose — each
      // among the units the CASTER doesn't control, i.e. their own.
      then: {
        chooser: "each-other-player",
        chooserTarget: { controller: "enemy", type: "unit" },
        target: { controller: "enemy", type: "unit" },
        type: "kill",
      },
      type: "conditional",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
] as unknown as Ability[];

export const safetyInspector: UnitCard = {
  abilities,
  cardNumber: 164,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("unl-164-219"),
  might: 3,
  name: "Safety Inspector",
  rarity: "uncommon",
  rulesText:
    "You may spend 3 XP as an additional cost to play me.\nWhen you play me, each player must kill one of their units. If you paid my additional cost, you don't kill a unit this way.",
  setId: "UNL",
};
