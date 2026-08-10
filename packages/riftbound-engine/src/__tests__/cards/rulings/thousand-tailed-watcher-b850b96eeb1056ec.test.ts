/**
 * Ruling b850b96eeb1056ec — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · 7 + [mind] · 7 Might
 *   "[Accelerate] … When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Brush (UNL-T03 → unl-t03) · Battlefield · "Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might]. …"
 *
 * Q: How does the Watcher's -3 interact with units getting +1 from a Brush?
 * A: The Watcher's ability is a one-shot snapshot: on resolution it reduces each enemy unit's CURRENT Might by 3, floored
 *    at 1 — if the unit already has the Brush bonus, that bonus is part of the value reduced. A unit that gains the Brush
 *    +1 AFTER the Watcher resolved just adds it on top of its reduced Might (1 + 1 = 2); the floor is not re-applied.
 * Rules: 358 (one-shot effect applied at resolution), 476 / 522 (a static battlefield aura applies continuously),
 *        710 (Might evaluation; modifications are cumulative).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const BRUSH = "unl-t03";
const RIDE_THE_WIND = "ogn-173-298";
const PORO = { might: 2, name: "Test Poro", tags: ["Poro"] } as const;

/**
 * P1's turn with 7 + [mind]. The Brush battlefield is P2's, held by a tagless Holder (4). P2: a 2-Might Poro AT the Brush
 * ("poroHere", reads 3) and another 2-Might Poro in base ("poroHome"); Ride the Wind in hand + 2 + [chaos]. P1: Scout (1).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("brush", { controller: P2, def: BRUSH, inert: false })
    .unit(P2, "brush", { might: 4, name: "Holder" }, "holder")
    .unit(P2, "brush", PORO, "poroHere")
    .unit(P2, "base", PORO, "poroHome")
    .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
    .hand(P1, WATCHER, "watcher")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

async function watcherResolved(): Promise<Game> {
  const game = await board().build();
  expect(game.state("poroHere")).toMatchObject({ might: 3, staticMightBonus: 1 }); // 2 + Brush
  expect(game.state("poroHome").might).toBe(2);
  expect(game.state("holder").might).toBe(4); // tagless: no Brush bonus
  await game.p1.play("watcher");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", triggered: true })]);
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("watcher")).toBe("base");
  return game;
}

describe("Ruling b850b96eeb1056ec — Watcher's -3 snapshot vs the Brush's continuous +1", () => {
  test("'buffed battlefield' case: the Poro already at the Brush is reduced from its CURRENT 3 (2 + 1) → floored at 1; the Poro in base 2 → 1; the tagless Holder 4 → 1", async () => {
    const game = await watcherResolved();
    expect(game.state("poroHere").might).toBe(1);
    expect(game.state("poroHome").might).toBe(1);
    expect(game.state("holder").might).toBe(1);
    expect(game.state("watcher").might).toBe(7);
  });

  test("'buffing later' case: the base Poro (now 1) is Ridden onto the Brush during a showdown this turn — the Brush +1 lands on top of the reduced value: 1 + 1 = 2 (the minimum-1 floor is not re-applied)", async () => {
    const game = await watcherResolved();
    // P1's Scout walks into the Brush → combat showdown, P1 has Focus and passes it to P2.
    await game.p1.move("scout", "brush");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "rtw")).toBe(true);
    await game.p2.cast("rtw", { targets: "poroHome" });
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick("battlefield-brush");
        continue;
      }
      if (game.chain().length === 0 || d?.kind !== "action") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("poroHome")).toBe("brush");
    expect(game.state("poroHome")).toMatchObject({ might: 2, staticMightBonus: 1 });
    // The Poro that was already there is unchanged by any of this.
    expect(game.state("poroHere").might).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("not a persistent aura: next turn every reduction is gone — the Brush Poros read 3 again, the Holder 4", async () => {
    const game = await watcherResolved();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("poroHere").might).toBe(3);
    expect(game.state("poroHome").might).toBe(2);
    expect(game.state("holder").might).toBe(4);
  });
});
