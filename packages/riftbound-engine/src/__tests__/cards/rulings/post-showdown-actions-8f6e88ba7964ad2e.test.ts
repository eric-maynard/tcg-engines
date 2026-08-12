/**
 * Ruling 8f6e88ba7964ad2e — (no specific card) what you may do after a showdown closes.
 *
 * Q: Can I summon units to my base and move them to battlefields after a showdown ends, in the same turn?
 * A: Yes. A showdown does not end your turn. Base-speed cards (units, plain spells) are locked out only
 *    WHILE the showdown or a chain is running; once it closes you are back in an Open State and may
 *    play and move freely, opening as many further showdowns as you have ready units for.
 * Rules: 155 (base speed = your turn, Open State, nothing on the chain), 344.2 (each arrival stages a
 *        showdown), 323 (the Action Phase has no fixed sub-steps), 190.4 (a move only needs a ready unit).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VANILLA = { cardType: "unit", domain: "fury", energyCost: 1, might: 3, name: "Test Recruit" } as const;

/** P1's turn. bf1 held by P2 (something to fight), bf2 open. P1: a Raider in base and a unit in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2")
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .hand(P1, VANILLA, "recruit");
}

describe("Ruling 8f6e88ba7964ad2e — the turn continues after a showdown: summon, then move again", () => {
  test("DURING the showdown the base-speed unit is not playable", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown" });
    expect(game.p1.can("play", "recruit")).toBe(false);
    expect((await game.p1.try((p) => p.play("recruit"))).ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("AFTER it closes, base-speed plays and further moves resume: a unit is summoned and a second showdown is opened the same turn", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");

    expect(game.p1.can("play", "recruit")).toBe(true);
    await game.p1.play("recruit"); // summoning to base works again
    expect(game.zoneOf("recruit")).toBe("base");

    await game.p1.move("scout", "bf2"); // …and a second showdown opens, same turn
    await game.settle();
    expect(game.locationOf("scout")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2); // both battlefields conquered this turn
    expect(game.violations()).toEqual([]);
  });

  test("caveat the ruling glosses over: the unit you just summoned entered EXHAUSTED, so it cannot move until it readies", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    await game.p1.play("recruit");
    expect(game.state("recruit").isExhausted).toBe(true); // 143.4
    expect((await game.p1.try((p) => p.move("recruit", "bf2"))).ok).toBe(false);
    await game.advanceTurn();
    await game.advanceToTurnOf(P1);
    expect(game.state("recruit").isReady).toBe(true);
    await game.p1.move("recruit", "bf2");
    await game.settle();
    expect(game.locationOf("recruit")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("moving costs no runes — a ready unit is the whole requirement, and an exhausted one cannot move", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0 })
      .battlefield("bf1")
      .battlefield("bf2")
      .unit(P1, "base", { might: 3, name: "Ready" }, "ready")
      .unit(P1, "base", { might: 3, name: "Tired" }, "tired", { exhausted: true })
      .build();
    expect(game.p1.energy()).toBe(0);
    expect((await game.p1.try((p) => p.move("tired", "bf1"))).ok).toBe(false);
    await game.p1.move("ready", "bf1");
    await game.settle();
    expect(game.locationOf("ready")).toBe("bf1");
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
