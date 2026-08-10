/**
 * Ruling 5a03ae13391c54f7 — Ride the Wind (OGN-173 → ogn-173-298) · Action · [2][chaos] "Move a friendly unit and ready it."
 *   × Hextech Ray (ogn-009-298) / Gust (ogn-169-298, Reaction [1] "Return a unit at a battlefield with 3 [Might] or less to
 *     its owner's hand") — cited as ways to remove the enemy unit mid-combat instead.
 *
 * Q: During a showdown at battlefield A, I Ride the Wind one of my units to the EMPTY battlefield B. Do my damaged units heal
 *    from conquering B before they die in the combat at A?
 * A: No. Healing comes from the Combat Cleanup, not from conquering an empty battlefield. The combat at A finishes completely
 *    first (damaged units die there), and only then does the showdown at B begin and B get conquered. Removing the enemy
 *    unit during the combat (Ray/Gust) would instead end the combat and heal your units.
 * Rules: 466.1.a.1 (Combat Cleanup heals all units), 344 / 348 (a showdown staged elsewhere waits for the current one),
 *        466.3 / 466.5 (combat result → establish control → conquer), 142 (marked damage persists until healed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const GUST = "ogn-169-298";

/**
 * P1's turn, 0 points each. P2 holds bfA with a 3-Might Guard; bfB is empty and uncontrolled. P1's Rider (3) and Buddy (2)
 * are in base, BOTH already carrying 1 damage from earlier this turn. P1 holds Ride the Wind + Gust with exactly [3][chaos].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: null })
    .unit(P2, "bfA", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Rider" }, "rider", { damage: 1 })
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy", { damage: 1 })
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P1, GUST, "gust");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const bf = (game: Game, id: string) => game.gameState.battlefields[id];

/** Both P1 units attack bfA; in the showdown (P1 has Focus) P1 Rides the Wind the Rider over to the empty bfB. */
async function attackAThenRideToB(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["rider", "buddy"], "bfA");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfA", isCombatShowdown: true, focusPlayer: P1 });
  await game.p1.cast("rtw", { targets: "rider" });
  for (let i = 0; i < 6 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.key)).toContain("battlefield-bfB");
      await game.p1.pick("battlefield-bfB");
    } else if (d?.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  return game;
}

describe("Ruling 5a03ae13391c54f7 — moving to an empty battlefield mid-combat heals nothing; combat at A resolves first, then B is conquered", () => {
  test("after Ride the Wind resolves: Rider stands READY at bfB, but bfB is NOT conquered yet (still uncontrolled, no point) — the bfA combat is still the active showdown", async () => {
    const game = await attackAThenRideToB();
    expect(game.locationOf("rider")).toBe("bfB");
    expect(game.state("rider").isReady).toBe(true);
    expect(bf(game, "bfB")?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfA", isCombatShowdown: true });
  });

  test("…and nobody healed: Rider (at B) and Buddy (at A) both still carry their 1 damage — arriving at / 'taking' an empty battlefield is not a healing window", async () => {
    const game = await attackAThenRideToB();
    expect(game.state("rider").damage).toBe(1);
    expect(game.state("buddy").damage).toBe(1);
    expect(game.state("guard").damage).toBe(0);
  });

  test("sequence: the combat at A finishes FIRST — damaged Buddy (2 Might, 1 + 3 damage) dies there, Guard (took 2 < 3) survives and is healed, P2 keeps A — and only then does the showdown at B open", async () => {
    const game = await attackAThenRideToB();
    const r = await game.settle(); // both pass focus at A → combat damage → resolution; B's staged showdown is handed back once
    expect(game.zoneOf("buddy")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bfA");
    expect(game.state("guard").damage).toBe(0);
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P2 });
    if (r.reason === "open" && showdown(game)?.active) {
      // Now — after A is fully done — the non-combat showdown at B is what is open.
      expect(showdown(game)).toMatchObject({ battlefieldId: "bfB", isCombatShowdown: false });
      expect(game.p1.points()).toBe(0); // B not conquered before A resolved
      await game.settle();
    }
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    // B: only P1's Rider is there → P1 establishes control → Conquer → +1.
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P1 });
    expect(game.locationOf("rider")).toBe("bfB");
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    // The Rider WAS healed — by A's Combat Cleanup ("Heal all Units"), not by conquering B.
    expect(game.state("rider").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: removing the enemy unit during the combat instead (Gust the 3-Might Guard home) ends the combat with no defenders — Buddy survives, is healed by the Combat Cleanup, and P1 conquers A (then B): 2 points", async () => {
    const game = await attackAThenRideToB();
    // Focus went to P2 after the Ride the Wind chain; get it back to P1 and Gust the Guard.
    for (let i = 0; i < 4 && !(game.actingSeat() === P1 && game.p1.can("cast", "gust")); i++) {
      await game.acting().passFocus();
    }
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "guard" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("hand");
    const r = await game.settle();
    if (r.reason === "open" && showdown(game)?.active) {
      await game.settle();
    }
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.zoneOf("buddy")).toBe("battlefield-bfA");
    expect(game.state("buddy").damage).toBe(0); // healed by the combat ending
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
