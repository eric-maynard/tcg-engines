import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const qiyanaVictorious: UnitCard = {
  cardNumber: 155,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("ogn-155-298"),
  isChampion: true,
  might: 4,
  name: "Qiyana, Victorious",
  rarity: "rare",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\nWhen I conquer, draw 1 or channel 1 rune exhausted.",
  setId: "OGN",
  tags: ["Qiyana"],
};
