import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const navoriScout: UnitCard = {
  cardNumber: 37,
  cardType: "unit",
  domain: "calm",
  energyCost: 4,
  id: createCardId("sfd-037-221"),
  might: 4,
  name: "Navori Scout",
  rarity: "common",
  rulesText: "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)",
  setId: "SFD",
};
