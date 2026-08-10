/**
 * Ruling 7effe5ed070b08ab — Skyfall of Areion (SFD-030 → sfd-030-221) · Equipment "[Equip] [1][fury]. My hold effects are also conquer
 *     effects, and vice versa."
 *   × Trinity Force (SFD-115 → sfd-115-221) · Equipment "[Equip] [body]. When I hold, score 1 point."
 *
 * Q: I'm at 7 points (of 8). I conquer only ONE battlefield with a unit wearing both Skyfall of Areion and Trinity Force. Do I win?
 * A: Yes. The conquer's own point is replaced by drawing a card (final-point rule: you'd have to score every battlefield), so you
 *    stay at 7 — but Skyfall makes Trinity Force's "When I hold, score 1 point" also a conquer effect. That trigger goes on the
 *    chain, resolves, and scores the 8th point; points from triggered abilities are not subject to the final-point restriction,
 *    so you win immediately.
 * Rules: 466.1.b.2 / 448.1.b.2 (final point from conquering → draw instead), 464 (conquer), Skyfall/Trinity Force text, 101 (win at
 *        the victory score).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SKYFALL = "sfd-030-221";
const TRINITY_FORCE = "sfd-115-221";

/**
 * P1's turn at 7 of 8 points. bf1 is open; bf2 is P2's (guarded) — so P1 cannot have "scored every battlefield" this turn.
 * P1's Bearer (2) in base wears BOTH Trinity Force and Skyfall (2 + 2 + 2 = 6).
 */
function board(p1Points = 7) {
  return scenario()
    .victoryScore(8)
    .points(P1, p1Points)
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 2, name: "Bearer" }, "bearer", { equippedWith: ["tf", "sky"] })
    .card("tf", { def: TRINITY_FORCE, meta: { attachedTo: "bearer" }, owner: P1, zone: "base" })
    .card("sky", { def: SKYFALL, meta: { attachedTo: "bearer" }, owner: P1, zone: "base" })
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Bearer walks onto the open bf1 and both players pass Focus → the conquer happens; stop before any trigger resolves. */
async function conquerBf1(game: Game): Promise<void> {
  expect(game.state("bearer").attachments.toSorted()).toEqual(["sky", "tf"]);
  expect(game.state("bearer").might).toBe(6);
  await game.p1.move("bearer", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
}

describe("Ruling 7effe5ed070b08ab — at 7/8, one conquer with Trinity Force + Skyfall wins: the conquer point becomes a draw, TF's trigger scores the 8th", () => {
  test("the conquer itself does NOT score the final point (bf2 unscored this turn): P1 stays at 7 and draws a card instead — and TF's hold-effect-as-conquer-effect trigger is now on the chain", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await conquerBf1(game);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // drew d1 instead of scoring
    expect(game.p1.hand()).toContain("d1");
    expect(game.isOver()).toBe(false);
    const trig = game.chain().filter((c) => c.triggered && c.controller === P1);
    expect(trig).toHaveLength(1);
    expect(["tf", "bearer", "sky"]).toContain(trig[0]?.cardId as string);
  });

  test("that trigger resolves and scores 1 → 8 points: P1 wins immediately (trigger points bypass the final-point restriction)", async () => {
    const game = await board().build();
    await conquerBf1(game);
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control — Trinity Force WITHOUT Skyfall: its effect is hold-only, so the lone conquer at 7 just draws a card; 7 points, no win", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 2, name: "Bearer" }, "bearer", { equippedWith: ["tf"] })
      .card("tf", { def: TRINITY_FORCE, meta: { attachedTo: "bearer" }, owner: P1, zone: "base" })
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("bearer", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.isOver()).toBe(false);
  });

  test("control — not the final point (P1 at 5): the same conquer scores normally (5 → 6) AND TF-via-Skyfall adds one more (→ 7); no card drawn for the conquer", async () => {
    const game = await board(5).build();
    const hand0 = game.p1.hand().length;
    await conquerBf1(game);
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.isOver()).toBe(false);
  });
});
