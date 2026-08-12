import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * The List — unl-138-219
 *
 * "As you play this, name a tag." is unique to this card, so the naming step is
 * declared explicitly; the parser handles only the [Exhaust] line below.
 */
const abilities: Ability[] = [
  {
    // rule 762: the tag is named as the card is played and recorded on it; the
    // activated ability's `tag: "named"` filter reads it back.
    // rule 135.2.b.3 / 358: "As you play this" happens WHILE the Gear is being
    // played, so `asYouPlay` keeps the naming off the Chain — no Reaction window.
    effect: { asYouPlay: true, cardType: "tag", type: "name-card" },
    trigger: { event: "play-self" },
    type: "triggered",
  },
  {
    cost: { exhaust: true },
    effect: {
      amount: -2,
      duration: "turn",
      target: { filter: { tag: "named" }, type: "unit" },
      type: "modify-might",
    },
    type: "activated",
  },
];

export const theList: GearCard = {
  abilities,
  cardNumber: 138,
  cardType: "gear",
  domain: "chaos",
  energyCost: 1,
  id: createCardId("unl-138-219"),
  name: "The List",
  rarity: "uncommon",
  rulesText:
    "As you play this, name a tag. (For example, Miss Fortune, Demacia, and Poro are tags.)\n[Exhaust]: Give a unit with the named tag -2 [Might] this turn.",
  setId: "UNL",
};
