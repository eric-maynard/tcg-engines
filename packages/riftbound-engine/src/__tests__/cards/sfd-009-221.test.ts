/**
 * Serrated Dirk — sfd-009-221 · Equipment · Fury · 1 energy
 *
 *   [Equip] [fury] ([fury]: Attach this to a unit you control.)
 *
 * Head-judge notes (timing of the [Equip] activated ability):
 *  - [Equip] is an Activated Ability keyword of a Gear (rule 818.1 / 818.1.a), so rule 151.2
 *    governs when it may be used: "during the controlling player's Main Phase during an Open
 *    State, and not during a Showdown". That is standard speed — the same window that lets you
 *    play a unit or a gear.
 *  - Consequently it is illegal in a Closed State: while any chain item is waiting to resolve
 *    (even your own spell, even on your own turn), [Equip] must not be offered. It becomes legal
 *    again once the chain empties and the turn is back in Neutral Open.
 *  - It is likewise illegal in a Showdown (Open or Closed) and on the opponent's turn.
 *  - Weaponmaster (rule 821.1.b) is the printed exception: it attaches "regardless of the usual
 *    timing of the Equip ability", and it does not activate the [Equip] ability at all.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-009-221";
const DISINTEGRATE = "ogn-005-298"; // [Action] 4 energy: deal 3 damage to a unit at a battlefield

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3 }, "ally")
    .unit(P2, "bf1", { might: 3 }, "foe")
    .gear(P1, CARD, "dirk")
    .hand(P1, DISINTEGRATE, "dis");
}

function equipOffered(game: { p1: { legal(): readonly { moveId: string }[] } }): boolean {
  return game.p1.legal().some((o) => o.moveId === "equipCard");
}

describe("Serrated Dirk (sfd-009-221) — [Equip] timing", () => {
  test("in Neutral Open on your own Main Phase the [Equip] ability is offered and attaches", async () => {
    const game = await board().build();
    expect(equipOffered(game)).toBe(true);
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "ally" });
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("ally");
  });

  test("while a chain is open (Closed State) [Equip] is not legal, and becomes legal again once it resolves", async () => {
    const game = await board().build();
    await game.p1.cast("dis", { targets: "foe" });
    expect(game.chain()).toHaveLength(1);

    // rule 151.2: an Open State is required — a pending chain item makes this a Closed State.
    expect(equipOffered(game)).toBe(false);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "dirk", unitId: "ally" }))).ok).toBe(false);

    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(equipOffered(game)).toBe(true);
  });

  test("[Equip] is not legal during a Showdown, nor on the opponent's turn", async () => {
    const showdown = await board().build();
    await showdown.p1.move("ally", "bf1");
    expect(equipOffered(showdown)).toBe(false);

    const oppTurn = await board().active(P2).build();
    expect(equipOffered(oppTurn)).toBe(false);
  });
});
