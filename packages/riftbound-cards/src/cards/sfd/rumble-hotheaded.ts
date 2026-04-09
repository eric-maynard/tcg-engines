import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rumbleHotheaded: UnitCard = {
  cardNumber: 26,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("sfd-026-221"),
  isChampion: true,
  might: 4,
  name: "Rumble, Hotheaded",
  rarity: "rare",
  rulesText:
    "Your Mechs each have [Assault]. (+1 [Might] while we're attackers.)\nWhen I conquer, you may recycle another friendly unit to play a Mech from your trash. Reduce its Energy cost by the Might of the unit you recycled.",
  setId: "SFD",
  tags: ["Rumble"],
};
