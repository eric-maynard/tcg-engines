import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 187.7 / 476.1 — the aura is tag-scoped: only units here carrying one of
// the listed tags get +1 [Might]; a tagless unit at Brush stays at its printed
// Might. The parser reads the sentence as an untagged "units here" aura, so the
// tag list is spelled out here.
const abilities: Ability[] = [
  {
    effect: {
      amount: 1,
      target: {
        filter: { tag: ["Bird", "Cat", "Dog", "Poro", "Ivern"] },
        location: "here",
        type: "unit",
      },
      type: "modify-might",
    },
    type: "static",
  },
];

export const brush: BattlefieldCard = {
  abilities,
  cardNumber: 3,
  cardType: "battlefield",
  id: createCardId("unl-t03"),
  name: "Brush",
  rarity: "common",
  rulesText:
    "Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might].\nWhen you score here, you may replace this with the battlefield it replaced.",
  setId: "UNL",
};
