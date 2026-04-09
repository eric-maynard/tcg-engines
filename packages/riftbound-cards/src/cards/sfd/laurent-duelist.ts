import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const laurentDuelist: UnitCard = {
  cardNumber: 156,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("sfd-156-221"),
  might: 3,
  name: "Laurent Duelist",
  rarity: "common",
  rulesText: "[Assault 2] (+2 [Might] while I'm an attacker.)",
  setId: "SFD",
};
