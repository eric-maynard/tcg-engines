/**
 * Vayne, Hunter — ogn-035-298 · Unit (Champion, Vayne) · Fury · 4 energy + 1 fury · 2 Might
 *
 *   [Assault 3] (+3 [Might] while I'm an attacker.)
 *   If an opponent controls a battlefield, I enter ready.
 *   When I conquer, you may pay [1] to return me to my owner's hand.
 *
 * Rules: 807 (Assault = "+X Might while attacker"), 142.4 (lethal damage ≥ Might),
 * 466.1.a.1 (heal all units in the combat cleanup), 143.4 / 369.3 (enter ready).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-035-298";

function attack(foeMight: number, energy = 2) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "vayne")
    .unit(P2, "bf1", { might: foeMight }, "foe");
}

describe("Vayne, Hunter (ogn-035-298)", () => {
  test("Assault 3: as an attacker she deals 5 damage (kills a 5-Might defender)", async () => {
    const game = await attack(5).build();
    expect(game.state("vayne").keywords).toContain("Assault");
    await game.p1.move("vayne", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
  });

  test.failing("BUG: Assault 3 also raises her own lethal threshold — attacking a 4-Might unit she survives (5 Might vs 4 damage) and conquers", async () => {
    // Expected (807.1.c + 142.4.b): while attacking Vayne has 5 Might, 4 damage is not lethal; combat cleanup heals her.
    // Actual: the engine adds Assault to damage dealt but checks lethality against her printed 2 Might → she dies.
    const game = await attack(4).build();
    await game.p1.move("vayne", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("vayne")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Assault does not apply while defending: a 3-Might attacker kills her (2 Might) and survives", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "vayne")
      .unit(P2, "base", { might: 3 }, "foe")
      .build();
    await game.p2.move("foe", "bf1");
    await game.settle();
    expect(game.zoneOf("vayne")).toBe("trash");
    expect(game.locationOf("foe")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("enters ready if an opponent controls a battlefield; costs 4 energy + 1 fury", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .hand(P1, CARD, "vayne")
      .build();
    await game.p1.play("vayne");
    await game.settle();
    expect(game.zoneOf("vayne")).toBe("base");
    expect(game.state("vayne").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } });
  });

  test.failing("BUG: enters exhausted when NO opponent controls a battlefield (rule 143.4)", async () => {
    // Expected: the enter-ready static is conditional; with bf1 uncontrolled she enters exhausted.
    // Actual: the engine cannot evaluate the `opponent-controls` condition and treats it as always true.
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1 } })
      .battlefield("bf1", { controller: null })
      .hand(P1, CARD, "vayne")
      .build();
    await game.p1.play("vayne");
    await game.settle();
    expect(game.zoneOf("vayne")).toBe("base");
    expect(game.state("vayne").isExhausted).toBe(true);
  });

  test("not playable without the fury power or with only 3 energy", async () => {
    const noFury = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "vayne").build();
    expect(noFury.p1.can("play", "vayne")).toBe(false);
    const low = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "vayne").build();
    expect(low.p1.can("play", "vayne")).toBe(false);
  });

  test("When I conquer: paying [1] returns her to her owner's hand", async () => {
    const game = await attack(1).build();
    await game.p1.move("vayne", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("vayne")).toBe("hand");
    expect(game.state("vayne").owner).toBe(P1);
    expect(game.p1.energy()).toBe(1);
    // She left, but the conquer already happened: control/points stand.
    expect(game.p1.points()).toBe(1);
  });

  test("When I conquer: declining keeps her on the battlefield and spends nothing", async () => {
    const game = await attack(1).build();
    await game.p1.move("vayne", "bf1");
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.locationOf("vayne")).toBe("bf1");
    expect(game.p1.energy()).toBe(2);
  });

  test("When I conquer with 0 energy: [1] cannot be paid, so she stays", async () => {
    const game = await attack(1, 0).build();
    await game.p1.move("vayne", "bf1");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      // "yes" must not be a legal resolution without the energy.
      const t = await game.p1.try((p) => p.yes());
      expect(t.ok).toBe(false);
      await game.p1.no();
      await game.settle();
    }
    expect(game.locationOf("vayne")).toBe("bf1");
    expect(game.p1.energy()).toBe(0);
  });
});
