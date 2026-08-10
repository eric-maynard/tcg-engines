/**
 * Ruling b0adb41b224aa4fc — Bellows Breath (SFD-080 → sfd-080-221) [Action] [1][mind] "Deal 1 to up to three units at the same location."
 *   × Smoke and Mirrors (UNL-083 → unl-083-219) [Hidden][Action] "Choose a unit you control and another unit you control at a different
 *     location. If at least one of them has [Temporary], move each to the other's location. Draw 1."  (+ Sprite token ogn-274-298 as the
 *     [Temporary] unit.)
 *
 * Q: Bellows Breath targets my units; I react from Hidden with Smoke and Mirrors, swapping one targeted unit away. How does it resolve?
 * A: Smoke and Mirrors is a legal Reaction from face-down and resolves first (swap + draw 1). Bellows Breath does NOT fizzle — "same
 *    location" is a play-time restriction. Its caster picks ONE location among those where the original targets now are and deals 1 only
 *    to the original targets there; the unit swapped in (never targeted) takes nothing.
 * Rules: 811 (Hidden → Reaction), 355.5 (targeting checked on play), 355.11.b (original targets now split: affect those at one location).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const SMOKE_AND_MIRRORS = "unl-083-219";
const SPRITE = "ogn-274-298"; // 3 Might [Temporary] token

/**
 * Turn 3, P1's turn with exactly [1][mind] and Bellows Breath. P2 holds bf1 with a Sprite (Temporary, 3), B (2) and C (2), hid Smoke and
 * Mirrors there earlier, and has D (2) in base.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SPRITE, "sprite")
    .unit(P2, "bf1", { might: 2, name: "B" }, "b")
    .unit(P2, "bf1", { might: 2, name: "C" }, "c")
    .unit(P2, "base", { might: 2, name: "D" }, "d")
    .facedown(P2, "bf1", SMOKE_AND_MIRRORS, "smoke")
    .hand(P1, BELLOWS_BREATH, "bellows");
}

/** Bellows at Sprite+B+C → P1 passes → P2 flips Smoke and Mirrors swapping Sprite (bf1) with D (base) → both pass: the swap resolves. */
async function bellowsThenSmoke(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bellows", { targets: ["sprite", "b", "c"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bellows", controller: P1, targets: ["sprite", "b", "c"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "smoke")).toBe(true); // a Reaction from face-down, mid-chain
  await game.p2.reveal("smoke", { targets: ["sprite", "d"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["bellows", "smoke"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Smoke and Mirrors resolves (LIFO)
  return game;
}

/** Both pass again → Bellows Breath resolves and asks P1 which location's original targets to affect. */
async function toLocationChoice(game: Game): Promise<PickDecision> {
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "subset" });
  return d as PickDecision;
}

describe("Ruling b0adb41b224aa4fc — Smoke and Mirrors splits Bellows Breath's targets; the caster picks one location", () => {
  test("Smoke and Mirrors resolves first: the Sprite is now in P2's base, D stands at bf1, P2 drew 1 — and Bellows Breath is still pending with its ORIGINAL three targets", async () => {
    const pre = await board().build();
    const handBefore = pre.p2.hand().length;
    const game = await bellowsThenSmoke();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.locationOf("sprite")).toBe("base");
    expect(game.locationOf("d")).toBe("bf1");
    expect(game.p2.hand()).toHaveLength(handBefore + 1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bellows", targets: ["sprite", "b", "c"] })]);
    expect(game.state("sprite").damage + game.state("b").damage + game.state("c").damage).toBe(0);
  });

  test("Bellows Breath does not fizzle: on resolution P1 is asked to choose among the ORIGINAL targets at one location (Sprite | B, C) — D is not on offer, and mixing locations is rejected", async () => {
    const game = await bellowsThenSmoke();
    const d = await toLocationChoice(game);
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["b", "c", "sprite"]);
    const mixed = await game.p1.try((p) => p.pick("sprite", "b"));
    expect(mixed.ok).toBe(false);
    expect(game.zoneOf("bellows")).not.toBe("trash"); // still resolving, awaiting a legal choice
  });

  test("choosing the battlefield: B and C take 1 each; the Sprite (moved to base) and D (swapped in, never targeted) take nothing", async () => {
    const game = await bellowsThenSmoke();
    await toLocationChoice(game);
    await game.p1.pick("b", "c");
    await game.settle();
    expect(game.zoneOf("bellows")).toBe("trash");
    expect(game.state("b").damage).toBe(1);
    expect(game.state("c").damage).toBe(1);
    expect(game.state("sprite").damage).toBe(0);
    expect(game.state("d").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("choosing the base instead: only the Sprite takes 1; B, C and D are untouched", async () => {
    const game = await bellowsThenSmoke();
    await toLocationChoice(game);
    await game.p1.pick("sprite");
    await game.settle();
    expect(game.zoneOf("bellows")).toBe("trash");
    expect(game.state("sprite").damage).toBe(1);
    expect(game.state("b").damage).toBe(0);
    expect(game.state("c").damage).toBe(0);
    expect(game.state("d").damage).toBe(0);
  });
});
