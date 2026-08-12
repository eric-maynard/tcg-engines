/**
 * Ruling 3e4999ac60026bdb — Ride the Wind (OGN-173 → ogn-173-298)
 *   "[Action] Move a friendly unit and ready it."
 *
 * Q: If I Ride the Wind out of a contested battlefield I control and then ride back into the SAME
 *    showdown, do I score when I win?
 * A: No. You never lost control while the combat was running, so winning is a successful DEFENCE, not a
 *    conquest — no point. (Surprise defence is different: riding into a battlefield you did NOT control
 *    at the start of the combat and winning IS a conquest and does score.)
 * Rules: 190.4.b (control is frozen while a showdown/combat is ongoing there), 466.5 / 471.2.c
 *        (a score needs control you did not already have).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

describe("Ruling 3e4999ac60026bdb — riding out and back into the same combat defends, it does not conquer", () => {
  test("P1 keeps control while its only defender is away, comes back, wins — and scores nothing", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 4, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 8, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, RIDE_THE_WIND, "rtw1")
      .hand(P1, RIDE_THE_WIND, "rtw2")
      .build();

    await game.p2.move("raider", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    await game.p2.passFocus();

    // Ride the lone defender home.
    await game.p1.cast("rtw1", { answers: ["base"], targets: ["guard"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("guard")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
    // Control is FROZEN for the duration of the combat: P1 still controls bf1 with nothing on it.
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P1, showdownComplete: false });

    // Ride back into the SAME combat and win it.
    await game.p2.passFocus();
    await game.p1.cast("rtw2", { answers: ["bf1"], targets: ["guard"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("guard").combatRole).toBe("defender");

    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0); // defended, not conquered
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("surprise defence DOES score: riding into a battlefield P1 did not control and winning is a conquest", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 8, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();

    await game.p2.move("raider", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    await game.p2.passFocus();

    await game.p1.cast("rtw", { answers: ["bf1"], targets: ["guard"] });
    await game.settle();

    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // control gained ⇒ conquest ⇒ a point
    expect(game.violations()).toEqual([]);
  });
});
