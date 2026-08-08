/**
 * Navori Fighting Pit — ogn-283-298 · Battlefield
 *
 *   When you hold here, buff a unit here. (If it doesn't have a buff, it gets a +1 [Might] buff.)
 *
 * Rules: 469.2 / 315.2.b (Hold = the turn player keeps control of a battlefield through their own
 * Beginning Phase; +1 point), 383.4.d / 471.2.b (a Hold Effect: a triggered ability that goes on the
 * chain at the held battlefield, controlled by the player who held — the battlefield card belongs to
 * no one's board side), 355.8 (its one target — "a unit here" — is chosen as it is finalized; no legal
 * target → nothing happens), 426 / 702–703 (Buff = a counter worth +1 Might; a unit that already has
 * one gets nothing — 426.1.c / 702.3.a — and a buff is not a "this turn" effect), 053.3 ("here" = at
 * this battlefield only).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Two candidates here → the holder must CHOOSE (a real prompt) and units in a base or at another
 *     battlefield are never offered; one candidate → locked in without asking.
 *  2. Choosing an already-buffed unit is legal but does nothing (still exactly one buff, +1 total);
 *     with a buffed and an unbuffed unit here the choice matters.
 *  3. The trigger's controller is whoever HELD, not the battlefield's deck owner: P2 holding a Pit
 *     from P1's deck buffs P2's unit.
 *  4. Negative space: conquering the Pit is not holding it; the opponent's Beginning Phase never
 *     holds it for you; a Pit held with nobody standing on it (harness-seeded control) scores but
 *     buffs nothing and asks nothing.
 *  5. It uses the chain: the Beginning Phase holds while it waits, the opponent gets priority before
 *     it resolves, and the point is already scored while it is pending.
 *  6. Partner: Blue Sentinel here ("your hold effects for holding here trigger an additional time")
 *     → two Pit triggers, each with its own choice → two different units buffed. The buff persists
 *     across turns and stacks with nothing (second hold on the same lone unit: still 3 Might).
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-283-298";
const BLUE_SENTINEL = "unl-087-219"; // 4 Might · your hold effects for holding here trigger an additional time

/** P2 is about to end turn 2; P1 controls the Pit (bf1) with the given units standing on it. */
function aboutToHold(units: { alias: string; might: number; buffed?: boolean }[]) {
  const b = scenario().turn(2).active(P2).battlefield("bf1", { controller: P1, def: CARD, inert: false });
  for (const u of units) {
    b.unit(P1, "bf1", { might: u.might, name: u.alias.toUpperCase() }, u.alias, u.buffed ? { buffed: true } : undefined);
  }
  return b;
}

describe("Navori Fighting Pit (ogn-283-298)", () => {
  test("hold with two units here: the trigger waits in the Beginning Phase for P1 to choose; only units HERE are offered (not the base); the chosen one gets the +1 buff", async () => {
    const game = await aboutToHold([
      { alias: "a", might: 2 },
      { alias: "b", might: 3 },
    ])
      .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1, source: { cardId: "bf1" } });
    const offered = (game.decision() as PickDecision).options.map((o) => o.key).sort();
    expect(offered).toEqual(["a", "b"]);
    expect(game.p1.points()).toBe(1); // the hold point is already scored while the trigger is pending
    await game.p1.pick("b");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("b")).toMatchObject({ baseMight: 3, isBuffed: true, might: 4 });
    expect(game.state("a")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.state("home").isBuffed).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // BUG — expected (471.2.b / 053.3 "here"): holding a SECOND, plain battlefield in the same Beginning
  // Phase is not "holding here", so exactly one Pit trigger goes on the chain and the unit at the other
  // battlefield is never a candidate. Actual: the battlefield's controller-scoped hold trigger ignores
  // its `location: "here"` and fires once per battlefield P1 holds (two Pit items on the chain).
  test("'When you hold HERE' — also holding another battlefield must not fire the Pit a second time; units there are never offered", async () => {
    const game = await aboutToHold([
      { alias: "a", might: 2 },
      { alias: "b", might: 3 },
    ])
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 1, name: "Elsewhere" }, "elsewhere")
      .build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(2); // both battlefields held
    expect(game.chain().filter((i) => i.cardId === "bf1")).toHaveLength(1);
    const offered = (game.decision() as PickDecision).options.map((o) => o.key).sort();
    expect(offered).toEqual(["a", "b"]);
    await game.p1.pick("a");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("a").isBuffed).toBe(true);
    expect(game.state("b").isBuffed).toBe(false);
    expect(game.state("elsewhere").isBuffed).toBe(false);
  });

  test("a single unit here is locked in without a prompt; the opponent gets priority on the chain before it resolves", async () => {
    const game = await aboutToHold([{ alias: "a", might: 2 }]).build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", targets: ["a"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("a").isBuffed).toBe(false); // nothing happens before resolution
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("a")).toMatchObject({ isBuffed: true, might: 3 });
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
  });

  test("choosing an already-buffed unit is legal but adds nothing (702.3.a): still one buff, still +1", async () => {
    const game = await aboutToHold([{ alias: "a", buffed: true, might: 2 }]).build();
    expect(game.state("a")).toMatchObject({ isBuffed: true, might: 3 });
    await game.advanceTurn();
    expect(game.state("a")).toMatchObject({ baseMight: 2, isBuffed: true, might: 3 });
  });

  test("buffed + unbuffed here: picking the unbuffed one is the line that gains Might (both end at +1)", async () => {
    const game = await aboutToHold([
      { alias: "vet", buffed: true, might: 3 },
      { alias: "rookie", might: 1 },
    ]).build();
    await game.p2.endTurn();
    const offered = (game.decision() as PickDecision).options.map((o) => o.key).sort();
    expect(offered).toEqual(["rookie", "vet"]); // a buffed unit is still a legal choice (426.1.c)
    await game.p1.pick("rookie");
    await game.settle();
    expect(game.state("rookie")).toMatchObject({ isBuffed: true, might: 2 });
    expect(game.state("vet")).toMatchObject({ isBuffed: true, might: 4 });
  });

  test("the buff is a counter, not a turn effect: it survives into the opponent's turn and a second hold on the same lone unit leaves it at exactly +1", async () => {
    const game = await aboutToHold([{ alias: "a", might: 2 }]).build();
    await game.advanceTurn(); // P1 holds → buff
    expect(game.state("a").might).toBe(3);
    await game.advanceTurn(); // P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("a")).toMatchObject({ isBuffed: true, might: 3 });
    await game.advanceTurn(); // P1 holds again
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.state("a")).toMatchObject({ isBuffed: true, might: 3 });
  });

  test("'you' is whoever holds: P2 controlling a Pit from P1's deck holds it on P2's turn and buffs P2's unit", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "bf1", { might: 2, name: "Enemy" }, "e")
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .build();
    await game.p1.endTurn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P2, targets: ["e"], triggered: true })]);
    await game.settle();
    expect(game.p2.points()).toBe(1);
    expect(game.state("e")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("mine").isBuffed).toBe(false);
    expect(game.p1.points()).toBe(0);
  });

  test("negative space — only YOUR Beginning Phase holds: across the opponent's turn nothing triggers and nobody is buffed", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false })
      .unit(P1, "bf1", { might: 2, name: "A" }, "a")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.state("a")).toMatchObject({ isBuffed: false, might: 2 });
  });

  test("negative space — conquering the Pit is not holding it: the conqueror scores but no buff trigger fires", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null, def: CARD, inert: false })
      .unit(P1, "base", { might: 2, name: "A" }, "a")
      .build();
    await game.p1.move("a", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("a")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("no unit here (control seeded with nobody standing on it): the hold still scores, but there is no legal target — no prompt, no chain item, nothing buffed", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false })
      .unit(P1, "base", { might: 2, name: "Home" }, "home")
      .build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.state("home").isBuffed).toBe(false);
  });

  test("partner — Blue Sentinel here doubles the hold effect: two Pit triggers, two separate choices, two different units buffed", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false })
      .unit(P1, "bf1", BLUE_SENTINEL, "bs")
      .unit(P1, "bf1", { might: 2, name: "A" }, "a")
      .build();
    await game.p2.endTurn();
    expect(game.chain().filter((i) => i.cardId === "bf1")).toHaveLength(2);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("a");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("bs");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("a")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("bs")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.p1.points()).toBe(1); // the hold point itself is never doubled
  });

  test("registry payload: one triggered ability — hold, by the controller, here — whose effect buffs one unit here", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Navori Fighting Pit" });
    expect(def?.abilities).toEqual([
      {
        effect: { target: { location: "here", type: "unit" }, type: "buff" },
        trigger: { event: "hold", location: "here", on: "controller" },
        type: "triggered",
      },
    ]);
  });
});
