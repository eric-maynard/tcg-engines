import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const cursedSarcophagus: GearCard = {
  cardNumber: 148,
  cardType: "gear",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("unl-148-219"),
  name: "Cursed Sarcophagus",
  rarity: "epic",
  rulesText:
    "When you play this, banish all units from your trash.\n[Exhaust]: Play a unit banished with this. (You must pay its costs.)",
  setId: "UNL",
};
