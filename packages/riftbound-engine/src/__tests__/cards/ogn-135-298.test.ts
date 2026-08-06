/**
 * Pakaa Cub — ogn-135-298 · Unit · Body · 3 energy · 3 Might
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *
 * Rules: 811 Hidden — hide facedown for [rainbow] at a battlefield you control (no chain,
 * 811.1.c.2); from the next turn it gains [Reaction] and may be played ignoring its cost
 * (811.1.b / 811.6); a hidden permanent must be played to that battlefield (811.1.d.1);
 * it may instead be played normally for its cost (811.3).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-135-298";

function hideable() {
  return scenario()
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2 }, "holder")
    .hand(P1, CARD, "cub");
}

describe("Pakaa Cub (ogn-135-298)", () => {
  test("played normally: costs 3 energy, a 3-Might unit with the Hidden keyword; unaffordable at 2", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "cub").build();
    await game.p1.play("cub");
    await game.settle();
    expect(game.zoneOf("cub")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("cub").might).toBe(3);
    expect(game.state("cub").keywords).toContain("Hidden");
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "cub").build();
    expect(poor.p1.can("play", "cub")).toBe(false);
  });

  test("Hidden: hide for [rainbow] at a battlefield you control — facedown, no chain, not revealable this turn", async () => {
    const game = await hideable().build();
    await game.p1.hide("cub", "bf1");
    expect(game.zoneOf("cub")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("reveal", "cub")).toBe(false);
  });

  test("Hidden: cannot hide without a power to pay, nor at a battlefield you don't control", async () => {
    const noPower = await scenario().resources(P1, { energy: 3 }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "cub").build();
    expect(noPower.p1.can("hide", "cub")).toBe(false);
    const enemyBf = await scenario().resources(P1, { power: { rainbow: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, CARD, "cub").build();
    expect(enemyBf.p1.can("hide", "cub")).toBe(false);
  });

  test("from facedown on a later turn: played for 0 energy and enters AT THAT battlefield (811.1.d.1)", async () => {
    const game = await hideable().battlefield("bf2", { controller: P1 }).build();
    await game.p1.hide("cub", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    const energyBefore = game.p1.energy();
    await game.p1.reveal("cub");
    await game.settle();
    expect(game.zoneOf("cub")).toBe("battlefield-bf1");
    expect(game.p1.energy()).toBe(energyBefore);
    expect(game.state("cub").might).toBe(3);
  });

  test("gains [Reaction] while facedown: on the opponent's (next) turn it can be played in response on a chain (811.6)", async () => {
    const game = await hideable()
      .unit(P2, "base", { might: 2 }, "theirs")
      .hand(P2, "ogn-004-298", "cleave") // 1-energy Action spell for P2 to open a chain with
      .build();
    await game.p1.hide("cub", "bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.tapRune(); // pools empty at end of turn; P2 channeled 2 runes
    await game.p2.cast("cleave", { targets: "theirs" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "cub")).toBe(true);
    await game.p1.reveal("cub");
    await game.settle();
    expect(game.zoneOf("cub")).toBe("battlefield-bf1");
  });
});
