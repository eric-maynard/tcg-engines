/**
 * Carnivorous Snapvine — ogn-149-298 · Unit · Body · 5 energy + [body][body] · 6 Might
 *
 *   When you play me, choose an enemy unit at a battlefield. We deal damage equal to our
 *   Mights to each other.
 *
 * Rules: 383 (play trigger goes on the chain), 355.10.b ("at a battlefield" is a targeting
 * restriction — enemy units in a base are not choosable), 142.4 (lethal damage ≥ Might kills
 * at the next cleanup). Damage is dealt by the two units to each other (as Challenge).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-149-298";

/** One enemy unit of `might` at bf1, an enemy in base, a friendly in base; Snapvine in hand. */
function board(might: number) {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might, name: "Target" }, "target")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 2, name: "Friend" }, "friend")
    .hand(P1, CARD, "vine");
}

describe("Carnivorous Snapvine (ogn-149-298)", () => {
  test("costs 5 energy + 2 body power; a 6-Might unit; the play trigger goes on the chain", async () => {
    const game = await board(4).build();
    await game.p1.play("vine");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("vine")).toBe("base");
    expect(game.state("vine").might).toBe(6);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vine", controller: P1, triggered: true })]);
  });

  test("unaffordable with only 1 body power or 4 energy", async () => {
    const onePower = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, CARD, "vine").build();
    expect(onePower.p1.can("play", "vine")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 4, power: { body: 2 } }).hand(P1, CARD, "vine").build();
    expect(lowEnergy.p1.can("play", "vine")).toBe(false);
  });

  test("a 4-Might enemy at a battlefield: it takes 6 and dies; Snapvine takes 4 and survives; base units untouched", async () => {
    const game = await board(4).build();
    await game.p1.play("vine");
    await game.settle();
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.zoneOf("vine")).toBe("base");
    expect(game.state("vine").damage).toBe(4);
    expect(game.state("home").damage).toBe(0);
    expect(game.state("friend").damage).toBe(0);
  });

  test("a 7-Might enemy: Snapvine takes 7 and dies; the enemy takes 6 and survives", async () => {
    const game = await board(7).build();
    await game.p1.play("vine");
    await game.settle();
    expect(game.zoneOf("vine")).toBe("trash");
    expect(game.zoneOf("target")).toBe("battlefield-bf1");
    expect(game.state("target").damage).toBe(6);
  });

  test("equal Mights (6 vs 6): both die", async () => {
    const game = await board(6).build();
    await game.p1.play("vine");
    await game.settle();
    expect(game.zoneOf("vine")).toBe("trash");
    expect(game.zoneOf("target")).toBe("trash");
  });

  test.failing("BUG: with several enemy units at battlefields the controller CHOOSES which one (only battlefield enemies offered)", async () => {
    // Expected: a pick prompt for P1 listing exactly the two enemy units at battlefields (not the
    // enemy in base, not the friendly unit). Actual: the engine silently auto-targets the first
    // legal unit and resolves without ever asking.
    const game = await board(4).battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 7, name: "Big" }, "big").build();
    await game.p1.play("vine");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" && d.options.map((o) => o.card).sort()).toEqual(["big", "target"]);
    await game.p1.pick("big");
    await game.settle();
    expect(game.zoneOf("vine")).toBe("trash");
    expect(game.state("big").damage).toBe(6);
    expect(game.zoneOf("target")).toBe("battlefield-bf1");
  });

  test("with no enemy unit at any battlefield the trigger does nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 2 } })
      .unit(P2, "base", { might: 1 }, "home")
      .hand(P1, CARD, "vine")
      .build();
    await game.p1.play("vine");
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("vine")).toBe("base");
    expect(game.state("vine").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
  });
});
