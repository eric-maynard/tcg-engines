import type { Ability } from "@tcg/riftbound-types";
import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

// rule 317.1 / 455 — the "lose control … and recall it at end of turn" rider is
// unique to this card: it rides on the take-control effect as a duration.
const abilities: Ability[] = [
  { keyword: "Hidden", type: "keyword" },
  {
    effect: {
      effects: [
        {
          target: { controller: "enemy", location: "battlefield", type: "unit" },
          type: "take-control",
        },
        { type: "ready" },
        { recall: true, type: "delayed-lose-control" },
      ],
      type: "sequence",
    },
    timing: "action",
    type: "spell",
  },
];

export const hostileTakeover: SpellCard = {
  abilities,
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
