import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Unique phrasing: the trash spell's Energy cost is bounded by a live game
 * value (your points, rule 206) and the play recycles the spell afterwards
 * (rule 594) instead of trashing it.
 */
const abilities: Ability[] = [
  { keyword: "Ganking", type: "keyword" },
  {
    effect: {
      from: "trash",
      ignoreCost: "energy",
      recycleAfter: true,
      // rule 355.10.a / 383.3.b — the trash is a PUBLIC zone, so the spell is a
      // TARGET named as this trigger is FINALIZED (with every other simultaneous
      // trigger still unresolved), not a card picked as the instruction resolves:
      // `location: "trash"` is what routes the choice through finalization.
      target: {
        controller: "friendly",
        filter: { energyCost: { lt: { points: "controller" } } },
        location: "trash",
        // rule 355.10.d.2 — a sole legal spell is still a choice: ask for it.
        promptWhenSingle: true,
        type: "spell",
      },
      type: "play",
    },
    optional: true,
    trigger: { event: "conquer", on: "self" },
    type: "triggered",
  },
] as unknown as Ability[];

export const kaisaEvolutionary: UnitCard = {
  abilities,
  cardNumber: 112,
  cardType: "unit",
  domain: "mind",
  energyCost: 6,
  id: createCardId("ogn-112-298"),
  isChampion: true,
  might: 6,
  name: "Kai'Sa, Evolutionary",
  rarity: "rare",
  rulesText:
    "[Ganking] (I can move from battlefield to battlefield.)\nWhen I conquer, you may play a spell from your trash with Energy cost less than your points without paying its Energy cost. Then recycle it. (You must still pay its Power cost.)",
  setId: "OGN",
  tags: ["Kai'Sa"],
};
