/**
 * Ruling 3d229da68c3c6e68 — Yone, Blademaster (SFD-116 → sfd-116-221) · Unit · 5 Might
 *   "[Weaponmaster] — When I conquer a battlefield that was uncontrolled, deal damage equal to my Might to an
 *    enemy unit in a base."
 *
 * Q: For Yone's errata, what counts as an "uncontrolled" battlefield?
 * A: One that no player controls at the moment he moves in (rule 184.2.b: a battlefield is controlled by a
 *    specific player or by no one). Move Yone to such a battlefield and establish control by the end of the
 *    showdown and the ability triggers. A battlefield an OPPONENT controls is not uncontrolled, so conquering
 *    it from them does not trigger him.
 * Rules: 184.2.b (controlled / controlled by no one), 184.3.a (moving in makes it contested), 184.4 (control is
 *        established at the end of the showdown / combat), 464.1 (conquer).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const YONE = "sfd-116-221";

/** P1's turn. bf1 is controlled by NOBODY and empty; bf2 is P2's, held by a 2-Might Defender. P2 also has a Grunt in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Defender" }, "def")
    .unit(P2, "base", { might: 6, name: "Grunt" }, "grunt")
    .unit(P1, "base", YONE, "yone");
}

describe("Ruling 3d229da68c3c6e68 — 'uncontrolled' means controlled by no one at the time Yone moves in", () => {
  test("setup: bf1 has no controller at all; bf2 has P2 as its controller", async () => {
    const game = await board().build();
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  test("ruling: conquering the UNCONTROLLED bf1 triggers Yone — 5 damage to an enemy unit in a base", async () => {
    const game = await board().build();
    await game.p1.move("yone", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("grunt").damage).toBe(5);
    expect(game.p1.points()).toBe(1); // conquer
    expect(game.violations()).toEqual([]);
  });

  test("ruling: taking bf2 from P2 is also a conquer, but bf2 was CONTROLLED — no trigger, no damage", async () => {
    const game = await board().build();
    await game.p1.move("yone", "bf2");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // still a conquer
    expect(game.state("grunt").damage).toBe(0); // …but the battlefield was not uncontrolled
    expect(game.violations()).toEqual([]);
  });

  test("nuance: a battlefield whose seeded controller holds no unit there has LAPSED to uncontrolled, so Yone's trigger fires when he takes it", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 }) // seeded control with no P2 unit present → lapses at the first Open Cleanup
      .unit(P2, "base", { might: 6, name: "Grunt" }, "grunt")
      .unit(P1, "base", YONE, "yone")
      .build();
    await game.p1.move("yone", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("grunt").damage).toBe(5);
    expect(game.violations()).toEqual([]);
  });
});
