import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const thwonk: SpellCard = {
  cardNumber: 40,
  cardType: "spell",
  domain: "calm",
  energyCost: 2,
  id: createCardId("sfd-040-221"),
  name: "Thwonk!",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\n[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)\nStun an attacking unit. (It doesn't deal combat damage this turn.)",
  setId: "SFD",
  timing: "action",
};
