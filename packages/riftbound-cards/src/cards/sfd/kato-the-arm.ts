import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const katoTheArm: UnitCard = {
  cardNumber: 112,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("sfd-112-221"),
  might: 3,
  name: "Kato the Arm",
  rarity: "rare",
  rulesText:
    "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)\nWhen I move to a battlefield, give another friendly unit my keywords and +[Might] equal to my Might this turn.",
  setId: "SFD",
};
