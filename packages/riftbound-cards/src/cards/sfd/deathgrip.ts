import type { Ability } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * "Kill a friendly unit. If you do, give +[Might] equal to its Might to another
 * friendly unit this turn. Draw 1."
 *
 * rule 359.3.e.14.b — this card is the rules' own "If you do" example: the
 * linked bonus references the kill ACTION, so a replaced death (Zhonya's
 * Hourglass) gives nothing. rule 359.3.f.2 — "its Might" is the victim's Might
 * as it died, buffs included. rule 359.3.e.5 — "Draw 1" is unlinked and always
 * happens. rule 355.10 — the recipient is chosen as the spell resolves, so it
 * owns no play-time target slot; only the victim is declared at play time.
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { target: { controller: "friendly", type: "unit" }, type: "kill" },
        {
          condition: { type: "killed-a-unit" },
          then: {
            amount: { might: "killed" },
            chooseTarget: true,
            duration: "turn",
            target: {
              controller: "friendly",
              excludeBound: true,
              excludeSelf: true,
              type: "unit",
            },
            type: "modify-might",
          },
          type: "conditional",
        },
        { amount: 1, type: "draw" },
      ],
      type: "sequence",
    } as unknown as Effect,
    timing: "reaction",
    type: "spell",
  },
];

export const deathgrip: SpellCard = {
  abilities,
  cardNumber: 163,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("sfd-163-221"),
  name: "Deathgrip",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nKill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this turn.\nDraw 1.",
  setId: "SFD",
  timing: "reaction",
};
