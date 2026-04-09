import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dauntlessVanguard: UnitCard = {
  cardNumber: 93,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("sfd-093-221"),
  might: 4,
  name: "Dauntless Vanguard",
  rarity: "common",
  rulesText: "You may play me to an occupied enemy battlefield.",
  setId: "SFD",
};
