import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const forgeOfTheFluft: BattlefieldCard = {
  cardNumber: 208,
  cardType: "battlefield",
  id: createCardId("sfd-208-221"),
  name: "Forge of the Fluft",
  rarity: "uncommon",
  rulesText:
    "While you control this battlefield, friendly legends have &quot;[Exhaust]: Attach an Equipment you control to a unit you control.&quot;",
  setId: "SFD",
};
