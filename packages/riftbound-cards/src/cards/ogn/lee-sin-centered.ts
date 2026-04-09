import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const leeSinCentered: UnitCard = {
  cardNumber: 151,
  cardType: "unit",
  domain: "body",
  energyCost: 6,
  id: createCardId("ogn-151-298"),
  isChampion: true,
  might: 6,
  name: "Lee Sin, Centered",
  rarity: "rare",
  rulesText:
    "[Accelerate] (You may pay [1][body] as an additional cost to have me enter ready.)\nOther buffed friendly units at my battlefield have +2 [Might].",
  setId: "OGN",
  tags: ["Lee Sin"],
};
