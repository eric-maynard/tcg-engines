import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const hostileTakeover: SpellCard = {
  cardNumber: 202,
  cardType: "spell",
  domain: ["mind", "order"],
  energyCost: 5,
  id: createCardId("sfd-202-221"),
  name: "Hostile Takeover",
  rarity: "epic",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\nTake control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are there. Otherwise, conquer.)\nLose control of that unit and recall it at end of turn. (Send it to base. This isn't a move.)",
  setId: "SFD",
  timing: "action",
};
