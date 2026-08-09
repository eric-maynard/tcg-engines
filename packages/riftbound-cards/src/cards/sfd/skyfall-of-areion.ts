import type { EquipmentCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const skyfallOfAreion: EquipmentCard = {
  cardNumber: 30,
  cardType: "equipment",
  domain: "fury",
  effectText: "My hold effects are also conquer effects, and vice versa.",
  energyCost: 3,
  id: createCardId("sfd-030-221"),
  mightBonus: 2,
  name: "Skyfall of Areion",
  rarity: "epic",
  rulesText:
    "[Equip] [1][fury] ([1][fury]: Attach this to a unit you control.)\nMy hold effects are also conquer effects, and vice versa.",
  setId: "SFD",
};
