/**
 * Ruling 190a55c1b7dabc06 — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · [7]+[mind] · 7 Might
 *     "[Accelerate] When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Shakedown (OGN-033 → ogn-033-298) · Reaction · [2]+[fury] · "Choose an enemy unit. Deal 6 to it unless its
 *     controller has you draw 2."
 *
 * Q: My opponent plays the Watcher — can I kill it with damage in response so its "When you play me" never happens?
 * A: No. The play trigger is already on the chain; you may respond (e.g. Shakedown) and the Watcher may die before
 *    the trigger resolves, but the trigger still resolves and applies. Abilities don't fizzle because their source
 *    left the board — only countering stops them.
 * Rules: 383 (triggered abilities become chain items independent of their source), 336–340 (LIFO, responses),
 *        359.3 (an ability resolves even if its source is gone).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const SHAKEDOWN = "ogn-033-298";
/** A 1-damage [Reaction] so Shakedown's 6 + 1 reaches the Watcher's 7 Might. */
const SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Spark",
  timing: "reaction",
} as const;

/**
 * P2's turn with exactly [7]+[mind]. P1: Bruiser (5) and Runt (2) in base — the "enemy units" of the trigger —
 * plus Shakedown + Spark in hand with [3]+[fury].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 7, power: { mind: 1 } })
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser")
    .unit(P1, "base", { might: 2, name: "Runt" }, "runt")
    .hand(P2, WATCHER, "watcher")
    .hand(P1, SHAKEDOWN, "shakedown")
    .hand(P1, SPARK, "spark");
}

/** P2 plays the Watcher; its play trigger is on the chain and P2 passes priority to P1. */
async function watcherPlayed(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("watcher");
  expect(game.zoneOf("watcher")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P2, triggered: true })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** Pass priority (either seat) until the chain shrinks below `len` or a non-action prompt appears. */
async function passUntilChainBelow(game: Game, len: number): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length >= len; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 190a55c1b7dabc06 — killing Thousand-Tailed Watcher in response does not stop its play trigger", () => {
  test("control (no response): the trigger resolves — Bruiser 5 → 2, Runt 2 → 1 (minimum 1), this turn only", async () => {
    const game = await watcherPlayed();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("bruiser").might).toBe(2);
    expect(game.state("runt").might).toBe(1);
    await game.advanceTurn();
    expect(game.state("bruiser").might).toBe(5);
    expect(game.state("runt").might).toBe(2);
  });

  test("P1 responds with Spark + Shakedown on the Watcher (both sit above the trigger); Shakedown's 'unless' is the Watcher's controller's (P2's) call — P2 takes the 6; Spark adds 1 → the Watcher dies with its trigger STILL on the chain", async () => {
    const game = await watcherPlayed();
    await game.p1.cast("spark", { targets: "watcher" });
    await game.p1.cast("shakedown", { targets: "watcher" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["watcher", "spark", "shakedown"]);
    await passUntilChainBelow(game, 3); // Shakedown resolves first (LIFO)
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 }); // "unless its controller has you draw 2" — P2 decides
    const dmg = d?.kind === "pick" ? d.options.find((o) => /deal 6/i.test(o.label)) : undefined;
    expect(dmg).toBeDefined();
    await game.p2.answer({ keys: [dmg!.key], kind: "pick" });
    expect(game.state("watcher").damage).toBe(6);
    expect(game.zoneOf("watcher")).toBe("base"); // 6 < 7: still alive
    await passUntilChainBelow(game, 2); // Spark resolves: 6 + 1 = 7 → lethal
    expect(game.zoneOf("watcher")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", triggered: true })]); // the trigger is still pending
  });

  test("…and that orphaned trigger still resolves in full: Bruiser 5 → 2, Runt 2 → 1, with the Watcher already in the trash", async () => {
    const game = await watcherPlayed();
    await game.p1.cast("spark", { targets: "watcher" });
    await game.p1.cast("shakedown", { targets: "watcher" });
    await passUntilChainBelow(game, 3);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const dmg = d?.kind === "pick" ? d.options.find((o) => /deal 6/i.test(o.label)) : undefined;
    await game.p2.answer({ keys: [dmg!.key], kind: "pick" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("watcher")).toBe("trash");
    expect(game.state("bruiser").might).toBe(2);
    expect(game.state("runt").might).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
