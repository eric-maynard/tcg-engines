import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sharkling: UnitCard = {
  cardNumber: 6,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("unl-006-219"),
  might: 1,
  name: "Sharkling",
  rarity: "common",
  rulesText:
    "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)\n[Assault 4] (+4 [Might] while I'm an attacker.)",
  setId: "UNL",
};
