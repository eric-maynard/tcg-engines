import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 359.3.e.14.a — the play restriction is LINKED to the counter: when the
// spell is gone before Lullaby resolves, nothing is countered and the
// restriction is ignored too (`restrictsSpellPlays` reads the spell the
// counter actually hit).
const abilities: Ability[] = [
  {
    effect: {
      restrictsSpellPlays: true,
      type: "counter",
    },
    timing: "reaction",
    type: "spell",
  },
] as unknown as Ability[];

export const liltingLullaby: SpellCard = {
  abilities,
  cardNumber: 190,
  cardType: "spell",
  domain: ["calm", "mind"],
  energyCost: 2,
  id: createCardId("unl-190-219"),
  name: "Lilting Lullaby",
  rarity: "epic",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nCounter a spell. Its controller can't play spells this turn.",
  setId: "UNL",
  timing: "reaction",
};
