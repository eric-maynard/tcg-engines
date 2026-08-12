/**
 * Ruling 589063d41362874e — (no specific card) does leaving a battlefield end a showdown?
 *   Stand-in: Fight or Flight (ogn-168-298) · [Hidden] [Action] [2] — "Move a unit from a battlefield to its base."
 *
 * Q: Does my unit leaving the battlefield end the showdown?
 * A: No. A showdown ends only when every player passes Focus in succession without starting a chain — it
 *    does not matter whether one or both players still have units there. Players keep their play
 *    opportunities, and a combat showdown still runs its damage calculation and combat cleanup.
 * Rules: 347.2 / 348 (a showdown closes on consecutive Focus passes only), 344 (showdowns), 466.1–466.5
 *        (Resolution Step runs regardless; 466.5.b nobody left ⇒ Uncontrolled), 190.4.b (control is frozen
 *        while a showdown/combat is ongoing there).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";

/** [Reaction] "Kill a unit." */
const SNIPE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Snipe",
  rulesText: "[Reaction] Kill a unit.",
  timing: "reaction",
} as const;

/** [Reaction] "Deal 1 to a unit." */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, FIGHT_OR_FLIGHT, "fof")
    .hand(P1, STING, "sting")
    .hand(P2, SNIPE, "snipe");
}

describe("Ruling 589063d41362874e — leaving a battlefield does NOT end a showdown", () => {
  test("the attacker walks its own unit home mid-showdown: the showdown is still active with nobody of P1 there, and Focus/priority carry on normally", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, defendingPlayer: P2 });
    await game.p1.cast("fof", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Fight or Flight resolves
    expect(game.locationOf("raider")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
    // the showdown did NOT end
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  });

  test("play opportunities survive: with no attacking unit left, the defender may still start a chain, and both players must still pass Focus", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("fof", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    expect(game.p2.can("cast", "snipe")).toBe(true);
    await game.p2.cast("snipe", { targets: "wall" }); // even their own last unit
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(showdown(game)?.active).toBe(true); // still not over — nobody has units here at all
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("closing still needs consecutive Focus passes; the combat showdown then runs its Resolution Step and, with nobody left, the battlefield ends up Uncontrolled (466.5.b)", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("fof", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.cast("snipe", { targets: "wall" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    // one pass is not enough
    await game.p1.passFocus();
    expect(showdown(game)).toMatchObject({ active: true, passedPlayers: [P1] });
    await game.p2.passFocus();
    await game.settle();
    expect((game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active)).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the defender's last unit dying mid-showdown does not end it either — combat still resolves and the surviving attacker conquers", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    await game.p2.cast("snipe", { targets: "wall" }); // defender removes its own defender
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(showdown(game)?.active).toBe(true);
    // 190.4.b: control is frozen at P2 while the combat is ongoing there
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
