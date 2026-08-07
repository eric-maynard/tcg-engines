/**
 * Blitzcrank, Impassive — ogn-067-298 · Champion Unit · Calm · 5 energy + 1 [calm] · 5 Might
 *
 *   [Tank] (I must be assigned combat damage first.)
 *   When you play me to a battlefield, you may move an enemy unit to here.
 *   When I hold, return me to my owner's hand.
 *
 * Rules: 815 (Tank), 383.3.a (leading "you may" → optional trigger, chosen on
 * resolution), 383.4.d (Hold effects trigger when you score for holding in your
 * Beginning Phase).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-067-298";

function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "base", { might: 1 }, "homebody")
    .unit(P2, "bf2", { might: 2 }, "raider")
    .hand(P1, CARD, "blitz");
}

describe("Blitzcrank, Impassive (ogn-067-298)", () => {
  test("costs 5 energy + 1 calm; a 5-Might unit with Tank", async () => {
    const game = await board().build();
    await game.p1.play("blitz", { to: "base" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("blitz")).toBe("base");
    expect(game.state("blitz").might).toBe(5);
    expect(game.state("blitz").keywords).toContain("Tank");
    const noCalm = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "blitz").build();
    expect(noCalm.p1.can("play", "blitz")).toBe(false);
  });

  test("played to a battlefield: trigger goes on the chain, you may pick any enemy unit and it moves here", async () => {
    const game = await board().build();
    await game.p1.play("blitz", { to: "bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" && d.options.map((o) => o.card).sort()).toEqual(["homebody", "raider"]);
    await game.p1.pick("raider");
    // rule 402 (finalization): the target is picked on the chain; the move happens when the item resolves.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.locationOf("homebody")).toBe("base");
    expect(game.locationOf("blitz")).toBe("bf1");
  });

  test("'you may': declining leaves every enemy unit where it was", async () => {
    const game = await board().build();
    await game.p1.play("blitz", { to: "bf1" });
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.locationOf("raider")).toBe("bf2");
    expect(game.locationOf("homebody")).toBe("base");
  });

  test("played to base: the ability does not trigger at all", async () => {
    const game = await board().build();
    await game.p1.play("blitz", { to: "base" });
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.locationOf("raider")).toBe("bf2");
  });

  test("When I hold: P1 scores the hold point and Blitzcrank returns to its owner's hand", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "blitz")
      .build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("blitz")).toBe("hand");
    expect(game.state("blitz").owner).toBe(P1);
  });
});
