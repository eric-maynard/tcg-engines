import type { Ability } from "@tcg/riftbound-types";
import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

/**
 * Rumble, Hotheaded — sfd-026-221
 *
 * Your Mechs each have [Assault].
 * When I conquer, you may recycle another friendly unit to play a Mech
 * from your trash. Reduce its Energy cost by the Might of the unit you
 * recycled.
 *
 * Two abilities:
 *  1. Static: grant Assault 1 to friendly Mechs
 *  2. Triggered (conquer): pay (recycle another friendly unit) to play a
 *     Mech from trash with cost reduction equal to the recycled unit's Might
 */
const abilities: Ability[] = [
  {
    effect: {
      duration: "permanent",
      keyword: "Assault",
      target: {
        controller: "friendly",
        filter: { tag: "Mech" },
        type: "unit",
      },
      type: "grant-keyword",
      value: 1,
    },
    type: "static",
  },
  {
    condition: {
      cost: {
        recycle: {
          amount: 1,
          from: "board",
          target: {
            controller: "friendly",
            excludeSelf: true,
            type: "unit",
          },
        },
      },
      type: "pay-cost",
    },
    effect: {
      from: "trash",
      // rule 356.4 / 355.10.c.1: "Reduce its Energy cost by the Might of the
      // unit you recycled" — the discount is the Might of the card recycled to
      // pay this trigger's cost, which resolves as the effect's trigger source.
      reduceCost: { energy: { might: "recycled" } },
      target: { filter: { tag: "Mech" }, type: "unit" },
      type: "play",
    },
    optional: true,
    trigger: { event: "conquer", on: "self" },
    type: "triggered",
  },
];

export const rumbleHotheaded: UnitCard = {
  abilities,
  cardNumber: 26,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("sfd-026-221"),
  isChampion: true,
  might: 4,
  name: "Rumble, Hotheaded",
  rarity: "rare",
  rulesText:
    "Your Mechs each have [Assault]. (+1 [Might] while we're attackers.)\nWhen I conquer, you may recycle another friendly unit to play a Mech from your trash. Reduce its Energy cost by the Might of the unit you recycled.",
  setId: "SFD",
  // rule 522: the reminder "(+1 [Might] while WE're attackers)" counts Rumble
  // among "your Mechs", so he carries the Mech tag himself.
  tags: ["Rumble", "Mech"],
};
