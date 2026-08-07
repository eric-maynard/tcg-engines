import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Unique phrasing: a printed Energy-cost bound on the trash spell (rule 206),
 * only the Energy cost is ignored (rule 356.1.b.2 — the Power cost is still
 * paid), and the spell is recycled instead of trashed after it is played
 * (rule 594).
 */
const abilities: Ability[] = [
  {
    effect: {
      from: "trash",
      ignoreCost: "energy",
      recycleAfter: true,
      target: { filter: { energyCost: { lte: 3 } }, type: "spell" },
      type: "play",
    },
    optional: true,
    trigger: { event: "play-self" },
    type: "triggered",
  },
] as unknown as Ability[];

export const fizzTrickster: UnitCard = {
  abilities,
  cardNumber: 140,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("sfd-140-221"),
  isChampion: true,
  might: 3,
  name: "Fizz, Trickster",
  rarity: "rare",
  rulesText:
    "When you play me, you may play a spell from your trash with Energy cost no more than [3], ignoring its Energy cost. Recycle that spell after you play it. (You must still pay its Power cost.)",
  setId: "SFD",
  tags: ["Fizz"],
};
