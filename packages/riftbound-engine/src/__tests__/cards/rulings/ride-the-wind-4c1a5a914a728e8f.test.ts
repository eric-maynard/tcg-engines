/**
 * Ruling 4c1a5a914a728e8f — Ride the Wind (OGN-173 → ogn-173-298)
 *   "[Action] Move a friendly unit and ready it."
 *
 * Q: My opponent is conquering one battlefield and I Ride the Wind a unit onto a different, empty
 *    battlefield. Which showdown resolves first?
 * A: The one already in progress. Riding into the empty battlefield only CONTESTS it — that showdown is
 *    staged and waits; it begins once the first showdown has finished completely.
 * Rules: 323.12–323.13 (a staged showdown opens only in an Open-State Cleanup, one at a time),
 *        190.3.a (arriving applies Contested), 344.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** P2 raids P1's bf1; bf2 sits empty and uncontrolled; P1 holds a rider and Ride the Wind. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 8, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Wanderer" }, "wanderer")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

describe("Ruling 4c1a5a914a728e8f — the showdown already in progress finishes before the staged one begins", () => {
  test("step by step: bf2 is contested but its showdown waits until bf1's combat has completely resolved", async () => {
    const game = await board().build();

    await game.p2.move("raider", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
    await game.p2.passFocus();

    await game.p1.cast("rtw", { answers: ["bf2"], targets: ["wanderer"] });
    await game.p1.passPriority();
    await game.p2.passPriority();

    // 1. The Wanderer has arrived and CONTESTED bf2 — but bf2's showdown has not started
    //    (no `controllerAtShowdownStart` yet) and Focus is still being passed at bf1.
    expect(game.locationOf("wanderer")).toBe("bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.gameState.battlefields.bf2).not.toHaveProperty("controllerAtShowdownStart");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, showdownComplete: false });
    expect(game.state("wanderer").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });

    // 2. Finish the first showdown: both pass Focus, combat resolves, the raider dies.
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1, showdownComplete: true });

    // 3. ONLY NOW does the staged showdown at bf2 begin.
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, controllerAtShowdownStart: null });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });

    // 4. It closes with P1 the sole occupant ⇒ P1 conquers bf2.
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1); // bf2 conquered; defending bf1 scored nothing
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control: with no first showdown running, the same Ride the Wind opens bf2's showdown straight away", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 4, name: "Wanderer" }, "wanderer")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();

    await game.p1.cast("rtw", { answers: ["bf2"], targets: ["wanderer"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, controllerAtShowdownStart: null });
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
