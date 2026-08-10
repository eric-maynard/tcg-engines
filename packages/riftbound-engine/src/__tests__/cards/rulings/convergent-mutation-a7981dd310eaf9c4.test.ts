/**
 * Ruling a7981dd310eaf9c4 — Convergent Mutation (OGN-108 → ogn-108-298) · Reaction · [2][mind] · "Choose a friendly unit. This turn,
 *     increase its Might to the Might of another friendly unit."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might · "When you play a spell, give me +1 [Might] this turn."
 *   × Tideturner (OGN-199 → ogn-199-298) · 2 Might
 *
 * Q: Convergent Mutation with Ravenbloom Student as one of the two units — final Mights?
 * A: The spell resolves completely first (target set to the reference unit's CURRENT Might); only then is Ravenbloom's "when you
 *    play a spell" trigger added and resolved (+1). So: Tideturner (2) → Ravenbloom (4): Tideturner 4, then Ravenbloom 5.
 *    Ravenbloom (2) → Tideturner (2): Ravenbloom 2, then its trigger makes it 3.
 * Rules: 419.4.a (spell "played" on resolution), 383.2.c, 359.2, 477.3 (increase-to uses the value at resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CONVERGENT_MUTATION = "ogn-108-298";
const RAVENBLOOM = "ogn-103-298";
const TIDETURNER = "ogn-199-298";

/** P1's turn with [2][mind]. Ravenbloom (optionally already +2 this turn → 4) and Tideturner (2) in P1's base. */
function board(ravenBoost: number) {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .unit(P1, "base", RAVENBLOOM, "raven", ravenBoost > 0 ? { mightModifier: ravenBoost } : {})
    .unit(P1, "base", TIDETURNER, "tide")
    .unit(P2, "base", { might: 3, name: "Bystander" }, "bystander")
    .hand(P1, CONVERGENT_MUTATION, "cm");
}

const ravenTriggers = (game: Game) => game.chain().filter((c) => c.cardId === "raven" && c.triggered).length;

describe("Ruling a7981dd310eaf9c4 — Convergent Mutation resolves fully, THEN Ravenbloom Student's spell trigger adds +1", () => {
  test("Tideturner (2) targeted to match Ravenbloom (4): while the spell is on the chain Ravenbloom has NOT triggered; on resolution Tideturner becomes 4; then the trigger appears and resolves → Ravenbloom 5, Tideturner stays 4", async () => {
    const game = await board(2).build();
    expect(game.state("raven").might).toBe(4);
    expect(game.state("tide").might).toBe(2);
    await game.p1.cast("cm", { targets: ["tide", "raven"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cm"]);
    expect(ravenTriggers(game)).toBe(0); // not "played" until it resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // Convergent Mutation resolves
    expect(game.zoneOf("cm")).toBe("trash");
    expect(game.state("tide").might).toBe(4);
    expect(game.state("raven").might).toBe(4); // trigger pending, not resolved
    expect(ravenTriggers(game)).toBe(1);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("raven").might).toBe(5);
    expect(game.state("tide").might).toBe(4); // set from the value at resolution; does not follow Ravenbloom up
    expect(game.violations()).toEqual([]);
  });

  test("Ravenbloom (2) targeted to match Tideturner (2): the spell leaves Ravenbloom at 2, then its own trigger resolves → 3; Tideturner untouched at 2", async () => {
    const game = await board(0).build();
    expect(game.state("raven").might).toBe(2);
    await game.p1.cast("cm", { targets: ["raven", "tide"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raven").might).toBe(2);
    expect(ravenTriggers(game)).toBe(1);
    await game.settle();
    expect(game.state("raven")).toMatchObject({ might: 3 });
    expect(game.state("tide").might).toBe(2);
  });

  test("'this turn': next turn both are printed 2 again", async () => {
    const game = await board(2).build();
    await game.p1.cast("cm", { targets: ["tide", "raven"] });
    await game.settle();
    expect(game.state("tide").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("tide").might).toBe(2);
    expect(game.state("raven").might).toBe(2);
  });
});
