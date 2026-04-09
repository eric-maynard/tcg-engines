import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const emperorOfTheSands: LegendCard = {
  cardNumber: 197,
  cardType: "legend",
  championTag: "Azir",
  domain: ["calm", "order"],
  id: createCardId("sfd-197-221"),
  name: "Emperor of the Sands",
  rarity: "rare",
  rulesText:
    "Your Sand Soldiers have [Weaponmaster].\n[1], [Exhaust]: Play a 2 [Might] Sand Soldier unit token to your base. Use only if you've played an Equipment this turn.",
  setId: "SFD",
};
