/**
 * Ruling 6ccba74d49f06c83 — Ruin Runner (SFD-105 → sfd-105-221) · 5 Might "I can't be chosen by enemy spells and abilities."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · [7][mind] · 7 Might "[Accelerate] When you play me, give enemy units
 *     -3 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Does Ruin Runner get -3 Might when Thousand-Tailed Watcher is played?
 * A: Yes. The Watcher's ability doesn't CHOOSE units — it affects all enemy units — so Ruin Runner's protection doesn't apply:
 *    5 → 2 (never below 1). Only units already on the board when the ability resolves are affected; it lasts this turn.
 * Rules: 355 (choosing = targeting; non-targeted global effects bypass "can't be chosen"), floor "to a minimum of 1".
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUIN_RUNNER = "sfd-105-221";
const WATCHER = "ogn-116-298";
/** A 0-cost [Reaction] unit for P2, so P2 can put a unit onto the board on P1's turn (before / after the ability resolves). */
const LATECOMER = {
  abilities: [{ keyword: "Reaction", type: "keyword" }],
  cardType: "unit",
  energyCost: 0,
  keywords: ["Reaction"],
  might: 4,
  name: "Latecomer",
} as const;
/** A 0-cost P1 spell whose only job is to open a chain later in the turn. */
const SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Spark",
  timing: "action",
} as const;

/** P1's turn with exactly [7][mind]. P2: Ruin Runner (5) at bf1, a 2-Might Squire in base. P1 also has a friendly 3-Might Ally. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", RUIN_RUNNER, "runner")
    .unit(P2, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .hand(P1, WATCHER, "watcher")
    .hand(P2, LATECOMER, "late")
    .hand(P1, SPARK, "spark");
}

async function watcherPlayed(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("watcher", { accelerate: false });
  expect(game.zoneOf("watcher")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling 6ccba74d49f06c83 — Thousand-Tailed Watcher's untargeted -3 hits Ruin Runner", () => {
  test("the play ability chooses nothing: no target prompt for P1 and no targets on the chain item (so 'can't be chosen' has nothing to stop)", async () => {
    const game = await watcherPlayed();
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    expect(game.state("runner").might).toBe(5); // not yet resolved
  });

  test("on resolution every enemy unit drops: Ruin Runner 5 → 2, the Squire 2 → 1 (minimum 1); P1's own units are untouched", async () => {
    const game = await watcherPlayed();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("runner")).toMatchObject({ baseMight: 5, might: 2 });
    expect(game.state("squire")).toMatchObject({ baseMight: 2, might: 1 });
    expect(game.state("ally").might).toBe(3);
    expect(game.state("watcher").might).toBe(7);
    expect(game.violations()).toEqual([]);
  });

  test("timing (before): a unit P2 Reaction-plays in RESPONSE to the ability is on the board when it resolves — it is reduced too (4 → 1)", async () => {
    const game = await watcherPlayed();
    await game.p1.passPriority();
    expect(game.p2.can("play", "late")).toBe(true);
    await game.p2.play("late", { to: "base" });
    await game.settle();
    expect(game.state("late").might).toBe(1);
    expect(game.state("runner").might).toBe(2);
  });

  test("timing (after): a unit P2 puts onto the board AFTER the ability resolved is not reduced; and the reduction wears off at end of turn (Runner back to 5)", async () => {
    const game = await watcherPlayed();
    await game.settle();
    expect(game.state("runner").might).toBe(2);
    // Later this turn P1 opens a chain (Spark at its own Ally); P2 Reaction-plays the Latecomer in that window.
    await game.p1.cast("spark", { targets: "ally" });
    await game.p1.passPriority();
    await game.p2.play("late", { to: "base" });
    await game.settle();
    expect(game.state("late").might).toBe(4); // arrived after resolution: untouched
    expect(game.state("runner").might).toBe(2); // still reduced this turn
    await game.advanceTurn(); // → P2's turn: "this turn" is over
    expect(game.state("runner").might).toBe(5);
    expect(game.state("squire").might).toBe(2);
    expect(game.state("late").might).toBe(4);
  });
});
