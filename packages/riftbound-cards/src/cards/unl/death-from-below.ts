import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Death from Below — unl-186-219
 *
 * Kill a unit at a battlefield. Then, if it had 3 [Might] or less, you may
 * play this from your trash for [rainbow].
 *
 * The `kill` step snapshots the unit's last-known Might; `killed-might` reads
 * it, and the optional self-`play` re-enters this spell from the trash for the
 * [rainbow] opt-in cost once it has finished resolving (rule 354.3).
 */
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { target: { location: "battlefield", type: "unit" }, type: "kill" },
        {
          condition: { comparison: { lte: 3 }, type: "killed-might" },
          then: {
            cost: { power: ["rainbow"] },
            from: "trash",
            optional: true,
            target: "self",
            type: "play",
          },
          type: "conditional",
        },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  } as unknown as Ability,
];

export const deathFromBelow: SpellCard = {
  abilities,
  cardNumber: 186,
  cardType: "spell",
  domain: ["fury", "chaos"],
  energyCost: 4,
  id: createCardId("unl-186-219"),
  name: "Death from Below",
  rarity: "epic",
  rulesText:
    "Kill a unit at a battlefield. Then, if it had 3 [Might] or less, you may play this from your trash for [rainbow].",
  setId: "UNL",
  timing: "action",
};
