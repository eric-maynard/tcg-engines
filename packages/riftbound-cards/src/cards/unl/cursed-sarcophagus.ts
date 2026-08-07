import type { Ability } from "@tcg/riftbound-types";
import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Cursed Sarcophagus — unl-148-219
 *
 * rule 397 (Linked abilities) — "a unit banished WITH THIS" is only what this
 * card's own trigger banished, so the trigger tags its targets (`trackLinked`)
 * and the activated ability reads that list back. rule 349/356 — "you must pay
 * its costs" is a full play: no cost is waived, so a unit the controller cannot
 * afford is not a legal pick.
 */
const abilities: Ability[] = [
  {
    effect: {
      target: { location: "trash", quantity: "all", type: "unit" },
      trackLinked: true,
      type: "banish",
    },
    trigger: { event: "play-self" },
    type: "triggered",
  },
  {
    cost: { exhaust: true },
    effect: {
      from: "banishment",
      linkedToSource: true,
      payCost: true,
      target: { type: "unit" },
      type: "play",
    },
    type: "activated",
  },
] as unknown as Ability[];

export const cursedSarcophagus: GearCard = {
  abilities,
  cardNumber: 148,
  cardType: "gear",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("unl-148-219"),
  name: "Cursed Sarcophagus",
  rarity: "epic",
  rulesText:
    "When you play this, banish all units from your trash.\n[Exhaust]: Play a unit banished with this. (You must pay its costs.)",
  setId: "UNL",
};
