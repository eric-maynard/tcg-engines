import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const trustyRamhound: UnitCard = {
  cardNumber: 159,
  cardType: "unit",
  domain: "order",
  energyCost: 2,
  id: createCardId("sfd-159-221"),
  might: 2,
  name: "Trusty Ramhound",
  rarity: "common",
  rulesText: "While you have another unit here, I have +1 [Might].",
  setId: "SFD",
};
