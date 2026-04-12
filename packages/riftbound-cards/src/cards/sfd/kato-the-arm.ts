import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Kato the Arm — sfd-112-221
 *
 * [Deflect]
 * When I move to a battlefield, give another friendly unit my keywords
 * and +[Might] equal to my Might this turn.
 *
 * Two abilities:
 *  1. Deflect 1 keyword
 *  2. Triggered on move-to-battlefield: grant self's keywords and might
 *     to another friendly unit for the turn
 *
 * FIXME: "Give my keywords" is approximated as a grant-keywords effect
 * with a `$self` placeholder the engine should interpret at runtime.
 */
const abilities: Ability[] = [
  { keyword: "Deflect", type: "keyword", value: 1 },
  {
    effect: {
      effects: [
        {
          amount: { might: "self" },
          duration: "turn",
          target: {
            controller: "friendly",
            excludeSelf: true,
            type: "unit",
          },
          type: "modify-might",
        },
        {
          duration: "turn",
          keywords: ["$self-keywords"],
          target: {
            controller: "friendly",
            excludeSelf: true,
            type: "unit",
          },
          type: "grant-keywords",
        },
      ],
      type: "sequence",
    },
    trigger: { event: "move-to-battlefield", on: "self" },
    type: "triggered",
  },
];

export const katoTheArm: UnitCard = {
  abilities,
  cardNumber: 112,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("sfd-112-221"),
  might: 3,
  name: "Kato the Arm",
  rarity: "rare",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\nWhen I move to a battlefield, give another friendly unit my keywords and +[Might] equal to my Might this turn.",
  setId: "SFD",
};
