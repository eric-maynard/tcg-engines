import type { Ability } from "@tcg/riftbound-types";
import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Targon's Peak — ogn-289-298 (Battlefield)
 *
 * "When you conquer here, ready up to 2 runes at the end of this turn."
 *
 * rule 355.5.b — the ready is DELAYED: conquering chooses nothing and readies
 * nothing; the conquer trigger installs a player-scoped end-of-turn ability
 * (rule 390.2) whose "up to 2" runes are chosen when IT is finalized in the
 * Ending Step (rule 317.1). rule 392 keeps it alive even if the Peak is lost.
 * rule 471.2.a — `location: "here"` keeps another battlefield's conquer out.
 */
const abilities: Ability[] = [
  {
    effect: {
      duration: "turn",
      effect: {
        target: { controller: "friendly", quantity: { upTo: 2 }, type: "rune" },
        type: "ready",
      },
      target: "controller",
      trigger: { event: "end-of-turn", on: "controller" },
      type: "delayed-trigger",
    },
    trigger: { event: "conquer", location: "here", on: "controller" },
    type: "triggered",
  },
] as unknown as Ability[];

export const targonsPeak: BattlefieldCard = {
  abilities,
  cardNumber: 289,
  cardType: "battlefield",
  id: createCardId("ogn-289-298"),
  name: "Targon's Peak",
  rarity: "uncommon",
  rulesText: "When you conquer here, ready up to 2 runes at the end of this turn.",
  setId: "OGN",
};
