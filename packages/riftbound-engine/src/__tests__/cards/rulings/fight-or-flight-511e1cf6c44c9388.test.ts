/**
 * Ruling 511e1cf6c44c9388 — Fight or Flight (OGN-168 → ogn-168-298) · Spell · Chaos · [2] · [Hidden] [Action]
 *   "Move a unit from a battlefield to its base."
 *   × Vengeance (OGN-229 → ogn-229-298) · Spell · [4][order][order] · "Kill a unit."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] · "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: Can a hidden Fight or Flight react to Vengeance (and save the unit)?
 * A: You may play it in response and it resolves first, moving the unit to base — but Vengeance targets "a unit"
 *    with no location requirement, so the unit is still a legal target in base and dies. Contrast Hidden Blade
 *    ("a unit at a battlefield"): moving the unit to base makes it an illegal target and the Blade fizzles.
 * Rules: LIFO chain resolution, 359.3.e.5 (targeting requirements re-checked on resolution), 811 (playing a
 *        hidden card as a Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const VENGEANCE = "ogn-229-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P1's turn. P2 holds bf1 with a 3-Might Runner (and a 2-Might Stayer) and has Fight or Flight facedown there
 * (hidden on an earlier turn). P1 holds the kill spell with exactly its cost.
 */
function board(spell: string, resources: { energy: number; power: Record<string, number> }) {
  return scenario()
    .resources(P1, resources)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "bf1", { might: 2, name: "Stayer" }, "stayer")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P1, spell, "spell");
}

/** P1 casts the spell at the Runner and passes; P2 reveals the hidden Fight or Flight choosing the Runner. */
async function castAndReact(game: Game): Promise<void> {
  await game.p1.cast("spell", { targets: "runner" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "fof")).toBe(true); // yes — the hidden card CAN be played in response
  await game.p2.reveal("fof");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  await game.p2.pick("runner");
  expect(game.chain().map((c) => c.cardId)).toEqual(["spell", "fof"]);
  expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // played from hidden for [0]
}

describe("Ruling 511e1cf6c44c9388 — hidden Fight or Flight can answer Vengeance but cannot save the unit", () => {
  test("Vengeance: Fight or Flight resolves first (Runner → P2's base), then Vengeance still finds its target in base and kills it", async () => {
    const game = await board(VENGEANCE, { energy: 4, power: { order: 2 } }).build();
    await castAndReact(game);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Fight or Flight resolves
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["spell"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Vengeance resolves
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("trash"); // no location restriction — still a legal target in base
    expect(game.zoneOf("stayer")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Hidden Blade ('a unit at a battlefield'): the same response makes the Runner an illegal target; the Blade fizzles, the Runner survives in base and nobody draws", async () => {
    const game = await board(HIDDEN_BLADE, { energy: 2, power: { order: 1 } }).build();
    const p2Hand = game.p2.hand().length;
    await castAndReact(game);
    await game.settle();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.p2.hand()).toHaveLength(p2Hand); // no "its controller draws 2"
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
