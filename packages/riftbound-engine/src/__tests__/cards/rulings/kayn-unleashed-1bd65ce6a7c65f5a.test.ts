/**
 * Ruling 1bd65ce6a7c65f5a — Kayn, Unleashed (OGN-189 → ogn-189-298, 6 Might, [Ganking])
 *   "If I have moved twice this turn, I don't take damage."
 *   × Flash (ogs-011-024, Reaction, 2) "Move up to 2 friendly units to base."
 *   × Ride the Wind (ogn-173-298, Action, 2 + [chaos]) "Move a friendly unit and ready it."
 *
 * Q: Defending with Kayn, can I Flash him away and Ride the Wind him back during the showdown to turn on his
 *    invulnerability — or does the showdown end / do I lose the battlefield the moment he leaves?
 * A: It works. A unit leaving mid-combat does not end the showdown; with combat ongoing you keep control of the
 *    battlefield even while it is empty (187.4.c). Kayn returns readied as the defender, has moved twice this turn,
 *    takes no damage, and the surviving attackers are recalled — you hold.
 * Rules: 187.4.c, 465 (combat continues while contested), 340/343 (Reaction on Focus; Action once you have Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAYN = "ogn-189-298";
const FLASH = "ogs-011-024";
const RIDE_THE_WIND = "ogn-173-298";

/** P2's turn. P1 holds bf1 with Kayn (6) alone; bf2 is open. P2's 7-Might Raider attacks from base. P1: Flash + Ride the Wind, exactly 4 energy + [chaos]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", KAYN, "kayn")
    .unit(P2, "base", { might: 7, name: "Raider" }, "raider")
    .hand(P1, FLASH, "flash")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks bf1; P2 (attacker, Focus first) passes; P1 Flashes Kayn to base and it resolves. */
async function flashKaynOut(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({
    active: true,
    battlefieldId: "bf1",
    isCombatShowdown: true,
  });
  expect(game.state("kayn").combatRole).toBe("defender");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("flash", { targets: "kayn" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Flash resolves
  expect(game.zoneOf("flash")).toBe("trash");
  return game;
}

/** With Focus back on P1: Ride the Wind Kayn to bf1 and let it resolve. */
async function rideKaynBack(game: Game): Promise<void> {
  // Focus passes to P2 after the chain; P2 passes it back.
  if (game.actingSeat() === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "rtw")).toBe(true); // an Action is playable while holding Focus
  await game.p1.cast("rtw", { targets: "kayn" });
  // The destination is P1's choice.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("bf1");
  await game.p1.passPriority();
  await game.p2.passPriority(); // Ride the Wind resolves
  expect(game.zoneOf("rtw")).toBe("trash");
}

describe("Ruling 1bd65ce6a7c65f5a — Kayn Flashed out and Ridden back mid-combat: showdown continues, control kept, no damage taken", () => {
  test("Move 1 (Flash): Kayn is in base, bf1 is EMPTY of defenders — yet the combat showdown is still open and P1 still controls bf1 (187.4.c)", async () => {
    const game = await flashKaynOut();
    expect(game.zoneOf("kayn")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(showdown(game)).toMatchObject({
      active: true,
      battlefieldId: "bf1",
      isCombatShowdown: true,
    });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0); // nothing was conquered by emptying the battlefield
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
  });

  test("Move 2 (Ride the Wind, once P1 has Focus again): Kayn arrives back at bf1 READY, as the defender, still inside the same showdown", async () => {
    const game = await flashKaynOut();
    await rideKaynBack(game);
    expect(game.zoneOf("kayn")).toBe("battlefield-bf1");
    expect(game.state("kayn")).toMatchObject({
      combatRole: "defender",
      isReady: true,
      location: "bf1",
    });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("result: Kayn has moved twice → takes no combat damage from the 7-Might Raider; the Raider (took 6, survives) is recalled to base and P1 keeps bf1", async () => {
    const game = await flashKaynOut();
    await rideKaynBack(game);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("kayn")).toBe("battlefield-bf1");
    expect(game.state("kayn").damage).toBe(0);
    expect(game.zoneOf("raider")).toBe("base"); // attackers that fail to clear the defenders go home
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if Kayn just stands and fights (moved 0 times) he takes 7 and dies; the Raider conquers bf1", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("kayn")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });
});
