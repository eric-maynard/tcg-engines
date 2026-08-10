/**
 * Ruling 14c894f0b8560c70 — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · [7]+[mind] · 7 Might
 *     "[Accelerate] … When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Grand Strategem (OGN-233 → ogn-233-298) — cited as working the same way.
 *
 * Q: Is Watcher's -3 retroactive/continuous, or a snapshot?
 * A: Snapshot. It hits only enemy units in play as it resolves; units entering afterwards (including
 *    Hidden units, which are not in play) are unaffected; a later buff on an affected unit just adds to
 *    its current Might — no recalculation.
 * Rules: 358 (one-shot effect applied on resolution), 811 (a facedown card is not a unit in play), layers note.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const DISCIPLINE = "ogn-058-298"; // Reaction [2]: "Give a unit +2 [Might] this turn. Draw 1."

/** Inline 1-cost action spell "draw 1" — opens a chain so P2 gets a Reaction window on P1's turn. */
const PING = { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 1, name: "Ping", timing: "action" };
/** Inline 4-Might Hidden unit with no other text — a unit that enters play AFTER Watcher resolved. */
const LURKER = { abilities: [{ keyword: "Hidden", type: "keyword" }], domain: "mind", energyCost: 2, keywords: ["Hidden"], might: 4, name: "Lurker" };

/**
 * P1's turn with [8]+[mind] (Watcher 7 + Ping 1). P2: 5-Might Big at bf1, 2-Might Small in base, a facedown
 * 4-Might Lurker hidden at bf1, Discipline in hand with exactly [2].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { mind: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
    .unit(P2, "base", { might: 2, name: "Small" }, "small")
    .facedown(P2, "bf1", LURKER, "lurker")
    .hand(P1, WATCHER, "watcher")
    .hand(P1, PING, "ping")
    .hand(P2, DISCIPLINE, "discipline");
}

async function watcherResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("watcher");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", triggered: true })]);
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("watcher")).toBe("base");
  return game;
}

/** P1 casts Ping and passes so P2 may react on P1's turn. */
async function openReactionWindow(game: Game): Promise<void> {
  await game.p1.cast("ping");
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling 14c894f0b8560c70 — Thousand-Tailed Watcher's -3 is a snapshot, not a continuous effect", () => {
  test("on resolution every enemy unit IN PLAY gets -3 (min 1): Big 5→2, Small 2→1; the facedown Lurker is untouched (not in play)", async () => {
    const game = await watcherResolved();
    expect(game.state("big").might).toBe(2);
    expect(game.state("small").might).toBe(1);
    expect(game.zoneOf("lurker")).toBe("facedown-bf1");
    expect(game.state("lurker").might).toBe(4);
    expect(game.state("watcher").might).toBe(7); // friendly units unaffected
  });

  test("a unit that enters play AFTER Watcher resolved (Lurker played from facedown later this turn) keeps its full 4 Might", async () => {
    const game = await watcherResolved();
    await openReactionWindow(game);
    expect(game.p2.can("reveal", "lurker")).toBe(true);
    await game.p2.reveal("lurker");
    expect(game.zoneOf("lurker")).toBe("battlefield-bf1");
    expect(game.state("lurker").might).toBe(4);
    await game.settle();
    expect(game.state("lurker").might).toBe(4);
    expect(game.state("big").might).toBe(2); // still reduced this turn
    expect(game.violations()).toEqual([]);
  });

  test("buffing an affected unit afterwards simply adds to its current Might — Discipline on Big: 2 + 2 = 4 (no retroactive recalculation)", async () => {
    const game = await watcherResolved();
    await openReactionWindow(game);
    await game.p2.cast("discipline", { targets: "big" });
    await game.settle();
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("big").might).toBe(4);
    expect(game.state("small").might).toBe(1);
  });

  test("the reduction lasts only this turn: next turn Big is 5 and Small is 2 again", async () => {
    const game = await watcherResolved();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("big").might).toBe(5);
    expect(game.state("small").might).toBe(2);
  });
});
