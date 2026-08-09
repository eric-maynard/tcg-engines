/**
 * Serrated Dirk — sfd-009-221 · Equipment · Fury · 1 energy
 *
 *   [Equip] [fury] ([fury]: Attach this to a unit you control.)
 *   Effect Text: [Assault 2] (+2 [Might] while I'm an attacker.)
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

describe("Serrated Dirk (sfd-009-221) — Effect Text [Assault 2]", () => {
  // rule 136 / 150.2 / 718.3: the Effect Text box (gallery `effect`: "[Assault 2] (+2 :rb_might: while I'm an
  // attacker.)") is appended to the equipped unit while attached — the keyword bar is the BEARER's, and only then.
  test("the attached unit attacks with +2 Might — a 3-Might ally kills a 3-Might defender and survives", async () => {
    const game = await board().build();
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "ally" });
    await game.settle();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P1 });
  });

  test("attach ⇒ the bearer (not the Dirk, not anyone else) has Assault 2: +0 at rest, 3 → 5 while it is the attacker", async () => {
    const game = await board().unit(P1, "base", { might: 3 }, "bystander").build();
    expect(game.state("ally").grantedKeywords).toEqual([]); // unattached: nothing conferred (136.2.b)
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "ally" });
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("ally");
    expect(game.state("ally").grantedKeywords).toEqual([{ duration: "static", keyword: "Assault", value: 2 }]);
    expect(game.state("ally").might).toBe(3); // +0 bonus, Assault is attacker-only (807)
    expect(game.state("bystander").grantedKeywords).toEqual([]);
    expect(game.state("dirk").keywords).toEqual(["Equip"]); // the gear itself has no Assault (718.2)
    await game.p1.move("ally", "bf1");
    expect(game.state("ally")).toMatchObject({ combatRole: "attacker", might: 5 });
    expect(game.state("foe").might).toBe(3);
  });

  test("bearer dies ⇒ the Dirk detaches to base and Assault 2 is gone from the board; re-equipping another unit moves the grant to it", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 1 }, "ally")
      .unit(P1, "base", { might: 2 }, "next")
      .unit(P2, "bf1", { might: 6 }, "wall")
      .gear(P1, CARD, "dirk")
      .build();
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "ally" });
    await game.settle();
    await game.p1.move("ally", "bf1"); // 1 + 2 = 3 into 6: the bearer dies
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("dirk")).toBe("base");
    expect(game.state("dirk").attachedTo).toBeUndefined();
    expect(game.state("next").grantedKeywords).toEqual([]);
    expect(game.state("wall").grantedKeywords).toEqual([]);
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "next" });
    await game.settle();
    expect(game.state("next").grantedKeywords).toEqual([{ duration: "static", keyword: "Assault", value: 2 }]);
  });
});
