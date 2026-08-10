/**
 * Ruling aaa36d9af98252e6 — Sun Disc (OGN-021 → ogn-021-298) · Gear [2][fury] · "[Exhaust]: [Legion] — The next unit you play this turn
 *   enters ready."   × Royal Guard (SFD-157 → sfd-157-221) · 2 Might [4] · "When you play me, play a 2 [Might] Sand Soldier unit token here."
 *
 * Q: If I exhaust Sun Disc first and then play Royal Guard, does the Sand Soldier enter ready?
 * A: No. Royal Guard is "the next unit you play" — IT enters ready and consumes the effect; the Sand Soldier played by its trigger
 *    afterwards enters exhausted as normal. Sun Disc isn't a Reaction, so there is no window to use it between the Guard and its
 *    token. (Legion must already be on: another card played earlier this turn.)
 * Rules: 812 (Legion), 383.4.a (play effects trigger after the unit entered), one-shot "next unit … enters ready", 140.5 (units
 *        enter exhausted by default), 336–337 (closed state: Reactions only).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SUN_DISC = "ogn-021-298";
const ROYAL_GUARD = "sfd-157-221";
const WARMUP = { cardType: "unit", energyCost: 1, might: 1, name: "Warmup" } as const;

/** Turn 3, P1's turn with [5]: Sun Disc ready in base (played on an earlier turn), Warmup (1) + Royal Guard (4) in hand. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 5 })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, SUN_DISC, "disc")
    .hand(P1, WARMUP, "warmup")
    .hand(P1, ROYAL_GUARD, "guard");
}

function sandSoldiers(game: Game): string[] {
  return game.p1.units().filter((u) => game.state(u).name === "Sand Soldier");
}

/** Warmup (Legion on) → exhaust Sun Disc → play Royal Guard to base; everything settles. */
async function theLine(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("activate", "disc")).toBe(false); // Legion off: nothing played yet this turn
  await game.p1.play("warmup");
  await game.settle();
  expect(game.state("warmup").isExhausted).toBe(true); // ordinary units enter exhausted
  expect(game.p1.can("activate", "disc")).toBe(true);
  await game.p1.activate("disc");
  await game.settle();
  expect(game.state("disc").isExhausted).toBe(true);
  await game.p1.play("guard", { to: "base" });
  await game.settle();
  expect(game.p1.energy()).toBe(0);
  return game;
}

describe("Ruling aaa36d9af98252e6 — Sun Disc readies Royal Guard, not the Sand Soldier it makes", () => {
  test("Royal Guard is 'the next unit you play': it enters READY", async () => {
    const game = await theLine();
    expect(game.state("guard")).toMatchObject({ isReady: true, zone: "base" });
  });

  test("ruling: the Sand Soldier token played by the Guard's trigger enters EXHAUSTED (the one-shot was already consumed)", async () => {
    const game = await theLine();
    const soldiers = sandSoldiers(game);
    expect(soldiers).toHaveLength(1);
    const soldier = soldiers[0] as string;
    expect(game.state(soldier)).toMatchObject({ isExhausted: true, isReady: false, isToken: true, might: 2, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("no window: while Royal Guard's play trigger is pending, Sun Disc (not a Reaction) cannot be activated", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P2 })
      .gear(P1, SUN_DISC, "disc")
      .hand(P1, WARMUP, "warmup")
      .hand(P1, ROYAL_GUARD, "guard")
      .build();
    await game.p1.play("warmup");
    await game.settle();
    await game.p1.play("guard", { to: "base" });
    // Right after the Guard entered, its "play a Sand Soldier" item is on the chain (or being finalized): closed state.
    if (game.chain().length > 0) {
      expect(game.chain()[0]).toMatchObject({ cardId: "guard", triggered: true });
      expect(game.p1.can("activate", "disc")).toBe(false);
      expect((await game.p1.try((p) => p.activate("disc"))).ok).toBe(false);
    }
    await game.settle();
    expect(game.state("guard").isExhausted).toBe(true); // no Sun Disc used before it
    expect(sandSoldiers(game).map((s) => game.state(s).isExhausted)).toEqual([true]);
    expect(game.state("disc").isReady).toBe(true);
  });

  test("Legion note: exhausting Sun Disc is impossible as the very first action of the turn (no other card played yet)", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "disc")).toBe(false);
    expect((await game.p1.try((p) => p.activate("disc"))).ok).toBe(false);
    expect(game.state("disc").isReady).toBe(true);
  });
});
