import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const jaxUnmatched: UnitCard = {
  // rule 208.3 / 819.1 — "Your Equipment everywhere have [Quick-Draw]": the
  // grant addresses EQUIPMENT (not plain gear) in every zone, including hand,
  // which is what lets it be played at Reaction speed. The parser widens this
  // to on-board gear, so the descriptor is spelled out here.
  abilities: [
    { keyword: "Deflect", type: "keyword", value: 1 },
    {
      effect: {
        keyword: "Quick-Draw",
        target: { controller: "friendly", location: "anywhere", type: "equipment" },
        type: "grant-keyword",
      },
      type: "static",
    },
  ],
  cardNumber: 54,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("sfd-054-221"),
  isChampion: true,
  might: 5,
  name: "Jax, Unmatched",
  rarity: "rare",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\nYour Equipment everywhere have [Quick-Draw]. (Each gains [Reaction]. When you play it, attach it to a unit you control.)",
  setId: "SFD",
  tags: ["Jax"],
};
