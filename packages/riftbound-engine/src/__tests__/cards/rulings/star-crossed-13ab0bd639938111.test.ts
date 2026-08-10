/**
 * Ruling 13ab0bd639938111 — Star-Crossed (UNL-128 → unl-128-219) · Spell · Chaos · 3+[chaos] · Reaction
 *   "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: My opponent plays Star-Crossed [their unit, my unit]; in response I kill THEIR unit before it resolves.
 *    Do I still have to return my unit?
 * A: Yes. Star-Crossed does not fizzle: it resolves as much as it can. The instruction on the now-gone target is
 *    ignored, but my unit is still a legal target and IS returned to my hand.
 * Rules: 359.3.e.8 (multi-target instruction with fewer than all targets unavailable still executes on the rest),
 *        336–340 (LIFO), 359.3.e.5.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";
/** P1's Reaction-speed removal: deal 5 to a unit. */
const SMITE = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Smite (Reaction)",
  timing: "reaction",
} as const;

/**
 * P2's turn (the Star-Crossed player). P2: Pawn (2) in base. P1: Knight (4) holding bf1, Smite in hand.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Knight" }, "knight")
    .unit(P2, "base", { might: 2, name: "Pawn" }, "pawn")
    .hand(P2, STAR_CROSSED, "sc")
    .hand(P1, SMITE, "smite");
}

/** P2 Star-Crosses [pawn (friendly), knight (enemy)] and passes; P1 Smites the Pawn in response. Chain = [sc, smite]. */
async function starCrossedThenSmite(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("sc", { targets: ["pawn", "knight"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", controller: P2, targets: ["pawn", "knight"] })]);
  await game.p2.passPriority();
  expect(game.p1.can("cast", "smite")).toBe(true);
  await game.p1.cast("smite", { targets: "pawn" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["sc", "smite"]);
  return game;
}

describe("Ruling 13ab0bd639938111 — killing Star-Crossed's enemy-side target in response does not save your own unit", () => {
  test("LIFO: Smite resolves first and kills the Pawn while Star-Crossed still waits on the chain", async () => {
    const game = await starCrossedThenSmite();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Smite resolves
    expect(game.zoneOf("smite")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sc"]);
    expect(game.locationOf("knight")).toBe("bf1");
  });

  test("Star-Crossed then resolves as much as it can: the dead Pawn stays in P2's trash (not returned), but P1's Knight IS returned to P1's hand (359.3.e.8)", async () => {
    const game = await starCrossedThenSmite();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p2.hand()).not.toContain("pawn");
    expect(game.zoneOf("knight")).toBe("hand");
    expect(game.p1.hand()).toContain("knight");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — unanswered, Star-Crossed returns BOTH units to their owners' hands", async () => {
    const game = await board().build();
    await game.p2.cast("sc", { targets: ["pawn", "knight"] });
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.p2.hand()).toContain("pawn");
    expect(game.zoneOf("knight")).toBe("hand");
    expect(game.p1.hand()).toContain("knight");
  });
});
