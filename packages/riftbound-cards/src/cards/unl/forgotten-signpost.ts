import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const forgottenSignpost: GearCard = {
  cardNumber: 45,
  cardType: "gear",
  domain: "calm",
  energyCost: 2,
  id: createCardId("unl-045-219"),
  name: "Forgotten Signpost",
  rarity: "uncommon",
  rulesText:
    "[Action][&gt;] Exhaust a unit you control, [Exhaust]: Move a different unit you control to the location of the unit you exhausted to pay for this ability.",
  setId: "UNL",
};
