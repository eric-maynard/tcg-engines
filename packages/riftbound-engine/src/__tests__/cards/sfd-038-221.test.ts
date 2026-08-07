/**
 * Ribbon Dancer — sfd-038-221 · Unit · Calm · 3 energy (no power) · 3 Might
 *
 *   When I move to a battlefield, give another friendly unit +1 [Might] this turn.
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. Only moves whose DESTINATION is a battlefield trigger (rule 447): base→bf, bf→bf (Ganking)
 *      yes; bf→base no; being PLAYED to the board is not a move (446.2).
 *   2. "another friendly unit" — never herself; anywhere on the board (base or any battlefield);
 *      never an enemy. Alone on the board the trigger has no legal target and does nothing.
 *   3. Moving together with an ally into combat: the +1 lands before combat damage and changes
 *      the outcome (5 v 5 mutual wipe → 6 v 5 conquer).
 *   4. Moved by a spell (Ride the Wind) rather than the Standard Move still triggers (449).
 *   5. "this turn" — the bonus is gone after the turn ends (game.advanceTurn()).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-038-221";
const RIDE_THE_WIND = "ogn-173-298"; // [Action] 2 + [chaos]: Move a friendly unit and ready it.

function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", CARD, "dancer")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall");
}

describe("Ribbon Dancer (sfd-038-221)", () => {
  test("registry payload: one triggered ability — on self move-to-battlefield, +1 Might (turn) to another friendly unit", async () => {
    const game = await scenario().hand(P1, CARD, "dancer").build();
    expect(game.state("dancer")).toMatchObject({ baseMight: 3, cardType: "unit", energyCost: 3, name: "Ribbon Dancer" });
    expect(game.state("dancer").powerCost).toEqual([]);
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([
      {
        effect: { amount: 1, duration: "turn", target: { controller: "friendly", excludeSelf: true, type: "unit" }, type: "modify-might" },
        trigger: { event: "move-to-battlefield", on: "self" },
        type: "triggered",
      },
    ]);
  });

  test("cost: 3 energy, enters the base exhausted; playing her is not a move, so nothing triggers; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "dancer").build();
    await game.p1.play("dancer");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("dancer")).toBe("base");
    expect(game.state("dancer").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.state("ally").might).toBe(2);
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "dancer").build();
    expect(poor.p1.can("play", "dancer")).toBe(false);
  });

  test("moving alone to an open battlefield triggers; the only other friendly unit (in base) gets +1 Might, she does not", async () => {
    const game = await board().build();
    await game.p1.move("dancer", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dancer", controller: P1, triggered: true })]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
      await game.settle();
    }
    expect(game.locationOf("dancer")).toBe("bf1");
    expect(game.state("ally").might).toBe(3);
    expect(game.state("dancer").might).toBe(3);
    expect(game.state("wall").might).toBe(5);
  });

  test("'this turn': the +1 Might expires when the turn ends", async () => {
    const game = await board().build();
    await game.p1.move("dancer", "bf1");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
      await game.settle();
    }
    expect(game.state("ally").might).toBe(3);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("ally").might).toBe(2);
  });

  test("with several friendly units the controller chooses; enemies and herself are never offered", async () => {
    const game = await board().battlefield("bf3", { controller: P1 }).unit(P1, "bf3", { might: 1, name: "Far" }, "far").build();
    await game.p1.move("dancer", "bf1");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["ally", "far"]); // a friendly unit at ANOTHER battlefield is fine; wall/dancer are not
    await game.p1.pick("far");
    await game.settle();
    expect(game.state("far").might).toBe(2);
    expect(game.state("ally").might).toBe(2);
  });

  test("moving from a battlefield back to base does NOT trigger", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "dancer")
      .unit(P1, "base", { might: 2 }, "ally")
      .build();
    await game.p1.move("dancer", "base");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.locationOf("dancer")).toBe("base");
    expect(game.state("ally").might).toBe(2);
  });

  test("no other friendly unit on the board: the trigger finds no target and she stays 3 Might", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "dancer").build();
    await game.p1.move("dancer", "bf1");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      // A prompt with herself as an option would be a bug; an empty optional prompt may be declined.
      expect((game.decision() as { options: unknown[] }).options).toEqual([]);
      await game.p1.decline();
      await game.settle();
    }
    expect(game.state("dancer").might).toBe(3);
    expect(game.locationOf("dancer")).toBe("bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("another friendly unit's move does not trigger her ability", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("ally").might).toBe(2);
    expect(game.state("dancer").might).toBe(3);
  });

  test("moving WITH an ally into an enemy battlefield: the +1 resolves before combat and turns a mutual wipe into a conquer", async () => {
    // 3 + 2 = 5 into a 5-Might defender: everyone dies, nobody conquers. With the trigger the ally is 3,
    // attackers total 6: Wall dies, Wall's 5 damage can kill only one attacker, the survivor conquers bf2.
    const game = await board().build();
    await game.p1.move(["dancer", "ally"], "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dancer", triggered: true })]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
      await game.settle();
    }
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.units("bf2").length).toBe(1);
    expect(game.p1.points()).toBe(1);
  });

  test("control: the same attack without Ribbon Dancer's text (two vanilla 3+2) wipes and conquers nothing", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "plain")
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf2", { might: 5 }, "wall")
      .build();
    await game.p1.move(["plain", "ally"], "bf2");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("plain")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("Ganking from one battlefield to another is a move to a battlefield and triggers again", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf3", { controller: null })
      .unit(P1, "bf1", CARD, "dancer", { grantedKeywords: [{ duration: "permanent", keyword: "Ganking" }] })
      .unit(P1, "base", { might: 2 }, "ally")
      .build();
    expect(game.p1.can("gank", "dancer")).toBe(true);
    await game.p1.gank("dancer", "bf3");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dancer", triggered: true })]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
      await game.settle();
    }
    expect(game.locationOf("dancer")).toBe("bf3");
    expect(game.state("ally").might).toBe(3);
  });

  test("moved by a spell (Ride the Wind) instead of the Standard Move — still 'moves to a battlefield' and triggers", async () => {
    const game = await board().resources(P1, { energy: 2, power: { chaos: 1 } }).hand(P1, RIDE_THE_WIND, "rtw").build();
    await game.p1.cast("rtw", { targets: "dancer" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-bf1");
    // The move happened mid-resolution; her trigger is now pending / on the chain.
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
      await game.settle();
    }
    expect(game.locationOf("dancer")).toBe("bf1");
    expect(game.state("dancer").isReady).toBe(true);
    expect(game.state("ally").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
