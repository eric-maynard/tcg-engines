import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const maduliTheGatekeeper: UnitCard = {
  cardNumber: 144,
  cardType: "unit",
  domain: "chaos",
  energyCost: 7,
  id: createCardId("unl-144-219"),
  might: 6,
  name: "Maduli the Gatekeeper",
  rarity: "rare",
  rulesText:
    "I can't be readied.\n[chaos]: Move me to an occupied enemy battlefield if my Might is greater than the total Might of enemy units there.",
  setId: "UNL",
};
