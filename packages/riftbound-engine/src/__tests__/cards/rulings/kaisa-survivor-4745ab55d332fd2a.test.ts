/**
 * Ruling 4745ab55d332fd2a — Kai'Sa, Survivor (ogn-039-298) · Unit/Champion · Fury · [4] · 4 Might
 *   "[Accelerate] … When I conquer, draw 1."
 *
 * Q: Does Kai'Sa have to survive the combat in which you conquer to draw a card?
 * A: Yes. A permanent's triggered ability only enters the chain if the permanent is still on the board at
 *    the moment the trigger condition happens. Conquering is settled in the Combat Resolution Step, after
 *    lethal units have been trashed — a Kai'Sa who died in that combat draws nothing.
 * Rules: 466.1 (Combat Cleanup trashes lethal units) → 466.5.d (Conquer), 383.1/383.2 (a triggered
 *        ability of a permanent needs the permanent on the board when the event happens), 471.2.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KAISA = "ogn-039-298";

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

describe("Ruling 4745ab55d332fd2a — Kai'Sa must be standing when the conquer happens", () => {
  test("she survives and conquers: the trigger fires and P1 draws", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt")
      .unit(P1, "base", KAISA, "kaisa")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.zoneOf("kaisa")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand().length).toBe(handBefore + 1);
  });

  test("she dies during the combat but an ally still conquers: the battlefield is taken and the point scored, yet NO card is drawn", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P1, "base", KAISA, "kaisa")
      .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
      .hand(P2, SNIPE, "snipe")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move(["kaisa", "brute"], "bf1");
    await game.p1.passFocus();
    await game.p2.cast("snipe", { targets: "kaisa" });
    await game.settle();
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // the conquer still happened
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand().length).toBe(handBefore); // …but Kai'Sa was not there to see it
    expect(game.violations()).toEqual([]);
  });

  test("mutual destruction: nobody is left, nobody conquers, and there is no draw either", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P1, "base", KAISA, "kaisa")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand().length).toBe(handBefore);
    expect(game.violations()).toEqual([]);
  });

  test("the trigger is hers alone: an ally conquering while Kai'Sa sits in the base draws nothing", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt")
      .unit(P1, "base", KAISA, "kaisa")
      .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("brute", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("kaisa")).toBe("base");
    expect(game.p1.hand().length).toBe(handBefore);
    expect(game.violations()).toEqual([]);
  });
});
