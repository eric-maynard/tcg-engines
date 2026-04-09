import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const forgottenMonument: BattlefieldCard = {
  cardNumber: 209,
  cardType: "battlefield",
  id: createCardId("sfd-209-221"),
  name: "Forgotten Monument",
  rarity: "uncommon",
  rulesText: "Players can't score here until their third turn.",
  setId: "SFD",
};
