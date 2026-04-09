import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const azirSovereign: UnitCard = {
  cardNumber: 177,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("sfd-177-221"),
  isChampion: true,
  might: 4,
  name: "Azir, Sovereign",
  rarity: "epic",
  rulesText:
    "[Accelerate] (You may pay [1][order] as an additional cost to have me enter ready.)\nWhen I attack, you may move any number of your token units to this battlefield.",
  setId: "SFD",
  tags: ["Azir"],
};
