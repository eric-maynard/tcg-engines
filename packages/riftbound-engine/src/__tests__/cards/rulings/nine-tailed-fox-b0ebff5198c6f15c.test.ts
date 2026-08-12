/**
 * Ruling b0ebff5198c6f15c — Nine-Tailed Fox (OGN-255 → ogn-255-298) · Legend (Ahri) · Calm/Mind
 *     "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Does Ahri's ability give -1 [Might] to ALL attacking units, or only to one of them?
 * A: It triggers separately for EACH enemy unit that attacks a battlefield she controls, and each trigger takes
 *    -1 off that one unit (never below 1). Two attackers ⇒ two triggered items on the chain, one per attacker;
 *    the wording "an enemy unit" is per unit, not "one of them".
 * Rules: 383.1 (one triggered item per occurrence of the event), 464.2 (attacker designation per unit),
 *        740 ("to a minimum of 1" caps the reduction), 359.2 (evaluated as it resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";

/**
 * P2's turn 3. P1's legend is the Nine-Tailed Fox and P1 holds bf1 with a stunned 1-Might Guard (deals no combat
 * damage, so nothing dies while we look at Might). P2 attacks out of base; a third P2 unit stays home.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .legend(P1, NINE_TAILED_FOX, "fox")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 1, name: "Guard" }, "guard", { stunned: true })
    .unit(P2, "base", { might: 3, name: "Brute" }, "brute")
    .unit(P2, "base", { might: 4, name: "Rogue" }, "rogue")
    .unit(P2, "base", { might: 1, name: "Runt" }, "runt")
    .unit(P2, "base", { might: 5, name: "Homebody" }, "homebody");
}

/** Drain the Fox triggers (accepting any trigger-order prompt, passing priority) and stop in the open showdown. */
async function settleTriggers(game: Game): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "order") {
      await game.acceptTriggerOrder();
      continue;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling b0ebff5198c6f15c — Nine-Tailed Fox triggers once PER attacking enemy unit, not once for the whole attack", () => {
  test("two enemy units attack the battlefield Ahri controls → TWO separate Fox triggers, both controlled by the Fox's player", async () => {
    const game = await board().build();
    await game.p2.move(["brute", "rogue"], "bf1");
    if (game.decision()?.kind === "order") {
      expect(game.decision()?.seat).toBe(P1);
      await game.acceptTriggerOrder();
    }
    const foxItems = game.chain().filter((c) => c.cardId === "fox" && c.triggered);
    expect(foxItems).toHaveLength(2);
    expect(foxItems.every((c) => c.controller === P1)).toBe(true);
  });

  test("…and both attackers end up -1: Brute 3 → 2 and Rogue 4 → 3 (the same -1 is not spent on just one of them)", async () => {
    const game = await board().build();
    await game.p2.move(["brute", "rogue"], "bf1");
    await settleTriggers(game);
    expect(game.state("brute").might).toBe(2);
    expect(game.state("rogue").might).toBe(3);
  });

  test("the unit that stayed in base never attacked, so it is untouched", async () => {
    const game = await board().build();
    await game.p2.move(["brute", "rogue"], "bf1");
    await settleTriggers(game);
    expect(game.state("homebody").might).toBe(5);
  });

  test("'to a minimum of 1': a 1-Might attacker in the same attack stays at 1 while its 3-Might partner still drops to 2", async () => {
    const game = await board().build();
    await game.p2.move(["brute", "runt"], "bf1");
    await settleTriggers(game);
    expect(game.state("runt").might).toBe(1);
    expect(game.state("brute").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("a battlefield Ahri does NOT control gives nothing: attacking the uncontrolled bf2 fires no Fox trigger", async () => {
    const game = await board().build();
    await game.p2.move(["brute", "rogue"], "bf2");
    expect(game.chain().filter((c) => c.cardId === "fox")).toEqual([]);
    await settleTriggers(game);
    expect(game.state("brute").might).toBe(3);
    expect(game.state("rogue").might).toBe(4);
  });
});
