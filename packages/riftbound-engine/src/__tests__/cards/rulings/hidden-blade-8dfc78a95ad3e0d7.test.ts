/**
 * Ruling 8dfc78a95ad3e0d7 — Hidden Blade (OGN-213 → ogn-213-298) · Spell · Order · 2+[order] · [Hidden] [Action]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear "If a friendly unit would die, kill this instead. Heal that unit,
 *     exhaust it, and recall it."   (Repeat supplied here by Temporal Portal sfd-078-221: "next spell … [Repeat] equal to its cost")
 *
 * Q: Hidden Blade with Repeat, choosing the SAME unit for both executions — does its controller draw 4?
 * A: Only if the unit is still a legal target (a unit at a battlefield) for the second execution. Normally the first
 *    execution kills it, so the second finds no unit / no controller → only 2 cards. Two different valid units → 2 + 2.
 *    If a replacement (Zhonya's) saves it but recalls it to base, it is no longer "at a battlefield" for execution two →
 *    no second draw (judge's note: replacement interaction not fully verified).
 * Rules: 820.1.d / 820.2 (Repeat: execute again, choices per execution), 359.3.e.6 (missing target → instruction ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const ZHONYAS = "ogn-077-298";
const TEMPORAL_PORTAL = "sfd-078-221";

/** P1's turn: Portal ready, Hidden Blade in hand, [4] + 3 order (= Portal's [rainbow] + 2+[order] + Repeat 2+[order]). P2's X and Y (3 each) at P2's bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "X" }, "x")
    .unit(P2, "bf1", { might: 3, name: "Y" }, "y")
    .gear(P1, TEMPORAL_PORTAL, "portal")
    .hand(P1, HIDDEN_BLADE, "hb");
}

/** Activate the Portal so the next spell has Repeat; returns P2's deck size for draw accounting. */
async function portalUp(game: Game): Promise<number> {
  await game.p1.activate("portal");
  await game.settle();
  expect(game.state("portal").isExhausted).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 2 } });
  expect(game.p1.option("cast", "hb")?.fields.find((f) => f.arg === "repeat")?.options).toEqual([1]);
  return game.p2.deck().length;
}

const drawnBy2 = (game: Game, deckBefore: number) => deckBefore - game.p2.deck().length;

describe("Ruling 8dfc78a95ad3e0d7 — repeated Hidden Blade on the same unit draws 4 only if the unit is still a legal target the second time", () => {
  test("baseline (no Repeat): kill X, its controller P2 draws 2", async () => {
    const game = await board().build();
    const deck0 = game.p2.deck().length;
    await game.p1.cast("hb", { targets: ["x"] });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(drawnBy2(game, deck0)).toBe(2);
  });

  test("Repeat paid (full cost again) with X as the target of BOTH executions: execution 1 kills X and P2 draws 2; execution 2 finds no X at a battlefield → no kill, NO further draw — P2 drew 2, not 4", async () => {
    const game = await board().build();
    const deck0 = await portalUp(game);
    await game.p1.cast("hb", { repeat: 1, targets: ["x"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // 2+[order] twice
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hb", targets: ["x"] })]);
    await game.settle();
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("y")).toBe("battlefield-bf1"); // the second execution did not wander to another unit
    expect(drawnBy2(game, deck0)).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  // Expected (820.1.d.1): each execution kills its own valid target and "its controller draws 2" → P2 draws 4.
  // Actual: both X and Y die but P2 draws 0.
  test("ruling 8dfc78a95ad3e0d7 — with two DIFFERENT valid targets the engine kills both but P2 draws 0 instead of 2 + 2", async () => {
    const game = await board().build();
    const deck0 = await portalUp(game);
    await game.p1.cast("hb", { repeat: 1, targets: ["x", "y"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("y")).toBe("trash");
    expect(drawnBy2(game, deck0)).toBe(4);
  });

  // Expected: Zhonya's replaces X's first death (X healed, exhausted, recalled to BASE; P2 still draws 2 for execution 1);
  // execution 2 needs "a unit at a battlefield" — X is in base → nothing happens, no second draw → total 2.
  // Actual: the engine draws 2 again for the second execution (total 4) although X sits in base.
  test("ruling 8dfc78a95ad3e0d7 — X saved to base by Zhonya's is no longer at a battlefield, yet the engine still draws for execution two", async () => {
    const game = await board().gear(P2, ZHONYAS, "zh").build();
    const deck0 = await portalUp(game);
    await game.p1.cast("hb", { repeat: 1, targets: ["x"] });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash"); // killed instead
    expect(game.zoneOf("x")).toBe("base");
    expect(game.state("x")).toMatchObject({ damage: 0, isExhausted: true });
    expect(drawnBy2(game, deck0)).toBe(2);
  });
});
