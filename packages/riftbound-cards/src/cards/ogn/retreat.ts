import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// "Its owner channels 1 rune exhausted" — the channel is a second, unlinked
// clause the parser has no pattern for. rule 127.1: the channeling player is
// the returned unit's OWNER, which is not the caster when control changed
// hands, so the step names `player: "target-owner"`.
const abilities: Ability[] = [
  {
    effect: {
      effects: [
        { target: { controller: "friendly", type: "unit" }, type: "return-to-hand" },
        { amount: 1, exhausted: true, player: "target-owner", type: "channel" },
      ],
      type: "sequence",
    },
    timing: "reaction",
    type: "spell",
  } as Ability,
];

export const retreat: SpellCard = {
  abilities,
  cardNumber: 104,
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  id: createCardId("ogn-104-298"),
  name: "Retreat",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nReturn a friendly unit to its owner's hand. Its owner channels 1 rune exhausted.",
  setId: "OGN",
  timing: "reaction",
};
