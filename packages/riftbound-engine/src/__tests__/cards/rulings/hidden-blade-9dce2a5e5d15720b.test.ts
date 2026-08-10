/**
 * Ruling 9dce2a5e5d15720b — Hidden Blade (OGN-213 → ogn-213-298) · Spell · Order · [2][order] · Action · [Hidden]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Flash (OGS-011 → ogs-011-024) · Spell · [2] · Reaction · "Move up to 2 friendly units to base."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · Unit · 2 Might · "When you play a spell, give me +1 [Might] this turn."
 *
 * Q: I Hidden Blade an enemy unit at a battlefield; they Flash it to base so it survives. Does the Hidden Blade still
 *    count as "played" for my Ravenbloom Student?
 * A: Yes. Flash resolves first and moves the unit; Hidden Blade then resolves and mistargets (no kill, no draw) — but a
 *    spell that finishes resolving IS played even if it did nothing, so "When you play a spell" triggers and the
 *    Student gets +1 [Might].
 * Rules: 359.3.e.10 (a resolved spell is "played" even with no legal targets), 355.9 (target legality rechecked on
 *        resolution), 383 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const FLASH = "ogs-011-024";
const RAVENBLOOM_STUDENT = "ogn-103-298";

/** P1's turn. P1: Ravenbloom Student (2) in base, Hidden Blade in hand with exactly [2][order]. P2: Target (4) at P2's bf1, Flash + [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P2, "bf1", { might: 4, name: "Target" }, "target")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, FLASH, "flash");
}

/** P1 casts Hidden Blade (from hand) at the Target and passes; P2 Flashes the Target home in response. */
async function bladeThenFlash(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("blade", { targets: "target" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("flash", { targets: "target" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flash"]);
  return game;
}

describe("Ruling 9dce2a5e5d15720b — a mistargeted Hidden Blade is still 'played' for Ravenbloom Student", () => {
  test("premise: the Student is 2 Might before anything happens", async () => {
    const game = await board().build();
    expect(game.state("student").might).toBe(2);
  });

  test("Flash resolves first (Target → P2's base); Hidden Blade then resolves and does nothing: no kill, its controller draws 0", async () => {
    const game = await bladeThenFlash();
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash"); // it resolved (was not countered)
    expect(game.zoneOf("target")).toBe("base");
    expect(game.p2.trash()).not.toContain("target");
    expect(game.p2.hand()).toHaveLength(p2Hand); // no "its controller draws 2"
    expect(game.zoneOf("student")).toBe("base"); // never a substitute victim
  });

  test("…and because Hidden Blade DID finish resolving it counts as played: Ravenbloom Student's 'When you play a spell' fires and it is 3 Might this turn", async () => {
    const game = await bladeThenFlash();
    await game.settle();
    expect(game.state("student")).toMatchObject({ might: 3, mightModifier: 1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
    // "this turn"
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2);
  });

  test("control — un-answered Hidden Blade: Target dies, P2 draws 2, and the Student likewise ends at 3", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "target" });
    await game.settle();
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.state("student").might).toBe(3);
  });
});
