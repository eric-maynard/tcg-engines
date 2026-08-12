/**
 * Ruling b99b6883ff65ebc8 — Carnivorous Snapvine (OGN-149 → ogn-149-298) · Unit · [5][body][body] · 6 Might
 *   "When you play me, choose an enemy unit at a battlefield. We deal damage equal to our Mights to each other."
 *
 * Q: Does the "when you play me" effect trigger when the unit is played from hand, or also when it is moved
 *    to a battlefield?
 * A: Only on being PLAYED from hand. Moving a unit already on the board is a different game action and never
 *    triggers a "when you play me" ability.
 * Rules: 355 (playing a card), 420 (moving is its own game action), 411.4 / 383.4 ("when you play me").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SNAPVINE = "ogn-149-298";

/** P2 holds bf1 with a 4-Might unit; bf2 is neutral and empty. */
function boards() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 4, name: "Bramblewatch" }, "prey");
}

describe("Ruling b99b6883ff65ebc8 — Snapvine's play trigger fires on the play, never on a move", () => {
  test("played from hand: the fight happens — the 4-Might enemy dies and Snapvine keeps 4 damage", async () => {
    const game = await boards().hand(P1, SNAPVINE, "vine").build();
    await game.p1.play("vine");
    await game.settle();
    expect(game.zoneOf("vine")).toBe("base");
    expect(game.zoneOf("prey")).toBe("trash"); // 6 ≥ 4
    expect(game.state("vine").damage).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("the same Snapvine already on board, MOVED to a battlefield, triggers nothing", async () => {
    const game = await boards().unit(P1, "base", SNAPVINE, "vine").build();
    expect(game.state("prey").damage).toBe(0);
    await game.p1.move("vine", "bf2");
    await game.settle();
    expect(game.locationOf("vine")).toBe("bf2");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("prey")).toBe("battlefield-bf1"); // untouched
    expect(game.state("prey").damage).toBe(0);
    expect(game.state("vine").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("nor does moving it to the enemy battlefield itself — the damage there is ordinary combat, not the play trigger", async () => {
    const game = await boards().unit(P1, "base", SNAPVINE, "vine").build();
    await game.p1.move("vine", "bf1");
    expect(game.chain()).toEqual([]); // no "when you play me" item was queued by the move
    expect(game.state("prey").damage).toBe(0); // …and no fight has happened yet either
    expect(game.state("vine").combatRole).toBe("attacker");
  });
});
