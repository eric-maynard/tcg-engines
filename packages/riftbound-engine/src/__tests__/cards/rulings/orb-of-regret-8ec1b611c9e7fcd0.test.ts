/**
 * Ruling 8ec1b611c9e7fcd0 — how Gears enter the board, and how many copies you may have.
 *   Cards: Orb of Regret (OGN-090 → ogn-090-298) gear, 1 — "[Exhaust]: Give a unit -1 [Might] this
 *     turn, to a minimum of 1 [Might]."
 *   × Iron Ballista (OGN-017 → ogn-017-298) gear, 3 — "This enters exhausted. [Exhaust]: Deal 2 to a
 *     unit at a battlefield." (the card that "specifies otherwise")
 *
 * Q: Do Gears come in tapped, and may I have more than one copy of the same Gear out?
 * A: They enter READY (so an [Exhaust] ability is usable the same turn), and you may have any number
 *    of copies of the same Gear on the board unless the card itself says otherwise.
 * Rules: 175/430.2.a (permanents enter ready unless told otherwise), 355 (playing a gear),
 *    no uniqueness rule for gears.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ORB = "ogn-090-298";
const BALLISTA = "ogn-017-298";

function board() {
  return scenario()
    .resources(P1, { energy: 9 })
    .battlefield("bf1", { controller: P1 })
    .unit(P2, "bf1", { might: 5, name: "Enemy" }, "enemy")
    .hand(P1, ORB, "orb1")
    .hand(P1, ORB, "orb2")
    .hand(P1, BALLISTA, "ballista");
}

describe("Ruling 8ec1b611c9e7fcd0 — Gears enter ready, and duplicates are fine", () => {
  test("a Gear enters READY", async () => {
    const game = await board().build();
    await game.p1.play("orb1");
    await game.settle();
    expect(game.zoneOf("orb1")).toBe("base");
    expect(game.state("orb1")).toMatchObject({ isExhausted: false, isReady: true });
  });

  test("being ready means its [Exhaust] ability is usable the same turn it was played", async () => {
    const game = await board().build();
    await game.p1.play("orb1");
    await game.settle();
    expect(game.p1.can("activate", "orb1")).toBe(true);
    await game.p1.activate("orb1", 0, { answers: ["enemy"] });
    await game.settle();
    expect(game.state("orb1").isExhausted).toBe(true);
    expect(game.state("enemy").might).toBe(4);
  });

  test("a SECOND copy of the same Gear may be played — both sit on the board, both ready", async () => {
    const game = await board().build();
    await game.p1.play("orb1");
    await game.settle();
    await game.p1.play("orb2");
    await game.settle();
    expect(game.p1.gear().sort()).toEqual(["orb1", "orb2"]);
    expect(game.state("orb1").defId).toBe(game.state("orb2").defId);
    expect(game.state("orb2").isExhausted).toBe(false);
  });

  test("both copies work independently — each has its own [Exhaust]", async () => {
    const game = await board().build();
    await game.p1.play("orb1");
    await game.settle();
    await game.p1.play("orb2");
    await game.settle();
    await game.p1.activate("orb1", 0, { answers: ["enemy"] });
    await game.settle();
    await game.p1.activate("orb2", 0, { answers: ["enemy"] });
    await game.settle();
    expect(game.state("enemy").might).toBe(3); // 5 - 1 - 1
    expect(game.state("orb1").isExhausted).toBe(true);
    expect(game.state("orb2").isExhausted).toBe(true);
  });

  test("nuance — a card may say otherwise: Iron Ballista's own text makes it enter exhausted", async () => {
    const game = await board().build();
    await game.p1.play("ballista");
    await game.settle();
    expect(game.zoneOf("ballista")).toBe("base");
    expect(game.state("ballista")).toMatchObject({ isExhausted: true, isReady: false });
    expect(game.p1.can("activate", "ballista")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
