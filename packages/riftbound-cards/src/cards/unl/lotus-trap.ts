import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const lotusTrap: SpellCard = {
  cardNumber: 13,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("unl-013-219"),
  name: "Lotus Trap",
  rarity: "uncommon",
  rulesText:
    "[Hidden] (Hide now for [rainbow] to react with later for [energy_0].)\n[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a unit. Double all damage that would be dealt to it this turn.",
  setId: "UNL",
  timing: "action",
};
