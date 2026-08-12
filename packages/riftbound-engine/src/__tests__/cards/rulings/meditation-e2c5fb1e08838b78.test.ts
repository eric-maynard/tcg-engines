/**
 * Ruling e2c5fb1e08838b78 — Meditation (OGN-048 → ogn-048-298) · [Reaction] [2]
 *   "As an additional cost to play this, you may exhaust a friendly unit. If you do, draw 2. Otherwise, draw 1."
 *   × a [Temporary] unit (Sprite, OGN-274 → ogn-274-298) — "Kill it at the start of its controller's Beginning Phase."
 *
 * Q: Can I react to my own [Temporary] unit's start-of-Beginning-Phase death trigger and exhaust that very unit
 *    to pay Meditation's additional cost, drawing 2?
 * A: Yes. The Awaken Phase readies the unit first; the [Temporary] trigger then goes on the chain (Closed state);
 *    with the unit now READY you may play Meditation as a Reaction and exhaust it as the additional cost.
 *    Meditation resolves first (draw 2), then the [Temporary] trigger resolves and the unit dies.
 * Rules: 315 (Awaken before Begin), 383 ([Temporary] at start of Beginning Phase), 309.1 (chain ⇒ Closed),
 *        356.2 (additional costs paid on play), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MEDITATION = "ogn-048-298";
const SPRITE = "ogn-274-298"; // 3-Might [Temporary] unit token

/**
 * P2's turn, about to end. P1 owns an EXHAUSTED [Temporary] Sprite in base, holds Meditation, and has three
 * channelled runes (pools empty at end of turn, so the energy for the Reaction is tapped in the window itself).
 */
function board() {
  return scenario()
    .active(P2)
    .runes(P1, "calm", 3)
    .unit(P1, "base", SPRITE, "sprite", { exhausted: true })
    .hand(P1, MEDITATION, "med");
}

/** End P2's turn and stop at P1's Beginning Phase with the [Temporary] trigger sitting on the chain. */
async function atTemporaryTrigger(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sprite").isExhausted).toBe(true);
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.chain().map((c) => c.cardId)).toContain("sprite");
  await game.p1.tapRunes(2); // [2] for Meditation, tapped inside the reaction window
  return game;
}

describe("Ruling e2c5fb1e08838b78 — Meditation reacts to a [Temporary] trigger and exhausts the just-readied unit", () => {
  test("Awaken readies the Sprite BEFORE the Beginning Phase puts its [Temporary] trigger on the chain", async () => {
    const game = await atTemporaryTrigger();
    expect(game.state("sprite").isExhausted).toBe(false); // readied in the Awaken Phase
    expect(game.zoneOf("sprite")).toBe("base"); // not dead yet — the trigger is only on the chain
    expect(game.chain()).toHaveLength(1);
  });

  test("with the trigger on the chain P1 may cast Meditation as a Reaction, exhausting the now-ready Sprite for the additional cost", async () => {
    const game = await atTemporaryTrigger();
    expect(game.p1.can("cast", "med")).toBe(true);
    const hand0 = game.p1.hand().length;
    await game.p1.cast("med", { payOptional: true, targets: "sprite" });
    expect(game.state("sprite").isExhausted).toBe(true); // paid while playing (356.2)
    expect(game.chain().map((c) => c.cardId)).toEqual(["sprite", "med"]); // Meditation on TOP
    expect(game.p1.energy()).toBe(0);
    expect(hand0).toBe(1);
  });

  test("LIFO: Meditation resolves first and draws 2, then the [Temporary] trigger resolves and the Sprite dies", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.cast("med", { payOptional: true, targets: "sprite" });
    const handAfterPlay = game.p1.hand().length; // 0
    await game.settle();
    // +2 from Meditation, +1 from this turn's own Draw Phase once the chain empties and the turn continues.
    expect(game.p1.hand()).toHaveLength(handAfterPlay + 2 + 1);
    expect(game.zoneOf("med")).toBe("trash");
    expect(game.zoneOf("sprite")).toBe("gone"); // the trigger still killed it afterwards (token ⇒ ceases to exist, 186.1)
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("declining the additional cost draws only 1 and leaves the Sprite ready (until the trigger kills it)", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.cast("med", { payOptional: false });
    expect(game.state("sprite").isExhausted).toBe(false);
    const handAfterPlay = game.p1.hand().length;
    await game.settle();
    // +1 from Meditation ("Otherwise, draw 1"), +1 from this turn's Draw Phase.
    expect(game.p1.hand()).toHaveLength(handAfterPlay + 1 + 1);
    expect(game.zoneOf("sprite")).toBe("gone");
  });
});
