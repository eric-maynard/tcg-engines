import type { Ability } from "@tcg/riftbound-types";
import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Daughter of the Void — ogn-247-298 (Legend, Kai'Sa)
 *
 * [Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells.
 * (Abilities that add resources can't be reacted to.)
 *
 * Activated ability: exhaust self to add 1 rainbow power to the rune pool.
 * Timing: reaction (can be used on opponent's turn / during chain).
 *
 * rule 429.4: "Use only to play spells" earmarks the added [rainbow] — it may pay only
 * for spells, never a unit, gear, or an activated ability.
 */
const abilities: Ability[] = [
  {
    cost: { exhaust: true },
    // rule 429.4: "Use only to play spells" — same earmark the parser emits for Lux, Crownguard.
    effect: { power: ["rainbow"], restriction: "spell", type: "add-resource" },
    timing: "reaction",
    type: "activated",
  },
];

export const daughterOfTheVoid: LegendCard = {
  abilities,
  cardNumber: 247,
  cardType: "legend",
  championTag: "Kai'Sa",
  domain: ["fury", "mind"],
  id: createCardId("ogn-247-298"),
  name: "Daughter of the Void",
  rarity: "rare",
  rulesText:
    "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells. (Abilities that add resources can't be reacted to.)",
  setId: "OGN",
};
