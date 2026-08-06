import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const plunderingPoro: UnitCard = {
  cardNumber: 69,
  cardType: "unit",
  domain: "mind",
  energyCost: 2,
  id: createCardId("sfd-069-221"),
  might: 2,
  name: "Plundering Poro",
  rarity: "common",
  rulesText: "When I conquer, play a Gold gear token exhausted.",
  setId: "SFD",
  tags: ["Poro"], // rule-id: unl-046-219 — printed PORO tag (missing from set data)
};
