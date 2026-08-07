import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Blue Sentinel — unl-087-219
 *
 * [Shield 2]
 * Your hold effects for holding here trigger an additional time.
 * When I hold, [Add] [rainbow] at the start of your next Main Phase.
 *
 * rule 383.3.d / 383.4.d — the rider is the hold-side twin of Red
 * Brambleback's conquer doubler, so it uses the same `trigger-double`
 * shape (the engine reads it in `trigger-runner.ts`).
 *
 * rule 316.3 / 316.4 — the [Add] is DELAYED to the start of the next Main
 * Phase: every Rune Pool empties as that phase begins, so adding at hold
 * time (Beginning Phase) would lose the power.
 */
const abilities: Ability[] = [
  { keyword: "Shield", type: "keyword", value: 2 },
  {
    effect: {
      event: "hold",
      location: "here",
      type: "trigger-double",
    } as unknown as Ability["effect"],
    type: "static",
  } as Ability,
  {
    effect: { delayUntil: "next-main-phase", power: ["rainbow"], type: "add-resource" },
    trigger: { event: "hold", on: "self" },
    type: "triggered",
  },
];

export const blueSentinel: UnitCard = {
  abilities,
  cardNumber: 87,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("unl-087-219"),
  might: 4,
  name: "Blue Sentinel",
  rarity: "epic",
  rulesText:
    "[Shield 2] (+2 [Might] while I'm a defender.)\nYour hold effects for holding here trigger an additional time.\nWhen I hold, [Add] [rainbow] at the start of your next Main Phase. (Abilities that add resources can't be reacted to.)",
  setId: "UNL",
};
