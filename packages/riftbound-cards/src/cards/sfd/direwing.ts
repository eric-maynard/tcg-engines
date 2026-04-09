import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const direwing: UnitCard = {
  cardNumber: 94,
  cardType: "unit",
  domain: "body",
  energyCost: 7,
  id: createCardId("sfd-094-221"),
  might: 7,
  name: "Direwing",
  rarity: "common",
  rulesText: "I enter ready if you control another Dragon.",
  setId: "SFD",
};
