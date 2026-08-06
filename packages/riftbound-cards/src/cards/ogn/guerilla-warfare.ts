import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * rule 811.5 — having [Hidden] is a characteristic checkable in any zone, so
 * the trash pool is restricted to cards that carry the keyword. The parser
 * drops the "with [Hidden]" qualifier, so the target is spelled out here.
 */
const abilities: Ability[] = [
  {
    effect: {
      target: {
        filter: { keyword: "Hidden" },
        location: "trash",
        quantity: { upTo: 2 },
        type: "card",
      },
      type: "return-to-hand",
    },
    timing: "action",
    type: "spell",
  },
] as unknown as Ability[];

export const guerillaWarfare: SpellCard = {
  abilities,
  cardNumber: 264,
  cardType: "spell",
  domain: ["mind", "chaos"],
  energyCost: 2,
  id: createCardId("ogn-264-298"),
  name: "Guerilla Warfare",
  rarity: "epic",
  rulesText:
    "Return up to two cards with [Hidden] from your trash to your hand. You can hide cards ignoring costs this turn.",
  setId: "OGN",
  timing: "action",
};
