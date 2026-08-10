/**
 * Ruling f52daeb4d5b89bfc — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] · 2+[order]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Retreat (OGN-104 → ogn-104-298) · [Reaction] · 1 · "Return a friendly unit to its owner's hand. Its owner channels 1 rune
 *     exhausted."
 *
 * Q: My unit is Hidden Bladed; I Retreat it in response. Do I still draw 2?
 * A: No. Retreat resolves first (LIFO) and returns the unit to hand; Hidden Blade then has no legal target on a battlefield,
 *    so nothing is killed and — with no "its controller" to identify — the linked draw is ignored.
 * Rules: 336/339 (LIFO), 359.3.e.5 (illegal target ⇒ instruction not performed), 359.3.e.14.a (dependent instruction ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const RETREAT = "ogn-104-298";

/**
 * P1's turn. P2 holds bf1 with its Scout (2). P1: Hidden Blade + exactly 2+[order]. P2: Retreat + exactly 1, a rune left in
 * its rune deck to channel, and a known main-deck top so any draw is visible.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { energyCost: 2, might: 2, name: "Scout" }, "scout")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, RETREAT, "retreat")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** P1 Hidden Blades the Scout; P1 passes; P2 Retreats the Scout in response. */
async function bladeThenRetreat(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("blade", { targets: "scout" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "retreat")).toBe(true);
  await game.p2.cast("retreat", { targets: "scout" });
  expect(game.p2.energy()).toBe(0);
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "retreat"]);
  return game;
}

describe("Ruling f52daeb4d5b89bfc — Retreating the Hidden Blade target: no kill, and NO draw 2", () => {
  test("baseline (no response): Hidden Blade kills the Scout and ITS CONTROLLER (P2) draws 2", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p2.hand()).toEqual(["retreat", "d1", "d2"]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
  });

  test("Retreat resolves first (LIFO): the Scout is back in P2's hand and P2 channels 1 rune exhausted — Hidden Blade still waits on the chain", async () => {
    const game = await bladeThenRetreat();
    const runesBefore = game.p2.runes().length;
    const readyBefore = game.p2.runes({ ready: true }).length;
    await game.p2.passPriority();
    await game.p1.passPriority(); // Retreat resolves
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p2.hand()).toContain("scout");
    expect(game.p2.runes().length).toBe(runesBefore + 1);
    expect(game.p2.runes({ ready: true }).length).toBe(readyBefore); // the channeled rune came in exhausted
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  });

  test("Hidden Blade then resolves with no legal target: nothing is killed and NOBODY draws — P2's hand is Scout only, deck untouched; P1 draws nothing either", async () => {
    const game = await bladeThenRetreat();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p2.trash()).toEqual(["retreat"]); // no Scout in the trash
    expect(game.p2.hand()).toEqual(["scout"]); // no d1/d2
    expect(game.p2.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // nothing refunded
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
