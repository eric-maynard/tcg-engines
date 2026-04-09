import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const disarmingRake: UnitCard = {
  cardNumber: 32,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("sfd-032-221"),
  might: 2,
  name: "Disarming Rake",
  rarity: "common",
  rulesText: "When you play me, you may kill a gear.",
  setId: "SFD",
};
