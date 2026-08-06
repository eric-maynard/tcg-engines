import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dragUnder: SpellCard = {
  // rule 356.4 — "I cost [2] less to play from anywhere other than your hand"
  // is a self cost-reduction gated on the play's origin zone; the parser drops
  // the rider, so both clauses are spelled out here.
  abilities: [
    {
      effect: { by: 2, target: "self", type: "cost-reduction", whenPlayedFrom: "not-hand" },
      type: "static",
    },
    {
      effect: { target: { location: "battlefield", type: "unit" }, type: "kill" },
      timing: "action",
      type: "spell",
    },
  ],
  cardNumber: 164,
  cardType: "spell",
  domain: "order",
  energyCost: 5,
  id: createCardId("sfd-164-221"),
  name: "Drag Under",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nI cost [2] less to play from anywhere other than your hand.\nKill a unit at a battlefield.",
  setId: "SFD",
  timing: "action",
};
