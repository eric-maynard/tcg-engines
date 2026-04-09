import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const combatExperience: SpellCard = {
  cardNumber: 31,
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  id: createCardId("unl-031-219"),
  name: "Combat Experience",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nGive a unit +1 [Might] this turn.\n[Level 6][&gt;] Give it +3 [Might] this turn instead. (While you have 6+ XP, get the effect.)",
  setId: "UNL",
  timing: "reaction",
};
