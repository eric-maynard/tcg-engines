import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Glasc Mixologist — sfd-165-221
 *
 * [Deathknell] — You may play a unit with cost no more than [3] and no more
 * than [rainbow] from your trash, ignoring its cost.
 *
 * rule 206: the bounds compare the PRINTED cost — Energy <= 3 and at most one
 * Power pip ([rainbow]). rule 356.1.b: "ignoring its cost" waives Energy and
 * Power alike, so the play is free.
 *
 * The parser reads the "with cost no more than …" qualifier as ordinary filler
 * and drops both the bounds and the cost waiver, which leaves nothing in the
 * trash affordable and the trigger a no-op; the shape is spelled out here (the
 * printed phrasing is shared only with unl-168-219).
 */
const playFromTrash: Ability["effect"] = {
  from: "trash",
  ignoreCost: true,
  target: {
    controller: "friendly",
    filter: [{ energyCost: { lte: 3 } }, { powerCost: { lte: 1 } }],
    type: "unit",
  },
  type: "play",
};

const abilities: Ability[] = [
  { effect: playFromTrash, keyword: "Deathknell", type: "keyword" },
  { effect: playFromTrash, trigger: { event: "die", on: "self" }, type: "triggered" },
];

export const glascMixologist: UnitCard = {
  abilities,
  cardNumber: 165,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("sfd-165-221"),
  might: 5,
  name: "Glasc Mixologist",
  rarity: "uncommon",
  rulesText:
    "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from your trash, ignoring its cost. (When I die, get the effect.)",
  setId: "SFD",
};
