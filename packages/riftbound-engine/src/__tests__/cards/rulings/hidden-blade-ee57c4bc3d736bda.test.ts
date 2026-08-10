/**
 * Ruling ee57c4bc3d736bda — Hidden Blade (OGN-213 → ogn-213-298) · [2]+[order] · [Hidden] [Action]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Gust (OGN-169 → ogn-169-298) · [1] · [Reaction] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: I Hidden-Blade my OWN unit (to draw 2); the opponent chains Gust and bounces it. Do I still draw 2?
 * A: No. On resolution Hidden Blade rechecks its target; the unit is no longer at a battlefield ⇒ illegal target, and every
 *    reference to it ("its controller") yields nothing — no kill, and NOBODY draws. No last-known-information is used.
 * Rules: 359.3.e.5 (illegal target ⇒ instruction not performed), 359.3.e.6 (dependent references return null), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const GUST = "ogn-169-298";

/** P1's turn, [2]+[order], Hidden Blade in hand; P1's own Pawn (2) at P1's bf1 beside a Holder. P2 has Gust + [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .unit(P1, "bf1", { might: 5, name: "Holder" }, "holder")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, GUST, "gust")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

async function bladeOwnPawn(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("blade", { targets: "pawn" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["pawn"] })]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling ee57c4bc3d736bda — Hidden Blade on your own unit draws nothing if the unit is Gusted away first", () => {
  test("control: unopposed, Hidden Blade kills P1's own Pawn and P1 (its controller) draws 2", async () => {
    const game = await bladeOwnPawn();
    await game.p2.passPriority();
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.zoneOf("blade")).toBe("trash");
  });

  test("P2 chains Gust on the Pawn: LIFO — Gust bounces it to P1's hand; Hidden Blade then resolves against an illegal target: no kill, and NO player draws (not P1 via 'its controller', not P2)", async () => {
    const game = await bladeOwnPawn();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "pawn" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "gust"]);
    const p2Hand = game.p2.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.p1.hand()).toEqual(["pawn"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]); // Blade still to resolve
    await game.settle(); // Blade resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash"); // resolved (not countered), just did nothing
    expect(game.zoneOf("pawn")).toBe("hand"); // still exists as an object with a controller — irrelevant: no LKI
    expect(game.p1.hand()).toEqual(["pawn"]); // no "draws 2"
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.p2.hand()).toHaveLength(p2Hand); // the opponent draws nothing either
    expect(game.zoneOf("holder")).toBe("battlefield-bf1"); // no re-targeting onto another unit
    expect(game.state("holder").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
