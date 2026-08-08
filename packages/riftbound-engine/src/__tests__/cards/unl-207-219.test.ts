/**
 * Amateur Recital — unl-207-219 · Battlefield
 *
 *   When you hold here, you may move a unit at a battlefield to its base.
 *
 * Rules: 469.2 / 315.2.b (Hold: keep control during YOUR Beginning Phase → 1 point, then hold abilities
 * trigger — 471.2.b), 190.6.d ("you" = the battlefield's controller), 449 (an ability may cause a Move;
 * this is a Move, not a Recall — 455/456.1 — so "When I move" abilities fire), 141.1.a.1 ("its base" =
 * the unit's own side's base), 190.4.c (a battlefield left with no units of its controller becomes
 * uncontrolled at the next cleanup), 383.4.d.2.c (the hold point is already scored when this resolves).
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. "a unit at a battlefield" is ANY unit at ANY battlefield — enemy units elsewhere included; units in
 *      a base and facedown cards are not candidates.
 *   2. Pulling the opponent's lone Squatter home empties their battlefield: they lose control of it (and
 *      the facedown card hidden there is binned), it is NOT a recall (the unit keeps its exhausted state; a "When I move" unit triggers), and next to
 *      nothing stops P1 from walking in and conquering it the same turn.
 *   3. Choosing your own Holder is legal: it goes home, the Recital goes uncontrolled, the point stays.
 *   4. "you may": declining changes nothing. Only YOUR hold, only HERE.
 *   Partner used: Treasure Hunter (sfd-130-221, "When I move, play a Gold gear token exhausted").
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-207-219";
const TREASURE_HUNTER = "sfd-130-221";
const FACEDOWN_FILLER = "ogn-175-298";

/** End of P2's turn 2. P1 holds the Recital (live) with Holder; P2 holds bf2 with an exhausted Squatter (+ a facedown card); both have a base unit. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("recital", { controller: P1, def: CARD, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "recital", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 1, name: "My Homebody" }, "myHome")
    .unit(P2, "bf2", { might: 4, name: "Squatter" }, "squatter", { exhausted: true })
    .unit(P2, "base", { might: 1, name: "Their Homebody" }, "theirHome")
    .facedown(P2, "bf2", FACEDOWN_FILLER, "secret");
}

describe("Amateur Recital (unl-207-219)", () => {
  test("registry payload: optional hold-here trigger for the controller; effect moves a unit at a battlefield to base", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Amateur Recital" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: { target: { location: "battlefield", type: "unit" }, to: "base", type: "move" },
      optional: true,
      trigger: { event: "hold", location: "here", on: "controller" },
      type: "triggered",
    });
    // "a unit" — no friendly/enemy restriction may have crept in.
    expect((abilities[0]?.effect as { target: { controller?: string } }).target.controller).toBeUndefined();
  });

  test("holding the Recital scores 1, puts its trigger on the chain under P1 and asks P1 'you may'", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "recital", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "recital" } });
  });

  test("yes → the candidates are exactly the units at battlefields (own Holder here, enemy Squatter elsewhere) — no base units, no facedown card", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.yes();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["holder", "squatter"]);
  });

  test("moving the enemy Squatter: it lands in P2's base still exhausted and still P2's; bf2 goes uncontrolled; P1 keeps exactly the hold point", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.p1.pick("squatter");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("squatter")).toBe("base");
    expect(game.p2.units("base").sort()).toEqual(["squatter", "theirHome"]);
    expect(game.state("squatter")).toMatchObject({ controller: P2, isExhausted: true, might: 4, owner: P2 });
    expect(game.gameState.battlefields.bf2?.controller ?? null).toBeNull();
    expect(game.zoneOf("secret")).toBe("trash"); // P2 lost bf2 → its facedown card is removed at cleanup (Hidden, 811)
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test("follow-through: with bf2 emptied, P1's 1-Might Homebody walks in unopposed and conquers it the same turn (2 points total)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.p1.pick("squatter");
    await game.settle();
    await game.p1.move("myHome", "bf2");
    await game.settle();
    expect(game.locationOf("myHome")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  test("choosing your own Holder is legal: it goes home, the Recital is left uncontrolled, the hold point stays", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.p1.pick("holder");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("holder")).toBe("base");
    expect(game.gameState.battlefields.recital?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(1);
  });

  test("it is a MOVE, not a recall (449 vs 456.1): pulling an enemy Treasure Hunter home fires its 'When I move' — P2 gets a Gold token", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("recital", { controller: P1, def: CARD, inert: false })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "recital", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "bf2", TREASURE_HUNTER, "hunter")
      .build();
    expect(game.p2.gear()).toEqual([]);
    await game.p2.endTurn();
    await game.p1.yes();
    await game.p1.pick("hunter");
    await game.settle();
    expect(game.zoneOf("hunter")).toBe("base");
    expect(game.p2.gear().map((g) => game.state(g).name)).toEqual(["Gold"]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("'you may' — declining moves nothing and the turn proceeds to the main phase with the point kept", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.no();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.locationOf("squatter")).toBe("bf2");
    expect(game.locationOf("holder")).toBe("recital");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.points()).toBe(1);
  });

  test("only YOUR hold: at the start of P2's turn a P1-held Recital asks nobody anything and nothing moves", async () => {
    const game = await board().turn(3).active(P1).build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()?.kind).not.toBe("yes-no");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.locationOf("squatter")).toBe("bf2");
    expect(game.locationOf("holder")).toBe("recital");
    expect(game.p2.points()).toBe(1); // P2's plain hold of bf2
    expect(game.p1.points()).toBe(0);
  });

  test("only HERE: P1 holding some other battlefield while P2 controls the Recital gets no prompt", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("recital", { controller: P2, def: CARD, inert: false })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "recital", { might: 2 }, "theirs")
      .unit(P1, "bf2", { might: 2 }, "mine")
      .build();
    await game.p2.endTurn();
    expect(game.decision()?.kind).not.toBe("yes-no");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("theirs")).toBe("recital");
    expect(game.locationOf("mine")).toBe("bf2");
  });

  test("Conquer is not Hold: taking the empty Recital on your turn scores but offers no move", async () => {
    const game = await scenario()
      .battlefield("recital", { controller: null, def: CARD, inert: false })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "walker")
      .unit(P2, "bf2", { might: 2 }, "squatter")
      .build();
    await game.p1.move("walker", "recital");
    await game.settle();
    expect(game.gameState.battlefields.recital?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("squatter")).toBe("bf2");
  });
});
