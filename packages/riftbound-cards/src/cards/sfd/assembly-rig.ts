import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const assemblyRig: GearCard = {
  cardNumber: 19,
  cardType: "gear",
  domain: "fury",
  energyCost: 4,
  id: createCardId("sfd-019-221"),
  name: "Assembly Rig",
  rarity: "rare",
  rulesText:
    "[1][fury], Recycle a unit from your trash, [Exhaust]: Play a 3 [Might] Mech unit token to your base.",
  setId: "SFD",
};
