/**
 * Ruling 58e6c7a56cbfa9db — (a defender who is briefly unit-less during a showdown; no specific card named)
 *   Stand-in: Flash (OGS-011 → ogs-011-024) · [Reaction] [2] "Move up to 2 friendly units to base." — the
 *   defender's way of emptying (and, with a second unit, re-filling) the contested battlefield.
 *
 * Q: If the defending player temporarily has no units at the battlefield during a showdown (they moved them out
 *    and back with card effects), does the opponent conquer, or does the original showdown continue?
 * A: The showdown continues and the defender keeps control throughout. Control is not re-evaluated while a
 *    showdown is ongoing there, so an empty moment costs nothing; conquest can only happen once the whole
 *    combat resolves.
 * Rules: 190.4.b (control is not lost while a Showdown/Combat is ongoing at that battlefield), 323.6 (control
 *        lapses only at an OPEN-State Cleanup), 348.1 (the showdown ends only when all players pass Focus in
 *        succession), 466.5 (control is established at the Resolution Step).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";

/** P1's turn. P2 holds bf1 with a Warden (3) and keeps a Reserve (4) in base plus Flash and [2]. P1 attacks with a Raider (5). */
function board() {
  return scenario()
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Warden" }, "warden")
    .unit(P2, "base", { might: 4, name: "Reserve" }, "reserve")
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P2, FLASH, "flash");
}

/** P1 attacks; P2 Flashes its only defender home, leaving bf1 with no P2 unit while the showdown is open. */
async function defenderVacated(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
  await game.p1.passFocus();
  await game.p2.cast("flash", { targets: "warden" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.locationOf("warden")).toBe("base");
  return game;
}

describe("Ruling 58e6c7a56cbfa9db — an empty moment during the showdown neither loses control nor ends the combat", () => {
  test("with zero defending units at bf1 the battlefield is STILL the defender's, and the showdown is still open", async () => {
    const game = await defenderVacated();
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown" });
    expect(game.p1.points()).toBe(0);
  });

  test("the attacker cannot conquer in that gap — control only changes when the whole combat has resolved", async () => {
    const game = await defenderVacated();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    await game.settle();
    // Only now, with the showdown closed and the lone attacker left standing, does bf1 change hands.
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("contrast — the same emptying move with NO showdown ongoing costs the battlefield immediately: control lapses in that very Cleanup", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Warden" }, "warden")
      .hand(P2, FLASH, "flash")
      .build();
    await game.p2.cast("flash", { targets: "warden" });
    await game.settle();
    expect(game.locationOf("warden")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});
