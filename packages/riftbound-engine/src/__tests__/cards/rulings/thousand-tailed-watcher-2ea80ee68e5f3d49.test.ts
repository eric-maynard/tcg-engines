/**
 * Ruling 2ea80ee68e5f3d49 — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · 7 + [mind] · 7 Might
 *   "[Accelerate] — When you play me, give enemy units -3 [Might] this turn, to a minimum of 1."
 *
 * Q: If the opponent plays a Reaction-speed unit (or flips a hidden one) later in the same turn,
 *    does it also get the -3?
 * A: No. A triggered ability applies once, when it resolves, to the units that exist then. The set
 *    of affected units and the size of the modifier are fixed at that moment and are not updated
 *    afterwards. (A continuous STATIC ability — "units here get +1" — is what keeps updating.)
 * Rules: 359.3 (an ability applies as it resolves), 383.1 ("When you play me" is a triggered
 *        ability, not a static one), 703 (continuous effects from a one-shot fix their set at
 *        resolution), 811.1.c.3 (revealing a hidden card plays it).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THOUSAND_TAILED_WATCHER = "ogn-116-298";

/** A hidden 5-Might unit waiting at P2's battlefield. */
const LATECOMER = { cardType: "unit", energyCost: 2, might: 5, name: "Latecomer" } as const;

/** [Reaction] "Give a unit +1 [Might] this turn." — P1 uses it only to hand P2 a priority window. */
const NUDGE = {
  abilities: [
    { effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Nudge",
  rulesText: "[Reaction] Give a unit +1 [Might] this turn.",
  timing: "reaction",
} as const;

/**
 * Turn 3, P1's turn, [7][mind] for the Watcher. P2 holds bf1 with a 5-Might Old Guard and has a
 * facedown Latecomer (also 5 Might) there. P1 keeps a Nudge and a bystander of their own.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 7, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Old Guard" }, "old")
    .facedown(P2, "bf1", LATECOMER, "late")
    .unit(P1, "base", { might: 4, name: "Bystander" }, "mine")
    .hand(P1, THOUSAND_TAILED_WATCHER, "ttw")
    .hand(P1, NUDGE, "nudge");
}

/** Play the Watcher and let its trigger resolve. */
async function watcherDown(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("ttw");
  await game.settle();
  expect(game.zoneOf("ttw")).toBe("base");
  return game;
}

describe("Ruling 2ea80ee68e5f3d49 — the Watcher's -3 hits only the enemy units that exist when it resolves", () => {
  test("premise: the enemy already on the board takes the -3 (5 → 2); P1's own unit is untouched", async () => {
    const game = await watcherDown();
    expect(game.state("old")).toMatchObject({ might: 2, mightModifier: -3 });
    expect(game.state("mine")).toMatchObject({ might: 4, mightModifier: 0 });
  });

  test("ruling: a unit the opponent plays LATER in the same turn (a hidden flip) arrives at full Might — no -3 for it", async () => {
    const game = await watcherDown();
    // P1 opens a chain so P2 has a priority window to flip the hidden card.
    await game.p1.cast("nudge", { targets: "mine" });
    await game.p1.passPriority();
    expect(game.p2.can("revealHidden", "late")).toBe(true);
    await game.p2.reveal("late");
    await game.settle();
    expect(game.zoneOf("late")).toBe("battlefield-bf1");
    expect(game.state("late")).toMatchObject({ baseMight: 5, might: 5, mightModifier: 0 });
    // …while the unit that was there when the Watcher resolved is still at 2.
    expect(game.state("old")).toMatchObject({ might: 2, mightModifier: -3 });
    expect(game.violations()).toEqual([]);
  });

  test("the modifier lapses at end of turn, and the newcomer never had one to lose", async () => {
    const game = await watcherDown();
    await game.p1.cast("nudge", { targets: "mine" });
    await game.p1.passPriority();
    await game.p2.reveal("late");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("old")).toMatchObject({ might: 5, mightModifier: 0 });
    expect(game.state("late")).toMatchObject({ might: 5, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: an enemy already on a DIFFERENT battlefield when the Watcher resolved was caught too — it is 'enemy units', not 'enemy units here'", async () => {
    const game = await board()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 6, name: "Far Guard" }, "far")
      .build();
    await game.p1.play("ttw");
    await game.settle();
    expect(game.state("far")).toMatchObject({ might: 3, mightModifier: -3 });
    expect(game.state("old").might).toBe(2);
  });
});
