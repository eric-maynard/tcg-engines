import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const windsinger: UnitCard = {
  cardNumber: 138,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("sfd-138-221"),
  might: 1,
  name: "Windsinger",
  rarity: "uncommon",
  rulesText:
    "Hidden (Hide now for [rainbow] to react with later for [energy_0].)\nWhen you play me, you may return another unit at a battlefield with 3 [Might] or less to its owner's hand.",
  setId: "SFD",
};
