/**
 * Ruling 34eb6277ca749a78 — Iron Ballista (OGN-017 → ogn-017-298) · Gear · 3 energy ·
 *   "This enters exhausted. / [Exhaust]: Deal 2 to a unit at a battlefield."
 *
 * Q: Does playing a gear (like Ballista) start a chain, and do its activated abilities start a chain?
 * A: Playing a gear does start a chain, but because it is a PERMANENT nobody receives priority before it
 *    resolves — it just arrives. Activating an ability on a gear also starts a chain, and that one has
 *    the normal priority window.
 * Rules: 333 / 337 (playing a card / activating an ability creates a chain item), 341 (a permanent's own
 *        play resolves without a priority window), 376–378 (activated abilities), 340 (priority).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BALLISTA = "ogn-017-298";

describe("Ruling 34eb6277ca749a78 — a gear's play resolves with no priority window; its activated ability gets one", () => {
  test("playing the Ballista lands it on the board immediately — the opponent never gets priority and the chain is empty afterwards", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, BALLISTA, "ballista").build();
    await game.p1.play("ballista");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ballista")).toBe("base");
    expect(game.state("ballista").isExhausted).toBe(true); // its own "enters exhausted" static
    expect(game.p1.energy()).toBe(0);
    // Still P1's open main phase — P2 was never handed a decision.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("activating [Exhaust]: Deal 2 DOES start a chain, and P2 gets priority before the damage happens", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
      .gear(P1, BALLISTA, "ballista")
      .build();
    await game.p1.activate("ballista");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ballista", controller: P1 })]);
    expect(game.state("guard").damage).toBe(0); // nothing has happened yet
    expect(game.state("ballista").isExhausted).toBe(true); // the cost is paid up front
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
