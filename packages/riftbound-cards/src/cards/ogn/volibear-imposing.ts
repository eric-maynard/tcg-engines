import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 144.4: a move to a BASE is not a move to a battlefield, and "other than
// mine" excludes the battlefield Volibear occupies.
const abilities: Ability[] = [
  { keyword: "Shield", type: "keyword", value: 3 },
  { keyword: "Tank", type: "keyword" },
  {
    effect: { amount: 1, type: "draw" },
    trigger: {
      event: "move",
      // rule 144.3 — the subject is the PLAYER, not the unit: moving several
      // units together is ONE Standard Move, so `batched` keeps it to one draw.
      on: { actor: "opponent", batched: true, location: "other-battlefield" },
    },
    type: "triggered",
  },
];

export const volibearImposing: UnitCard = {
  abilities,
  cardNumber: 158,
  cardType: "unit",
  domain: "body",
  energyCost: 12,
  id: createCardId("ogn-158-298"),
  isChampion: true,
  might: 10,
  name: "Volibear, Imposing",
  rarity: "rare",
  rulesText:
    "[Shield 3] (+3 [Might] while I'm a defender.)\n[Tank] (I must be assigned combat damage first.)\nWhen an opponent moves to a battlefield other than mine, draw 1. (Bases are not battlefield.)",
  setId: "OGN",
  tags: ["Volibear"],
};
