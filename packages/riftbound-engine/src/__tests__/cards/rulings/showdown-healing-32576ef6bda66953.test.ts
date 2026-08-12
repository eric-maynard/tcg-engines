/**
 * Ruling 32576ef6bda66953 — (no specific card) do units heal after a showdown?
 *
 * Q: Do units heal after a Showdown — both an Open (non-combat) Showdown and a Combat Showdown?
 * A: Only after a COMBAT showdown. Combat Cleanup heals every unit in play, whether or not it fought.
 *    A non-combat showdown (a contested battlefield where only one player has units) has no Combat
 *    Cleanup and heals nothing — that damage sits until the end-of-turn cleanup, where all units heal.
 * Rules: 466.1.a.1 / 461.1.a.1 (Combat Cleanup step 3c "Heal all Units"), 344.2 (non-combat showdown),
 *        317.2.b (Expiration Step heals all damage at the end of every turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

describe("Ruling 32576ef6bda66953 — healing happens after COMBAT, not after every showdown", () => {
  test("combat showdown: after combat damage every unit in play is healed — including units that never fought, at the base and at other battlefields", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 3, name: "Wall" }, "wall", { damage: 2 })
      .unit(P1, "base", { might: 5, name: "Medic" }, "medic", { damage: 3 })
      .unit(P1, "bf2", { might: 5, name: "Watcher" }, "watcher", { damage: 1 })
      .unit(P1, "base", { might: 6, name: "Raider" }, "raider", { damage: 1 })
      .build();
    expect([game.state("wall").damage, game.state("medic").damage, game.state("watcher").damage]).toEqual([2, 3, 1]);
    await game.p1.move("raider", "bf1");
    await game.settle();
    // the 6-Might attacker kills the 3-Might Wall and takes 3; then Combat Cleanup heals EVERYTHING
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.state("raider").damage).toBe(0);
    expect(game.state("medic").damage).toBe(0); // never fought, still healed
    expect(game.state("watcher").damage).toBe(0); // at a different battlefield, still healed
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("non-combat showdown: only one player has units there, so no Combat Cleanup runs and pre-existing damage survives the conquest", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 6, name: "Raider" }, "raider", { damage: 2 })
      .unit(P1, "base", { might: 5, name: "Medic" }, "medic", { damage: 3 })
      .build();
    await game.p1.move("raider", "bf1");
    // an open, non-combat showdown
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, isCombatShowdown: false });
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.state("raider").damage).toBe(2); // NOT healed
    expect(game.state("medic").damage).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("the damage that a non-combat showdown left behind is cleared at the end of the turn (317.2.b)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 6, name: "Raider" }, "raider", { damage: 2 })
      .unit(P2, "base", { might: 5, name: "Medic" }, "medic", { damage: 3 })
      .build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.state("raider").damage).toBe(2);
    await game.advanceTurn();
    expect(game.state("raider").damage).toBe(0);
    expect(game.state("medic").damage).toBe(0);
    expect(game.trace().expiration[0]?.steps).toContain("heal");
    expect(game.violations()).toEqual([]);
  });
});
