import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const vanguardArmory: GearCard = {
  cardNumber: 168,
  cardType: "gear",
  domain: "order",
  energyCost: 7,
  id: createCardId("sfd-168-221"),
  name: "Vanguard Armory",
  rarity: "uncommon",
  rulesText:
    "[Exhaust]: Play three 1 [Might] Recruit unit tokens. (You may play them to different locations.)",
  setId: "SFD",
};
