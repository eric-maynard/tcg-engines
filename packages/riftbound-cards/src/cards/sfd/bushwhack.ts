import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Bushwhack — sfd-004-221
 *
 * "[Hidden] Friendly units enter ready this turn. Play a Gold gear token exhausted."
 *
 * rule 143.4 / 517.2 — "Friendly units enter ready this turn" is not a static
 * ability of the spell (the spell leaves the chain immediately); it installs a
 * turn-long enters-ready replacement scoped to its caster, which every later
 * unit play this turn consults.
 */
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      effects: [
        { duration: "turn", replaces: "enters-ready", type: "replacement" },
        { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const bushwhack: SpellCard = {
  abilities,
  cardNumber: 4,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("sfd-004-221"),
  name: "Bushwhack",
  rarity: "common",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nFriendly units enter ready this turn. Play a Gold gear token exhausted.",
  setId: "SFD",
  timing: "action",
};
