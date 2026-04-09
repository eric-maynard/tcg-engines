import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const vaultBreaker: SpellCard = {
  cardNumber: 10,
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  id: createCardId("unl-010-219"),
  name: "Vault Breaker",
  rarity: "common",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nGive a unit [Assault 2] and [Ganking] this turn. (+2 [Might] while it's an attacker. It can move from battlefield to battlefield.)",
  setId: "UNL",
  timing: "action",
};
