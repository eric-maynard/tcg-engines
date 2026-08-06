/**
 * Orb of Regret — ogn-090-298 · Gear · Mind · 1 energy
 *
 *   [Exhaust]: Give a unit -1 [Might] this turn, to a minimum of 1 [Might].
 *
 * Rule 151.2 — gear activated abilities: your Main Phase, Open State, not during showdowns.
 * Rule 317.2.c — "this turn" effects expire in the Ending Phase.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-090-298";

function board() {
  return scenario()
    .gear(P1, CARD, "orb")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3 }, "foe")
    .unit(P1, "base", { might: 1 }, "tiny")
    .unit(P1, "base", { might: 3 }, "ally");
}

/** Activate the Orb and answer the target prompt (asked up front or on resolution). */
async function shrink(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>, target: string) {
  await game.p1.activate("orb", 0, { answers: [target] });
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(target);
    await game.settle();
  }
}

describe("Orb of Regret (ogn-090-298)", () => {
  test("costs 1 energy to play; not playable with 0", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "orb").build();
    await game.p1.play("orb");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("orb")).toBe("base");
    const broke = await scenario().hand(P1, CARD, "orb").build();
    expect(broke.p1.can("play", "orb")).toBe(false);
  });

  test("[Exhaust]: activating exhausts the Orb and gives the chosen unit -1 Might (3 → 2)", async () => {
    const game = await board().build();
    expect(game.state("orb").isExhausted).toBe(false);
    await shrink(game, "foe");
    expect(game.state("orb").isExhausted).toBe(true);
    expect(game.state("foe").might).toBe(2);
    expect(game.state("ally").might).toBe(3);
  });

  test("cannot be activated again while exhausted", async () => {
    const game = await board().build();
    await shrink(game, "foe");
    expect(game.p1.can("activate", "orb")).toBe(false);
  });

  test("minimum of 1 Might: a 1-might unit stays at 1", async () => {
    const game = await board().build();
    await shrink(game, "tiny");
    expect(game.state("tiny").might).toBe(1);
  });

  test("'this turn': the penalty is gone after the turn ends", async () => {
    const game = await board().build();
    await shrink(game, "foe");
    expect(game.state("foe").might).toBe(2);
    await game.advanceTurn();
    expect(game.state("foe").might).toBe(3);
  });

  test("the -1 matters in combat: a 3-might attacker now beats the shrunken 3-might defender and survives", async () => {
    const game = await board().build();
    await shrink(game, "foe");
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1"); // took only 2
  });

  test("timing — not activatable on the opponent's turn (rule 151.2: your Main Phase only)", async () => {
    // Expected: on P2's turn P1's free menu has no activateAbility:orb. Actual: it is offered (and resolves).
    const theirs = await board().active(P2).build();
    expect(theirs.p1.can("activate", "orb")).toBe(false);
  });

  test("timing — a gear ability without [Action] is not activatable during a showdown (rule 151.2)", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("activate", "orb")).toBe(false);
  });
});
