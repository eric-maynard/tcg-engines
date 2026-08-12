/**
 * Ruling 2eb3a45a23191e38 — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Mind · 7 Might
 *     "When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Grand Strategem (OGN-233 → ogn-233-298) · [Action] · "Give friendly units +5 [Might] this turn."
 *
 * Q: If I play the Watcher and my opponent plays Grand Strategem, do the -3 still apply to their 1-Might
 *    tokens (6 → 3)?
 * A: Order decides. Buff FIRST: the tokens are at 6 when the Watcher resolves, so -3 takes them to 3.
 *    Watcher FIRST: they are already at the minimum of 1, so the reduction snapshots to nothing, and the
 *    later +5 lifts them all the way to 6.
 * Rules: 611 (continuous Might modification), 359 (values fixed on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const GRAND_STRATEGEM = "ogn-233-298";

/**
 * P1's turn. P2 keeps two 1-Might minions at home. bf2 is empty and uncontrolled, so P1 can open a
 * NON-combat showdown there — the window in which P2's [Action] Grand Strategem is castable.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 1 } })
    .resources(P2, { energy: 6, power: { order: 3 } })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 1, name: "Tok A" }, "tokA")
    .unit(P2, "base", { might: 1, name: "Tok B" }, "tokB")
    .hand(P1, WATCHER, "watcher")
    .hand(P2, GRAND_STRATEGEM, "gs");
}

/** P1 walks the Scout into the empty bf2 — a non-combat showdown where P2 may act at [Action] speed. */
async function openNonCombatShowdown(game: Game): Promise<void> {
  await game.p1.move("scout", "bf2");
  expect(game.decision()).toMatchObject({ context: "showdown" });
  await game.p1.passFocus();
  expect(game.p2.can("cast", "gs")).toBe(true);
  await game.p2.cast("gs");
  await game.settle();
}

describe("Ruling 2eb3a45a23191e38 — Watcher vs Grand Strategem: the resolution order decides", () => {
  test("BUFF FIRST: the minions are at 6 when the Watcher lands, so they end on 3", async () => {
    const game = await board().build();
    await openNonCombatShowdown(game);
    expect(game.state("tokA").might).toBe(6);
    await game.p1.play("watcher");
    await game.settle();
    expect(game.state("tokA").might).toBe(3);
    expect(game.state("tokB").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("WATCHER FIRST: 1-Might minions are already at the clamp, so the -3 snapshots to nothing", async () => {
    const game = await board().build();
    await game.p1.play("watcher");
    await game.settle();
    expect(game.state("tokA").might).toBe(1);
    expect(game.state("tokB").might).toBe(1);
  });

  test("…and the later +5 then lifts them the whole way to 6 (the spent reduction never comes back)", async () => {
    const game = await board().build();
    await game.p1.play("watcher");
    await game.settle();
    await openNonCombatShowdown(game);
    expect(game.state("tokA").might).toBe(6);
    expect(game.state("tokB").might).toBe(6);
    expect(game.violations()).toEqual([]);
  });
});
