import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const riposte: SpellCard = {
  cardNumber: 206,
  cardType: "spell",
  domain: ["body", "order"],
  energyCost: 2,
  id: createCardId("sfd-206-221"),
  name: "Riposte",
  rarity: "epic",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a friendly unit and a spell. Counter that spell and give that unit +[Might] equal to that spell's Energy cost this turn.",
  setId: "SFD",
  timing: "reaction",
};
