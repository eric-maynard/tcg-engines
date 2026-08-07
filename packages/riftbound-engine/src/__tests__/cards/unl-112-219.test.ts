/**
 * Irresistible Faefolk — unl-112-219 · Unit · Body · 2 energy (no power) · 1 Might
 *
 *   When I move to a battlefield, you may move an enemy unit to that battlefield.
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. Only a move whose DESTINATION is a battlefield triggers (420/447): base→bf and bf→bf (Ganking)
 *      yes; bf→base no; being played is not a move (446.2); an ally's move is not "I move".
 *   2. "you may" — a yes/no for the Faefolk's controller; declining moves nothing.
 *   3. "an enemy unit" — anywhere on the board (enemy base or another battlefield), never a friendly
 *      unit; a unit already AT that battlefield has no valid move there (355.4.a) and must not be offered.
 *   4. "that battlefield" is the one I moved to (359.3.f.3) — after a Gank bf1→bf2 the enemy lands at bf2.
 *   5. The pulled unit keeps its controller and its exhausted state (a move neither readies nor steals);
 *      arriving at a battlefield where I just attacked makes it a DEFENDER in that combat (464.2.c.3.a),
 *      and pulling a 1-Might unit into an open battlefield turns a free conquer into a kill + conquer.
 *   6. Moving to a battlefield I already control and pulling an enemy in stages a combat where the
 *      ENEMY is the attacker (its unit applied the contest, 464.2.c.1) on my turn.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-112-219";

/** P1: Faefolk + a 3-Might Tank ally in base. P2: Wall (5) holding bf2, an exhausted Weak (1) in base. bf1 open. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", CARD, "fae")
    .unit(P1, "base", { keywords: ["Tank"], might: 3, name: "Ally" }, "ally")
    .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
    .unit(P2, "base", { might: 1, name: "Weak" }, "weak", { exhausted: true });
}

describe("Irresistible Faefolk (unl-112-219)", () => {
  test("registry payload: one optional triggered ability — self move-to-battlefield → move an enemy unit to the same battlefield", async () => {
    await scenario().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 2, might: 1, name: "Irresistible Faefolk" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      {
        effect: { target: { controller: "enemy", type: "unit" }, to: "same", type: "move" },
        optional: true,
        trigger: { event: "move-to-battlefield", on: "self" },
        type: "triggered",
      },
    ]);
  });

  test("cost: 2 energy for a 1-Might unit that enters the base exhausted; playing it is not a move (no trigger); 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P2, "base", { might: 1 }, "weak").hand(P1, CARD, "fae").build();
    await game.p1.play("fae");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("fae")).toBe("base");
    expect(game.state("fae")).toMatchObject({ baseMight: 1, isExhausted: true, might: 1 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
    expect(game.locationOf("weak")).toBe("base");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "fae").build();
    expect(poor.p1.can("play", "fae")).toBe(false);
  });

  test("moving to an open battlefield triggers; 'you may' → yes → only ENEMY units are offered; the picked one is moved there, still P2's and still exhausted", async () => {
    const game = await board().build();
    await game.p1.move(["fae", "ally"], "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["wall", "weak"]); // never fae / ally
    await game.p1.pick("weak");
    // rule 402 (finalization): the pick happens on the chain; the move itself waits for the item to resolve.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.locationOf("weak")).toBe("bf1");
    expect(game.state("weak")).toMatchObject({ controller: P2, isExhausted: true, owner: P2 });
    // P1's units applied the contest → P1 attacks, the pulled unit defends (464.2.c.1 / 464.2.c.3.a).
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.state("weak").combatRole).toBe("defender");
  });

  test("full line: pull the 1-Might unit into the open battlefield → it dies in combat (Tank ally soaks its 1), P1 conquers bf1 and scores", async () => {
    const game = await board().build();
    await game.p1.move(["fae", "ally"], "bf1");
    await game.settle();
    await game.p1.yes();
    await game.p1.pick("weak");
    await game.settle();
    expect(game.zoneOf("weak")).toBe("trash");
    expect(game.zoneOf("fae")).toBe("battlefield-bf1");
    expect(game.state("ally").damage).toBe(0); // damage is cleared at end of combat; the point is it survived
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("declining the 'you may' moves nothing: Weak stays home, Wall stays on bf2, P1 still takes the empty battlefield", async () => {
    const game = await board().build();
    await game.p1.move("fae", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.locationOf("weak")).toBe("base");
    expect(game.locationOf("wall")).toBe("bf2");
    expect(game.locationOf("fae")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("an enemy unit at ANOTHER battlefield can be pulled off it (Wall leaves bf2); alone against it the 1-Might Faefolk dies", async () => {
    const game = await board().build();
    await game.p1.move("fae", "bf1");
    await game.settle();
    await game.p1.yes();
    await game.p1.pick("wall");
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.locationOf("wall")).toBe("bf1");
    expect(game.p2.units("bf2")).toEqual([]);
    await game.settle();
    expect(game.zoneOf("fae")).toBe("trash");
    expect(game.locationOf("wall")).toBe("bf1");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });

  test("moving from a battlefield back to base does NOT trigger", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "fae")
      .unit(P2, "base", { might: 1 }, "weak")
      .build();
    await game.p1.move("fae", "base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("weak")).toBe("base");
  });

  test("another friendly unit moving to a battlefield does not trigger the Faefolk left in base", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.locationOf("weak")).toBe("base");
    expect(game.locationOf("fae")).toBe("base");
  });

  test("Ganking bf1 → bf2 is a move to a battlefield: triggers again and 'that battlefield' is bf2", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "fae", { grantedKeywords: [{ duration: "permanent", keyword: "Ganking" }] })
      .unit(P2, "base", { might: 1, name: "Weak" }, "weak")
      .unit(P2, "base", { might: 2, name: "Other" }, "other")
      .build();
    await game.p1.gank("fae", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", triggered: true })]);
    await game.settle();
    await game.p1.yes();
    await game.p1.pick("weak");
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.locationOf("weak")).toBe("bf2");
    expect(game.locationOf("fae")).toBe("bf2");
    expect(game.cardsAt("bf1")).toEqual([]);
  });

  test("moving to a battlefield I already control and pulling an enemy in: it arrives, bf1 stays mine but is now contested BY P2 (they will attack)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "fae")
      .unit(P2, "base", { might: 1, name: "Weak" }, "weak")
      .unit(P2, "base", { might: 2, name: "Other" }, "other")
      .build();
    await game.p1.move("fae", "bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(false); // my own battlefield: no contest from me
    await game.settle();
    await game.p1.yes();
    await game.p1.pick("weak");
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.locationOf("weak")).toBe("bf1");
    expect(game.state("weak").controller).toBe(P2);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.locationOf("other")).toBe("base");
  });

  test("an enemy unit already AT that battlefield is not offered — it cannot 'move to' where it is (355.4.a)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "fae")
      .unit(P2, "bf1", { might: 1, name: "There" }, "there")
      .unit(P2, "base", { might: 1, name: "Weak" }, "weak")
      .build();
    await game.p1.move("fae", "bf1");
    await game.settle();
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["weak"]);
  });
});
