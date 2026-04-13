import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Gardens of Becoming — unl-213-219 (Battlefield)
 *
 * 'Units here have "[Exhaust]: Gain 1 XP."'
 *
 * There is no first-class "grant activated ability" effect in the Effect
 * union. We approximate with a permanent static `grant-keyword` of a
 * virtual `"ExhaustGainXp"` keyword on all units at this battlefield. The
 * engine can honor this as a marker to expose an extra `[Exhaust]: Gain 1
 * XP` activated ability on any unit here.
 *
 * FIXME: this uses a virtual keyword string (`ExhaustGainXp`) as the
 * closest approximation of "units here have a granted activated ability".
 * A proper implementation would extend the Effect union with a
 * `grant-ability` effect.
 */
const abilities: Ability[] = [
  {
    affects: { target: { location: "here", type: "unit" }, type: "units" },
    effect: {
      duration: "permanent",
      keyword: "ExhaustGainXp",
      target: { location: "here", type: "unit" },
      type: "grant-keyword",
    },
    type: "static",
  },
];

export const gardensOfBecoming: BattlefieldCard = {
  abilities,
  cardNumber: 213,
  cardType: "battlefield",
  id: createCardId("unl-213-219"),
  name: "Gardens of Becoming",
  rarity: "uncommon",
  rulesText: "Units here have &quot;[Exhaust]: Gain 1 XP.&quot;",
  setId: "UNL",
};
