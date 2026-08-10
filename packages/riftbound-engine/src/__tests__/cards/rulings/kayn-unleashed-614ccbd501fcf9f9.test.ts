/**
 * Ruling 614ccbd501fcf9f9 — Kayn, Unleashed (OGN-189 → ogn-189-298) · 6 Might "[Ganking] If I have moved twice this turn, I don't
 *     take damage."
 *   × Flash (OGS-011 → ogs-011-024, Reaction [2]) "Move up to 2 friendly units to base."
 *   × Ride the Wind (OGN-173 → ogn-173-298, Action [2][chaos]) "Move a friendly unit and ready it."
 *
 * Q: I defend a battlefield with Kayn, Flash him to base during the attack, then Ride the Wind him back to the same battlefield.
 *    Is the attacker recalled, and do I score a conquest point?
 * A: The attacker IS recalled (both sides still have units at combat cleanup). You do NOT score: you controlled the battlefield
 *    the whole time, and conquering means gaining control of a battlefield you did not control when it became contested.
 *    Nuance: Flash a unit away and Ride the Wind it into an ongoing fight at a battlefield you did NOT control → as the defender's
 *    …/late arrival winning there you DO conquer and score.
 * Rules: 466.1.a.2 (recall attackers if defenders remain), 466.5 / 469.1 (establish control only if you didn't already → Conquer),
 *        187.4.c (control persists during combat even while empty), 465.2.c.10 (Kayn takes no damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAYN = "ogn-189-298";
const FLASH = "ogs-011-024";
const RIDE_THE_WIND = "ogn-173-298";

/** P2's turn, P1 3 pts / P2 2 pts. P1 holds bf1 with Kayn alone; bf2 is uncontrolled and empty. P2: Raider (7) and Scout (2) in base.
 *  P1: Flash + Ride the Wind with exactly [4][chaos]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .points(P1, 3)
    .points(P2, 2)
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", KAYN, "kayn")
    .unit(P2, "base", { might: 7, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, FLASH, "flash")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const bf = (game: Game, id: string) => game.gameState.battlefields[id];

/** Pass Focus around until `seat` holds it in the showdown. */
async function focusTo(game: Game, seat: string): Promise<void> {
  for (let i = 0; i < 4 && game.actingSeat() !== seat; i++) {
    await game.acting().passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat });
}

/** P1 (with Focus) Flashes Kayn to base and the chain resolves. */
async function flashKaynHome(game: Game): Promise<void> {
  await focusTo(game, P1);
  await game.p1.cast("flash", { targets: "kayn" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("flash")).toBe("trash");
  expect(game.zoneOf("kayn")).toBe("base");
}

/** P1 (with Focus) Rides the Wind Kayn to `dest` and the chain resolves. */
async function rideKaynTo(game: Game, dest: "bf1" | "bf2"): Promise<void> {
  await focusTo(game, P1);
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "kayn" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick(dest);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("kayn")).toBe(dest);
}

describe("Ruling 614ccbd501fcf9f9 — Kayn Flashed out and Ridden back to the battlefield he was defending: attacker recalled, no conquer point", () => {
  test("Raider attacks bf1; Kayn Flashes home and Rides back: he is the DEFENDER again, ready, has moved twice, and P1 controlled bf1 throughout (even while it stood empty)", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    await flashKaynHome(game);
    expect(bf(game, "bf1")?.controller).toBe(P1); // 187.4.c
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    await rideKaynTo(game, "bf1");
    expect(game.state("kayn")).toMatchObject({ combatRole: "defender", isReady: true, location: "bf1" });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(bf(game, "bf1")?.controller).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("combat resolves with both units present: Kayn takes no damage, the Raider (6 < 7) survives and is RECALLED to base during cleanup", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await flashKaynHome(game);
    await rideKaynTo(game, "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(showdown(game)).toBeUndefined();
    expect(game.state("kayn")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("raider")).toBe("base"); // 466.1.a.2
    expect(game.state("raider").damage).toBe(0);
  });

  test("…and P1 does NOT score: bf1 was P1's when it became contested and still is — nothing was conquered by either player (P1 stays 3, P2 stays 2)", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await flashKaynHome(game);
    await rideKaynTo(game, "bf1");
    await game.settle();
    expect(bf(game, "bf1")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(3);
    expect(game.p2.points()).toBe(2);
    expect(game.gameState.scoredThisTurn[P1] ?? []).toEqual([]);
    expect(game.gameState.conqueredThisTurn?.[P1] ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: P2's Scout walks onto the UNCONTROLLED bf2; P1 Flashes Kayn off bf1 and Rides him into bf2 — P2 attacks, Kayn defends a battlefield P1 did not control, wins, and P1 CONQUERS bf2 for a point on P2's turn", async () => {
    const game = await board().build();
    await game.p2.move("scout", "bf2");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf2" });
    expect(bf(game, "bf2")).toMatchObject({ contested: true, controller: null });
    await flashKaynHome(game);
    // Kayn left bf1 outside of any combat there → P1 loses the now-empty bf1 at the next cleanup; irrelevant to the point here.
    await rideKaynTo(game, "bf2");
    let r = await game.settle();
    for (let i = 0; i < 3 && r.reason === "open" && showdown(game)?.active; i++) {
      r = await game.settle();
    }
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.zoneOf("scout")).toBe("trash"); // 6 onto a 2
    expect(game.state("kayn")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(bf(game, "bf2")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(4); // conquered bf2 — a battlefield P1 did not control before
    expect(game.gameState.scoredThisTurn[P1] ?? []).toContain("bf2");
    expect(game.p2.points()).toBe(2);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
