/**
 * Counter Strike — sfd-194-221 · Spell · Calm/Body · 2 energy + 1 power (hybrid calm|body pip) · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1.
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. Prevent (437) is a delayed replacement with Prevent Value ALL for ONE instance: the whole next
 *     packet is prevented whatever its size (8 from Final Spark → 0), the packet after that lands.
 *  2. "would be dealt damage" — ANY damage, combat included (contrast Unyielding Spirit): a shielded
 *     3-Might attacker into a 3-Might defender survives, kills it and conquers.
 *  3. Reaction timing (813): cast in response on the opponent's turn it resolves FIRST (LIFO), so the
 *     shield is already up when their damage spell resolves. 437.4: fully prevented damage was never
 *     dealt — Disintegrate's "if this kills it, draw 1" gets nothing.
 *  4. "this turn": an unused shield expires in the Expiration Step; next turn damage lands normally.
 *  5. "Draw 1" is unconditional and immediate on resolution; "a unit" may even be an ENEMY unit.
 *  6. Cost 2 + [C] on a two-domain card (135.2.e.6.c): calm OR body power pays, fury does not; with no
 *     unit anywhere there is no legal target and the spell cannot be played.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-194-221";
const INCINERATE = "ogs-003-024"; // [Action] 2: deal 2 to a unit at a battlefield
const FINAL_SPARK = "ogs-022-024"; // 8: deal 8 to a unit
const DISINTEGRATE = "ogn-005-298"; // [Action] 4: deal 3 to a unit at a battlefield; if this kills it, draw 1

/** P2's turn with burn spells; P1 holds Counter Strike (2 energy + 1 calm) and a 3-Might unit at bf1. */
function oppTurn(p2Energy = 12) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .resources(P2, { energy: p2Energy })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, CARD, "cs");
}

describe("Counter Strike (sfd-194-221)", () => {
  test("registry payload: Reaction spell = sequence[prevent-damage (one instance, this turn, chosen unit), draw 1]; 2 energy + one hybrid pip", async () => {
    const game = await scenario().hand(P1, CARD, "cs").build();
    expect(game.state("cs")).toMatchObject({ cardType: "spell", energyCost: 2, name: "Counter Strike" });
    expect(game.state("cs").powerCost).toEqual(["rainbow"]);
    expect(game.state("cs").domains.sort()).toEqual(["body", "calm"]);
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def?.timing).toBe("reaction");
    expect(def?.abilities).toEqual([
      {
        effect: {
          effects: [
            { duration: "turn", instance: true, target: { type: "unit" }, type: "prevent-damage" },
            { amount: 1, type: "draw" },
          ],
          type: "sequence",
        },
        timing: "reaction",
        type: "spell",
      },
    ]);
  });

  test("cost (135.2.e.6.c): 2 energy + calm pays, body pays, fury does NOT, 1 energy is short; with no unit on the board there is no target and no cast", async () => {
    const mk = (energy: number, power: Record<string, number>, withUnit = true) => {
      const b = scenario().resources(P1, { energy, power }).hand(P1, CARD, "cs");
      return (withUnit ? b.unit(P1, "base", { might: 2 }, "u") : b).build();
    };
    const calm = await mk(2, { calm: 1 });
    await calm.p1.cast("cs", { targets: "u" });
    expect(calm.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    const body = await mk(2, { body: 1 });
    expect(body.p1.can("cast", "cs")).toBe(true);
    expect((await mk(2, { fury: 1 })).p1.can("cast", "cs")).toBe(false);
    expect((await mk(1, { calm: 1 })).p1.can("cast", "cs")).toBe(false);
    expect((await mk(2, {})).p1.can("cast", "cs")).toBe(false);
    expect((await mk(2, { calm: 1 }, false)).p1.can("cast", "cs")).toBe(false);
  });

  test("Reaction on the opponent's turn: cast onto their Incinerate it resolves first — the 2 is prevented, P1 draws 1, both spells end in the trash", async () => {
    const game = await oppTurn().hand(P2, INCINERATE, "burn").build();
    await game.p2.cast("burn", { targets: "guard" });
    expect(game.p1.can("cast", "cs")).toBe(false); // 312.2: P2 still holds priority over its own spell
    await game.p2.passPriority();
    expect(game.p1.can("cast", "cs")).toBe(true);
    await game.p1.cast("cs", { targets: "guard" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["burn", "cs"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p1.hand()).toHaveLength(0);
    await game.settle();
    expect(game.state("guard").damage).toBe(0);
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.p1.hand()).toHaveLength(1); // Draw 1
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.zoneOf("burn")).toBe("trash");
    expect(game.turnPlayer()).toBe(P2);
  });

  test("'the NEXT time' only: the first Incinerate is prevented, a second one the same turn deals its full 2", async () => {
    const game = await oppTurn().hand(P2, INCINERATE, "burn").hand(P2, INCINERATE, "burn2").build();
    await game.p2.cast("burn", { targets: "guard" });
    await game.p2.passPriority();
    await game.p1.cast("cs", { targets: "guard" });
    await game.settle();
    expect(game.state("guard").damage).toBe(0);
    await game.p2.cast("burn2", { targets: "guard" });
    await game.settle();
    expect(game.state("guard").damage).toBe(2);
    expect(game.locationOf("guard")).toBe("bf1");
  });

  test("Prevent Value is ALL for that instance (437.1.b.1.b): an 8-damage Final Spark on a 3-Might unit is prevented entirely", async () => {
    const game = await oppTurn().hand(P2, FINAL_SPARK, "spark").build();
    await game.p2.cast("spark", { targets: "guard" });
    await game.p2.passPriority();
    await game.p1.cast("cs", { targets: "guard" });
    await game.settle();
    expect(game.state("guard").damage).toBe(0);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.zoneOf("spark")).toBe("trash");
  });

  test("COMBAT damage counts too: a shielded 3-Might attacker into a 3-Might defender takes nothing, kills it and conquers", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Picket" }, "picket")
      .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
      .hand(P1, CARD, "cs")
      .build();
    await game.p1.cast("cs", { targets: "striker" });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1); // drew before any damage was ever threatened
    await game.p1.move("striker", "bf1");
    await game.settle();
    expect(game.zoneOf("picket")).toBe("trash");
    expect(game.locationOf("striker")).toBe("bf1");
    expect(game.state("striker").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative space: the same 3-into-3 attack WITHOUT Counter Strike is a mutual kill and no conquer", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3 }, "picket").unit(P1, "base", { might: 3 }, "striker").build();
    await game.p1.move("striker", "bf1");
    await game.settle();
    expect(game.zoneOf("picket")).toBe("trash");
    expect(game.zoneOf("striker")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });

  test("437.4 — fully prevented damage was never dealt: Disintegrate's 'if this kills it, draw 1' gives P2 nothing and the 3-Might unit lives", async () => {
    const game = await oppTurn().hand(P2, DISINTEGRATE, "dis").build();
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("dis", { targets: "guard" });
    await game.p2.passPriority();
    await game.p1.cast("cs", { targets: "guard" });
    await game.settle();
    expect(game.state("guard").damage).toBe(0);
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // spent Disintegrate, drew nothing
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("'this turn' — an unused shield must expire in the Expiration Step (437.7 delayed replacement with a turn duration); next turn the opponent's Incinerate deals its 2", async () => {
    // Expected: preventNextDamageInstance is cleared at end of turn, so the 2 lands next turn.
    // Actual: the one-shot shield survives the turn boundary and eats next turn's Incinerate (damage 0).
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .hand(P1, CARD, "cs")
      .hand(P2, INCINERATE, "burn")
      .build();
    await game.p1.cast("cs", { targets: "guard" });
    await game.settle();
    expect(game.state("guard").meta.preventNextDamageInstance).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 2 });
    await game.p2.cast("burn", { targets: "guard" });
    await game.settle();
    expect(game.state("guard").damage).toBe(2);
  });

  test("within the same turn the shield persists across unrelated actions: cast first, Incinerate later that turn is still prevented", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 1, name: "Walker" }, "walker")
      .hand(P1, CARD, "cs")
      .hand(P1, INCINERATE, "burn")
      .build();
    await game.p1.cast("cs", { targets: "guard" });
    await game.settle();
    await game.p1.move("walker", "bf1");
    await game.settle();
    await game.p1.cast("burn", { targets: "guard" }); // even your own damage is "damage that would be dealt"
    await game.settle();
    expect(game.state("guard").damage).toBe(0);
    expect(game.zoneOf("burn")).toBe("trash");
  });

  test("'Choose a unit' — an ENEMY unit is a legal choice; P1 still draws 1 and it is the enemy that gets the one-shot shield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Their Guard" }, "theirs")
      .hand(P1, CARD, "cs")
      .hand(P1, INCINERATE, "burn")
      .build();
    const targets = game.p1.option("cast", "cs")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["theirs"]]);
    await game.p1.cast("cs", { targets: "theirs" });
    await game.settle();
    expect(game.p1.hand()).toContain("burn");
    expect(game.p1.hand()).toHaveLength(2); // burn + the drawn card
    expect(game.state("theirs").meta.preventNextDamageInstance).toBe(true);
    await game.p1.cast("burn", { targets: "theirs" });
    await game.settle();
    expect(game.state("theirs").damage).toBe(0);
  });
});
