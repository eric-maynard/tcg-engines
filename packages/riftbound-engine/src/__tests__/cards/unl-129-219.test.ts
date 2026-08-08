/**
 * Vicious Snapjaws — unl-129-219 · Unit · Chaos · 5 energy (no power) · 5 Might
 *
 *   When another friendly unit dies, gain 1 XP.
 *
 * Rules: 730.1 (Gain XP = increase the XP marked on the player; XP persists, 728), 383 (triggered
 * abilities are active only while their source is on the board), 383.1.b (a permanent that leaves the
 * board AT THE SAME TIME as its trigger condition is met cannot evaluate it — the Viktor, Leader
 * example: "does not trigger if Viktor and another … unit you control die during the same game action"),
 * 370.1.a.2 (deaths from one combat damage step / one spell are simultaneous), 808.2-style: one
 * trigger per dying unit.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. "another": Snapjaws' own death is worth nothing; "friendly": enemy deaths are worth nothing (even
 *     the ones Snapjaws causes while conquering).
 *  2. Two friendly units dying in the same combat are two events → +2 XP.
 *  3. 383.1.b: Snapjaws dying in the SAME damage step as the other friendly unit sees nothing → +0.
 *  4. No "here": Snapjaws sitting in base still counts a friendly death at a battlefield, and it works on
 *     the opponent's turn (your defender dying to their attack).
 *  5. "Dies" is any trip to the trash from the board — a friendly unit you sacrifice yourself (Deathgrip's
 *     "Kill a friendly unit") counts just like combat.
 *  6. Zone of function: a Snapjaws in hand or trash never triggers; an ENEMY Snapjaws does not profit
 *     from your losses (each Snapjaws counts only its own controller's units).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-129-219";
const DEATHGRIP = "sfd-163-221"; // [Reaction] 2: Kill a friendly unit. If you do, give +Might equal to its Might to another friendly unit this turn. Draw 1.

/** P1: Snapjaws in base, `allies` in base ready to attack P2's `defenderMight` unit at bf1. */
function withAllies(defenderMight: number, allies: { might: number; alias: string }[]) {
  const b = scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: defenderMight, name: "Foe" }, "foe").unit(P1, "base", CARD, "snap");
  for (const a of allies) {
    b.unit(P1, "base", { might: a.might, name: a.alias }, a.alias);
  }
  return b;
}

describe("Vicious Snapjaws (unl-129-219)", () => {
  test("registry payload matches the printed text: one triggered ability — on die of another FRIENDLY unit (excludeSelf) → gain 1 XP; 5 energy, no power, 5 Might", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 5, might: 5, name: "Vicious Snapjaws" });
    expect(def?.powerCost).toBeUndefined();
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 1, type: "gain-xp" },
        trigger: { event: "die", on: { controller: "friendly", excludeSelf: true, type: "unit" } },
        type: "triggered",
      },
    ]);
  });

  test("cost: exactly 5 energy and no power; enters base exhausted at 5 Might; 4 energy (even with chaos power) cannot pay", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "snap").build();
    await game.p1.play("snap");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("snap")).toBe("base");
    expect(game.state("snap")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.p1.xp()).toBe(0); // playing it is not a death
    expect((await scenario().resources(P1, { energy: 4, power: { chaos: 3 } }).hand(P1, CARD, "snap").build()).p1.can("play", "snap")).toBe(false);
  });

  test("another friendly unit dies in combat (a 1-Might ally bounces off a 3-Might defender) while Snapjaws sits in base → P1 gains exactly 1 XP, P2 none", async () => {
    const game = await withAllies(3, [{ alias: "minnow", might: 1 }]).build();
    await game.p1.move("minnow", "bf1");
    await game.settle();
    expect(game.zoneOf("minnow")).toBe("trash");
    expect(game.zoneOf("snap")).toBe("base");
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("'another': Snapjaws' OWN death (alone into a 6-Might wall) gains nothing", async () => {
    const game = await withAllies(6, []).build();
    await game.p1.move("snap", "bf1");
    await game.settle();
    expect(game.zoneOf("snap")).toBe("trash");
    expect(game.p1.xp()).toBe(0);
  });

  test("'friendly': an ENEMY unit dying (Snapjaws kills a 3-Might defender and conquers) gains no XP — only the conquer point", async () => {
    const game = await withAllies(3, []).build();
    await game.p1.move("snap", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("snap")).toBe("bf1");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.xp()).toBe(0);
  });

  test("two friendly units dying in the same combat are two triggers → +2 XP", async () => {
    const game = await withAllies(5, [
      { alias: "a1", might: 1 },
      { alias: "a2", might: 1 },
    ]).build();
    await game.p1.move(["a1", "a2"], "bf1");
    await game.settle();
    expect(game.zoneOf("a1")).toBe("trash");
    expect(game.zoneOf("a2")).toBe("trash");
    expect(game.locationOf("foe")).toBe("bf1");
    expect(game.p1.xp()).toBe(2);
  });

  test("383.1.b: Snapjaws dying in the SAME damage step as the other friendly unit (both attack a 9-Might defender) cannot see that death → 0 XP", async () => {
    const game = await withAllies(9, [{ alias: "pal", might: 2 }]).build();
    await game.p1.move(["snap", "pal"], "bf1");
    await game.settle();
    expect(game.zoneOf("snap")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.p1.xp()).toBe(0);
  });

  test("Snapjaws survives the combat in which its ally dies (5+2 into a 4-Might defender who puts lethal on the ally) → foe dies, conquer, and +1 XP", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .unit(P1, "base", CARD, "snap")
      .build();
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { pal: 2, snap: 2 }, kind: "distribute" } : undefined)]);
    await game.p1.move(["pal", "snap"], "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.locationOf("snap")).toBe("bf1");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
  });

  test("works on the opponent's turn: P2's 4-Might raider kills P1's 2-Might defender at bf1 while Snapjaws is in base → P1 +1 XP", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "base", CARD, "snap")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
  });

  test("a friendly unit you sacrifice yourself still 'dies': Deathgrip kills the ally (Snapjaws takes the +Might) → +1 XP, and the trigger is a chain item P2 may respond to", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", CARD, "snap")
      .unit(P1, "base", { might: 3, name: "Lamb" }, "lamb")
      .hand(P1, DEATHGRIP, "grip")
      .build();
    await game.p1.cast("grip", { targets: "lamb" }); // the +Might recipient is the only other friendly unit (Snapjaws)
    // Resolve Deathgrip only (both pass once), then look at what is pending.
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("snap");
    }
    expect(game.zoneOf("lamb")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snap", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.xp()).toBe(0); // not before the trigger resolves
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2's response window
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.state("snap").might).toBe(8); // 5 + the lamb's 3, this turn
    expect(game.p1.hand()).toHaveLength(1); // Deathgrip's draw
  });

  test("zone of function: a Snapjaws in HAND (or trash) does not trigger when a friendly unit dies", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 1, name: "Minnow" }, "minnow")
      .hand(P1, CARD, "inHand")
      .trash(P1, CARD, "inTrash")
      .build();
    await game.p1.move("minnow", "bf1");
    await game.settle();
    expect(game.zoneOf("minnow")).toBe("trash");
    expect(game.p1.xp()).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("each Snapjaws counts only its controller's units: P1's ally and P2's defender trade → P1's Snapjaws +1 for the ally, P2's Snapjaws +1 for the defender, nobody gets 2", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .unit(P2, "base", CARD, "theirSnap")
      .unit(P1, "base", CARD, "mySnap")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .build();
    await game.p1.move("pal", "bf1");
    await game.settle();
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(1);
  });

  test("XP persists across turns (728): the point gained from a death this turn is still there next turn, and nothing more accrues by itself", async () => {
    const game = await withAllies(3, [{ alias: "minnow", might: 1 }]).build();
    await game.p1.move("minnow", "bf1");
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(1);
  });
});
