/**
 * Ruling 6953f0436b94925e — Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] · "Counter a spell that costs no more than [4] and no more
 *     than [rainbow]."
 *   × First Mate (OGN-132 → ogn-132-298) · Unit · [3] · 3 Might · "When you play me, ready another unit."
 *
 * Q: Can you Defy First Mate?
 * A: No. Defy counters SPELLS on the chain. A unit enters the board directly and is never a spell on the chain; its "When you play me"
 *    trigger does go on the chain and can be reacted to, but it is an ability, not a spell — nothing in the game counters abilities.
 * Rules: 412 (Counter targets spells), 419.4 (permanents are not chain-resolved spells), 383 (triggered ability as a chain item), 337.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const FIRST_MATE = "ogn-132-298";

/** P1's turn with [3]: First Mate in hand, an EXHAUSTED 2-Might Rower in base. P2 holds Defy with [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Rower" }, "rower", { exhausted: true })
    .hand(P1, FIRST_MATE, "mate")
    .hand(P2, DEFY, "defy");
}

/** Play First Mate (3 ≤ 4, no power — squarely inside Defy's limits IF it were a spell), aiming its trigger at the Rower. */
async function playMate(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("mate");
  expect(game.p1.energy()).toBe(0);
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("rower");
  }
  return game;
}

describe("Ruling 6953f0436b94925e — First Mate cannot be Defied: the unit never sits on the chain, and its trigger is not a spell", () => {
  test("First Mate is on the board immediately; the only chain item is his triggered ability (not a spell card)", async () => {
    const game = await playMate();
    expect(game.zoneOf("mate")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mate", controller: P1, triggered: true })]);
    expect(game.chain().every((c) => c.triggered)).toBe(true);
    expect(game.state("rower").isExhausted).toBe(true); // not readied yet — the trigger is still pending
  });

  test("P2 does get priority to react to that trigger — but Defy has no legal target: it is not castable and an attempt is rejected", async () => {
    const game = await playMate();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(false);
    const r = await game.p2.try((p) => p.cast("defy", { targets: "mate" }));
    expect(r.ok).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.zoneOf("defy")).toBe("hand");
  });

  test("so the trigger resolves: the Rower is readied, First Mate stays, Defy is still in P2's hand", async () => {
    const game = await playMate();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("mate")).toBe("base");
    expect(game.state("rower").isReady).toBe(true);
    expect(game.p2.hand()).toContain("defy");
    expect(game.violations()).toEqual([]);
  });
});
