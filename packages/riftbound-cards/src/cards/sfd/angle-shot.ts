import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const angleShot: SpellCard = {
  cardNumber: 11,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("sfd-011-221"),
  name: "Angle Shot",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a unit and an Equipment with the same controller. Attach that Equipment to that unit or detach that Equipment from that unit. Draw 1.",
  setId: "SFD",
  timing: "reaction",
};
