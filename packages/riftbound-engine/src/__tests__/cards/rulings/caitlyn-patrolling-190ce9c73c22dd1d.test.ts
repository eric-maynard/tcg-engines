/**
 * Ruling 190ce9c73c22dd1d — Caitlyn, Patrolling (OGN-068 → ogn-068-298) · Champion Unit · Calm · [3][calm] · 3 Might
 *   "I must be assigned combat damage last.
 *    [Exhaust]: Deal damage equal to my Might to a unit at a battlefield. Use this ability only while I'm at a battlefield."
 *
 * Q: How does Caitlyn work — does she deal and receive combat damage, or only one of the two? Does moving her
 *    to a battlefield (which taps her) trigger her ability?
 * A: She has two separate abilities. The first is a passive that only changes the ORDER of combat-damage
 *    assignment: she is assigned last, but she still deals and receives combat damage normally. The second is
 *    an ACTIVATED ability, not a triggered one — moving her (and thereby exhausting her as the move's cost)
 *    does nothing; you must activate it and pay its [Exhaust] cost yourself.
 * Rules: 144.2 (exhausting is the cost of a Standard Move), 379–380 vs 383.1 (activated vs triggered abilities),
 *        465.2.c.3/.c.6 (lethal before moving on; obey every assignment requirement).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CAITLYN = "ogn-068-298";

/** P1's turn. Caitlyn stands ready at her own bf1; P2's 5-Might Quarry holds bf2. */
function activationBoard() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", CAITLYN, "cait")
    .unit(P2, "bf2", { might: 5, name: "Quarry" }, "quarry");
}

/** P1's turn. Caitlyn ready in P1's base; bf1 is open; P2's Quarry holds bf2. */
function baseBoard() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", CAITLYN, "cait")
    .unit(P2, "bf2", { might: 5, name: "Quarry" }, "quarry");
}

/** P2's turn. P1 defends bf1 with Caitlyn (3) and optionally a plain 2-Might Ally; a Raider attacks from base. */
async function combat(raiderMight: number, withAlly: boolean): Promise<Game> {
  let b = scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CAITLYN, "cait");
  if (withAlly) {
    b = b.unit(P1, "bf1", { might: 2, name: "Ally" }, "ally");
  }
  const game = await b.unit(P2, "base", { might: raiderMight, name: "Raider" }, "raider").build();
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  return game;
}

describe("Ruling 190ce9c73c22dd1d — Caitlyn's two abilities: a damage-order passive and a costed activated ability", () => {
  test("premise: her first ability is a passive assignment requirement (parsed as [Backline]); she has no triggered ability at all", async () => {
    const game = await activationBoard().build();
    expect(game.state("cait")).toMatchObject({ baseMight: 3, keywords: expect.arrayContaining(["Backline"]) });
    expect(game.chain()).toEqual([]);
  });

  test("she DEALS combat damage: alone against a 2-Might Raider her 3 Might kills it and she survives the 2 she takes", async () => {
    const game = await combat(2, false);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("cait")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("…and she RECEIVES it too — 'assigned last' is not immunity: alone against a 4-Might Raider she is assigned all 4 and dies, while the Raider survives her 3", async () => {
    const game = await combat(4, false);
    expect(game.zoneOf("cait")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("the passive only reorders: a 3-Might Raider's damage must go lethally to the 2-Might Ally FIRST, so the Ally dies and Caitlyn — who would have died had she been assigned first — lives", async () => {
    const game = await combat(3, true);
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("cait")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash"); // 2 + 3 = 5 dealt back
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("ruling 190ce9c73c22dd1d — moving her to a battlefield exhausts her (the move's cost) but triggers NOTHING: no chain item, no damage dealt anywhere", async () => {
    const game = await baseBoard().build();
    expect(game.state("cait").isReady).toBe(true);
    await game.p1.move("cait", "bf1");
    expect(game.locationOf("cait")).toBe("bf1");
    expect(game.state("cait").isExhausted).toBe(true); // rule 144.2 — the move's cost, not an ability
    expect(game.chain()).toEqual([]);
    expect(game.state("quarry").damage).toBe(0);
    // …and having spent her ready state on the move, the [Exhaust] ability can no longer be paid for.
    expect(game.p1.can("activate", "cait")).toBe(false);
  });

  test("the second ability is ACTIVATED: with Caitlyn ready at a battlefield P1 must choose it, pay [Exhaust], and it deals damage equal to her Might (3) to a chosen unit at a battlefield", async () => {
    const game = await activationBoard().build();
    expect(game.state("quarry").damage).toBe(0); // nothing happens on its own
    expect(game.p1.can("activate", "cait")).toBe(true);
    await game.p1.activate("cait", 1, { targets: "quarry" });
    expect(game.state("cait").isExhausted).toBe(true); // the [Exhaust] cost was paid
    await game.settle();
    expect(game.state("quarry")).toMatchObject({ damage: 3, zone: "battlefield-bf2" });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("…and it may be used only while she is at a battlefield: from P1's base, ready, the ability is not available", async () => {
    const game = await baseBoard().build();
    expect(game.locationOf("cait")).toBe("base");
    expect(game.state("cait").isReady).toBe(true);
    expect(game.p1.can("activate", "cait")).toBe(false);
    expect((await game.p1.try((p) => p.activate("cait", 1, { targets: "quarry" }))).ok).toBe(false);
    expect(game.state("quarry").damage).toBe(0);
  });

  test("once used it stays used: exhausted, she cannot activate it a second time this turn", async () => {
    const game = await activationBoard().build();
    await game.p1.activate("cait", 1, { targets: "quarry" });
    await game.settle();
    expect(game.state("quarry").damage).toBe(3);
    expect(game.p1.can("activate", "cait")).toBe(false);
  });
});
