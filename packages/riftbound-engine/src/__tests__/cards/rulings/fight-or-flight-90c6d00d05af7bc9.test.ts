/**
 * Ruling 90c6d00d05af7bc9 — Fight or Flight (OGN-168 → ogn-168-298) × Find Your Center (OGN-047 → ogn-047-298)
 *
 *   Fight or Flight — Spell · Chaos · 2 · [Hidden] [Action]: "Move a unit from a battlefield to its base."
 *   Find Your Center — Spell · Calm · 3 · [Action]: "If an opponent's score is within 3 points of the Victory Score,
 *     this costs [2] less. Draw 1 and channel 1 rune exhausted."
 *
 * Q: Opponent moves into an uncontrolled, empty battlefield for their 6th point. I Fight-or-Flight the unit back to
 *    base. Do I get Focus again afterwards to play Find Your Center?
 * A: Yes. The showdown keeps going even with no units present; after Fight or Flight resolves Focus comes back around
 *    and you may play Find Your Center before the showdown closes.
 * Rules: 340–344 (a showdown ends only when all players pass Focus in succession), 341 (Focus rotation).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const FIND_YOUR_CENTER = "ogn-047-298";

/** P2's turn at 5 of 8 points. bf1 is open and empty. P2's Runner (3) ready in base. P1: 3 energy, FoF + FYC in hand. */
function board() {
  return scenario()
    .active(P2)
    .victoryScore(8)
    .points(P1, 0)
    .points(P2, 5)
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 3, name: "Runner" }, "runner")
    .hand(P1, FIGHT_OR_FLIGHT, "fof")
    .hand(P1, FIND_YOUR_CENTER, "fyc");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Runner walks onto empty bf1 (non-combat showdown), P2 passes Focus, P1 casts Fight or Flight on it and it resolves. */
async function bounceTheRunner(game: Game): Promise<void> {
  await game.p2.move("runner", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
  expect(showdown(game)?.isCombatShowdown).not.toBe(true);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "fof")).toBe(true);
  await game.p1.cast("fof", { targets: "runner" });
  expect(game.p1.energy()).toBe(1);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Fight or Flight resolves
  expect(game.zoneOf("fof")).toBe("trash");
  expect(game.zoneOf("runner")).toBe("base");
}

describe("Ruling 90c6d00d05af7bc9 — the showdown continues with no units, so Focus returns for Find Your Center", () => {
  test("after Fight or Flight empties bf1 the showdown is STILL open (nobody has passed in succession) — it is P2's Focus, not the end", async () => {
    const game = await board().build();
    await bounceTheRunner(game);
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.points()).toBe(5); // nothing scored
  });

  test("P2 passes → P1 holds Focus again in the same showdown and Find Your Center is legal (discounted to [1]: P2 is within 3 of victory); it draws 1 and channels 1 rune exhausted", async () => {
    const game = await board().build();
    await bounceTheRunner(game);
    await game.p2.passFocus();
    expect(showdown(game)?.active).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "fyc")).toBe(true);
    const hand = game.p1.hand().length;
    const runes = game.p1.runes().length;
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBe(0); // 3 − 2 discount = 1 paid
    await game.settle();
    expect(game.zoneOf("fyc")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.p1.runes()).toHaveLength(runes + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    // The showdown then closes with bf1 unconquered; P2 stays on 5.
    expect(showdown(game)?.active).not.toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p2.points()).toBe(5);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
