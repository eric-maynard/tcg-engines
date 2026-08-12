/**
 * Ruling e92c663ce86cab67 — Tryndamere, Barbarian (OGN-034 → ogn-034-298) · Unit · Fury · 8 Might · [7][fury][fury]
 *   "When I conquer after an attack, if you assigned 5 or more excess damage to enemy units, you score 1 point."
 *
 * Q: Does Tryndamere score the extra point when he walks onto an EMPTY battlefield with no enemy units?
 * A: No. Walking onto an empty battlefield is not a combat showdown — Tryndamere is never an attacker and no
 *    combat damage is assigned, so the "conquer AFTER AN ATTACK / excess damage" trigger never applies. He
 *    still takes the battlefield and scores the ordinary 1 point for conquering it, but nothing extra.
 * Rules: 464.2.c.3 (no Attacker designation when arriving at an empty battlefield), 460 (combat only exists in
 *        a showdown), 465.2 (excess damage is assigned during the Combat Damage Step), 467/471.2 (Conquer scores 1).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TRYNDAMERE = "ogn-034-298";

describe("Ruling e92c663ce86cab67 — no combat means no excess damage, so Tryndamere's bonus point never fires", () => {
  test("premise: Tryndamere has 8 Might and the battlefield he walks onto is empty and uncontrolled", async () => {
    const game = await scenario()
      .victoryScore(20)
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", TRYNDAMERE, "trynd")
      .build();
    expect(game.state("trynd").might).toBe(8);
    expect(game.cardsAt("battlefield-bf1")).toEqual([]);
  });

  test("ruling: he conquers the empty battlefield and scores exactly 1 — the ordinary conquer point, not 2", async () => {
    const game = await scenario()
      .victoryScore(20)
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", TRYNDAMERE, "trynd")
      .build();
    await game.p1.move("trynd", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("intermediate fact: he was never an attacker there — no combat role was ever assigned", async () => {
    const game = await scenario()
      .victoryScore(20)
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", TRYNDAMERE, "trynd")
      .build();
    await game.p1.move("trynd", "bf1");
    expect(game.state("trynd").combatRole).not.toBe("attacker");
    await game.settle();
    expect(game.state("trynd").combatRole).not.toBe("attacker");
    expect(game.gameState.damageLog ?? []).toEqual([]); // no damage was assigned at all
  });

  test("same for taking over a battlefield an opponent CONTROLS but has no units on: still no attack, still just 1", async () => {
    const game = await scenario()
      .victoryScore(20)
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", TRYNDAMERE, "trynd")
      .build();
    await game.p1.move("trynd", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("contrast: a real attack with 5+ excess damage DOES pay the bonus — 8 Might into a 1-Might defender scores 2", async () => {
    const game = await scenario()
      .victoryScore(20)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Wall" }, "wall")
      .unit(P1, "base", TRYNDAMERE, "trynd")
      .build();
    await game.p1.move("trynd", "bf1");
    expect(game.state("trynd").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2); // 1 for the conquer + 1 from Tryndamere
    expect(game.violations()).toEqual([]);
  });

  test("contrast: an attack whose excess damage is under 5 pays only the ordinary point", async () => {
    const game = await scenario()
      .victoryScore(20)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Bulwark" }, "bulwark")
      .unit(P1, "base", TRYNDAMERE, "trynd")
      .build();
    await game.p1.move("trynd", "bf1");
    await game.settle();
    expect(game.zoneOf("bulwark")).toBe("trash");
    expect(game.p1.points()).toBe(1); // only 3 excess
  });
});
