/**
 * Interaction: Noxus Hopeful (ogn-012-298) · Unit · Fury · 4 · 4 Might
 *     "[Legion] — I cost [2] less. (Get the effect if you've played another card this turn.)"
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1+[fury] · Action — "Deal 3 to a unit at a battlefield."
 *   × Defy        (ogn-045-298) · Spell · Calm · 1+[calm] · Reaction — "Counter a spell that costs no
 *     more than [4] and no more than [rainbow]."
 *
 * Rules: 812.1.b.1 / 812.1.c / 812.2 (Legion is active once a DIFFERENT card has been Finalized by you
 * this turn), 419.4.b (non-triggered "played a card" checks reference finalization — a spell countered by
 * Defy still turns Legion on; contrast 419.4.a.1 for triggers), 727.1 (dependent keyword), 356.1 (cost
 * modification applied when determining cost).
 *
 * Question: A has played nothing this turn. A plays Hextech Ray; B counters it with Defy. A then plays
 * Noxus Hopeful — 2 or 4?  → 2 (Ray was finalized). Contrast (i) Hopeful as the first card → 4;
 * (ii) only rune activations beforehand (no card played) → 4.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const NOXUS_HOPEFUL = "ogn-012-298";
const HEXTECH_RAY = "ogn-009-298";
const DEFY = "ogn-045-298";

/**
 * P1 (A) to act with 3 energy + 1 fury: Ray costs 1+[fury] leaving exactly 2 — enough for a
 * Legion-discounted Hopeful, not for a full-price one. P2 (B) holds Defy with 1 energy + 1 calm.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Ray Target" }, "foe")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, NOXUS_HOPEFUL, "hopeful")
    .hand(P2, DEFY, "defy");
}

/** A casts Ray at foe, B responds with Defy, everything resolves. */
async function rayGetsDefied() {
  const game = await board().build();
  expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
  await game.p1.cast("ray", { targets: "foe" });
  expect(game.chain().map((i) => i.cardId)).toEqual(["ray"]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "defy")).toBe(true);
  await game.p2.cast("defy", { targets: "ray" });
  expect(game.chain().map((i) => i.cardId)).toEqual(["ray", "defy"]);
  await game.settle();
  return game;
}

describe("Legion (Noxus Hopeful) after your spell was countered by Defy", () => {
  test("setup: Defy counters Hextech Ray — no damage dealt, both spells in trash, A left with exactly 2 energy", async () => {
    const game = await rayGetsDefied();
    expect(game.state("foe").damage).toBe(0);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.turnPlayer()).toBe(P1);
  });

  test("a countered spell was still PLAYED (finalized) — it counts toward A's cards played this turn (419.4.b)", async () => {
    const game = await rayGetsDefied();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
  });

  // Expected (812.1.c, 419.4.b): Ray was finalized → Legion active → Hopeful costs 4−2 = 2, which A can
  // afford with the 2 energy left; it enters base and A ends at 0 energy. Actual: the Legion
  // `cost-reduction` keyword effect is never consulted by the cost calculator — Hopeful still demands 4,
  // so with 2 energy the play is not legal.
  test("after the countered Ray, Noxus Hopeful costs 2 — playable with 2 energy, enters base, A ends at 0 (812.1.c, 419.4.b)", async () => {
    const game = await rayGetsDefied();
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "hopeful")).toBe(true);
    await game.p1.play("hopeful");
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("hopeful").might).toBe(4);
  });

  // Same expectation observed via the amount charged rather than affordability: with 4 available the
  // discounted play must leave 2 behind. Actual: the full 4 is charged (0 left).
  test("after the countered Ray, playing Hopeful from 4 energy charges only 2 (leaves 2)", async () => {
    const game = await rayGetsDefied();
    await game.p1.do("addResources", { energy: 2 });
    expect(game.p1.energy()).toBe(4);
    await game.p1.play("hopeful");
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("base");
    expect(game.p1.energy()).toBe(2);
  });

  test("contrast (i): Hopeful as the very FIRST card of the turn costs the full 4 — not playable with 3, playable with 4 leaving 0", async () => {
    const three = await scenario().resources(P1, { energy: 3 }).hand(P1, NOXUS_HOPEFUL, "hopeful").build();
    expect(three.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(three.p1.can("play", "hopeful")).toBe(false);
    const r = await three.p1.try((p) => p.play("hopeful"));
    expect(r.ok).toBe(false);
    expect(three.zoneOf("hopeful")).toBe("hand");

    const four = await scenario().resources(P1, { energy: 4 }).hand(P1, NOXUS_HOPEFUL, "hopeful").build();
    await four.p1.play("hopeful");
    await four.settle();
    expect(four.zoneOf("hopeful")).toBe("base");
    expect(four.p1.energy()).toBe(0); // Hopeful itself is not "another card"
  });

  test("contrast (ii): activating runes is not playing a card — after tapping 3 runes (3 energy) Hopeful is still 4 and unplayable", async () => {
    const game = await scenario().runes(P1, "fury", 4).hand(P1, NOXUS_HOPEFUL, "hopeful").build();
    await game.p1.tapRunes(3);
    expect(game.p1.energy()).toBe(3);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.can("play", "hopeful")).toBe(false);
    // A 4th rune makes it affordable at full price; all 4 energy is consumed.
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(4);
    await game.p1.play("hopeful");
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("base");
    expect(game.p1.energy()).toBe(0);
  });

  test("contrast: B's Defy (a card B played on A's turn) does not satisfy A's Legion — only YOUR finalized cards count", async () => {
    // A plays nothing (a Standard Move is not playing a card); B casts a Reaction on A's turn once
    // A's showdown gives B Focus (rule 316.5.b: B cannot act in A's Neutral Open State). A's count
    // stays 0 and Hopeful stays at 4.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "b-unit")
      .unit(P1, "base", { might: 1 }, "a-scout")
      .hand(P2, "ogn-058-298", "b-discipline") // Discipline: a Reaction B can play on A's turn
      .hand(P1, NOXUS_HOPEFUL, "hopeful")
      .build();
    await game.p1.move("a-scout", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("b-discipline", { targets: "b-unit" });
    await game.settle();
    expect(game.zoneOf("b-discipline")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.can("play", "hopeful")).toBe(false);
  });
});
